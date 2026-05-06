// Painel de Controle — Sugestao de correcao via OpenAI.
//
// POST { pedido_id: string }
// Resposta: { diagnostico, sugestoes: [{ parcela_id, acao, justificativa, confianca, parametros? }], modelo, custo_cents, usage }
//
// Le pedido + parcelas + movs vinculadas usando o JWT do user (respeita RLS).
// Manda o contexto pro modelo e retorna sugestoes estruturadas. NUNCA aplica
// — o front mostra a sugestao e o user aprova com 1 clique (executa pelos
// helpers em src/lib/correcoes.ts, registrando audit_logs com agente='ia').
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const MODEL = Deno.env.get('OPENAI_SUGGEST_MODEL') ?? 'gpt-4o-mini'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Voce e um assistente de auditoria financeira para uma construtora.
Sua tarefa: dado um pedido de compra com suas parcelas e os debitos bancarios vinculados, identificar incoerencias e sugerir correcoes determinasticas.

Regras de diagnostico:
- "Saldo oculto no fluxo": parcela com movs vinculadas e (valor - valor_pago) > 0 e status != paga. O resido nao aparece no fluxo de caixa.
- "Sigma parcelas != valor do pedido": cobertura quebrada.
- "Baixa != extrato": valor_pago da parcela nao bate com soma das movs vinculadas.
- "Status dessincronizado": status='paga' mas valor_pago < valor, ou valor_pago > valor.

Acoes possiveis (chave string, exatamente como listado):
- reduzir_ao_pago: ajusta valor da parcela para valor_pago e marca paga. Use quando o pedido foi superestimado e o servico saiu mais barato.
- marcar_paga: iguala valor_pago ao valor e marca paga. Use quando o pagamento aconteceu mas a baixa nao foi registrada.
- sync_valor_pago_movs: atualiza valor_pago para soma das movs vinculadas. Use quando a baixa foi feita com valor errado.
- reabrir: zera valor_pago e volta para a vencer. Use APENAS em retrabalho (raramente).
- criar_residuo: divide a parcela: a origem fica com o que foi pago, e cria nova parcela com o saldo. Use quando se sabe que falta cobrar mas em data futura.
- aguardar: nenhuma acao agora. Use quando o saldo provavelmente sera pago em breve (padrao recente de movs).
- investigar: nao da pra decidir sozinho — pedir ajuda humana.

Pistas para escolher:
- Se as movs cessaram ha mais de 30 dias e cobriram a maior parte (>80%): provavel sobrecobranca → reduzir_ao_pago.
- Se ha movs muito recentes e padrao de pagamentos parciais: provavel parcelamento informal → aguardar ou criar_residuo.
- Se valor_pago = soma das movs com diferenca pequena (<5%): erro de digitacao → sync_valor_pago_movs.
- Se diferenca for centavos (<R$ 1): provavel arredondamento → marcar_paga.

Responda EXCLUSIVAMENTE em JSON valido seguindo este schema (sem markdown, sem comentarios):
{
  "diagnostico": "1-2 frases em portugues do que foi observado no pedido como um todo",
  "sugestoes": [
    {
      "parcela_id": "uuid",
      "parcela_label": "P1 contratual ou ADI 3 etc",
      "acao": "reduzir_ao_pago|marcar_paga|sync_valor_pago_movs|reabrir|criar_residuo|aguardar|investigar",
      "justificativa": "1-2 frases em portugues explicando o porque desta acao",
      "confianca": 0.0,
      "parametros": {}
    }
  ]
}

So inclua sugestoes para parcelas com problema. Se tudo estiver coerente, devolva sugestoes vazio com diagnostico "Sem inconsistencias".
`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    if (!OPENAI_KEY) {
      return jsonError(500, 'OPENAI_API_KEY nao configurada na edge function')
    }

    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return jsonError(401, 'sem JWT')

    const { pedido_id } = await req.json().catch(() => ({}))
    if (!pedido_id || typeof pedido_id !== 'string') {
      return jsonError(400, 'pedido_id obrigatorio')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    })

    const { data: pedido, error: errPed } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, valor_total_real, data_entrega_prevista, cond_pagamento, status, fornecedor_id, item_compra_id, observacoes')
      .eq('id', pedido_id)
      .maybeSingle()
    if (errPed) return jsonError(500, errPed.message)
    if (!pedido) return jsonError(404, 'pedido nao encontrado ou sem permissao')

    const { data: parcelas, error: errPar } = await supabase
      .from('parcelas')
      .select('id, numero_parcela, tipo, valor, valor_pago, data_vencimento, data_pagamento_real, status, descricao')
      .eq('pedido_id', pedido_id)
      .is('deleted_at', null)
      .order('numero_parcela', { ascending: true })
    if (errPar) return jsonError(500, errPar.message)

    const parcelaIds = (parcelas ?? []).map(p => p.id)
    const linkRows: any[] = []
    if (parcelaIds.length > 0) {
      const { data: links, error: errLinks } = await supabase
        .from('conciliacoes')
        .select('movimentacao_id, status, conciliacao_parcelas(parcela_id), movimentacoes_bancarias(id, data, descricao, valor)')
        .neq('status', 'rejeitado')
      if (errLinks) return jsonError(500, errLinks.message)
      linkRows.push(...(links ?? []))
    }

    const movsByParcela: Record<string, Array<{ data: string; descricao: string; valor: number }>> = {}
    for (const c of linkRows) {
      const mb = c.movimentacoes_bancarias
      if (!mb) continue
      for (const cp of (c.conciliacao_parcelas ?? [])) {
        if (!cp.parcela_id) continue
        if (!parcelaIds.includes(cp.parcela_id)) continue
        const arr = movsByParcela[cp.parcela_id] ?? []
        arr.push({ data: mb.data, descricao: mb.descricao || '—', valor: Math.abs(Number(mb.valor || 0)) })
        movsByParcela[cp.parcela_id] = arr
      }
    }

    let fornNome: string | null = null
    if (pedido.fornecedor_id) {
      const { data: f } = await supabase.from('fornecedores').select('nome').eq('id', pedido.fornecedor_id).maybeSingle()
      fornNome = f?.nome ?? null
    }

    const ctx = {
      pedido: {
        id: pedido.id,
        numero: pedido.numero_pedido,
        valor_total: Number(pedido.valor_total_real ?? 0),
        status: pedido.status,
        fornecedor: fornNome,
        data_entrega_prevista: pedido.data_entrega_prevista,
      },
      parcelas: (parcelas ?? []).map(p => ({
        id: p.id,
        numero: p.numero_parcela,
        tipo: p.tipo,
        valor: Number(p.valor),
        valor_pago: Number(p.valor_pago || 0),
        saldo: Number(p.valor) - Number(p.valor_pago || 0),
        data_vencimento: p.data_vencimento,
        data_pagamento_real: p.data_pagamento_real,
        status: p.status,
        movs: (movsByParcela[p.id] ?? []).sort((a, b) => a.data.localeCompare(b.data)),
        soma_movs: (movsByParcela[p.id] ?? []).reduce((s, m) => s + m.valor, 0),
      })),
      hoje: new Date().toISOString().slice(0, 10),
    }

    const userMsg = `Pedido com inconsistencias para auditar:\n\n${JSON.stringify(ctx, null, 2)}`

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!r.ok) {
      const txt = await r.text()
      return jsonError(502, `OpenAI ${r.status}: ${txt.slice(0, 500)}`)
    }
    const apiResp = await r.json()
    const text: string = (apiResp?.choices?.[0]?.message?.content ?? '').trim()
    const usage = apiResp?.usage ?? { prompt_tokens: 0, completion_tokens: 0 }

    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      const m = stripped.match(/\{[\s\S]*\}$/)
      if (m) parsed = JSON.parse(m[0])
      else return jsonError(502, `Resposta do modelo nao e JSON: ${text.slice(0, 200)}`)
    }

    // Custo USD aproximado para gpt-4o-mini ($0.15/M input, $0.60/M output).
    // Se trocar de modelo via env, este numero fica so como referencia.
    const custo_usd = ((usage.prompt_tokens / 1_000_000) * 0.15) + ((usage.completion_tokens / 1_000_000) * 0.60)

    return new Response(JSON.stringify({ ...parsed, modelo: MODEL, custo_usd, usage }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, (e as Error).message)
  }
})

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
