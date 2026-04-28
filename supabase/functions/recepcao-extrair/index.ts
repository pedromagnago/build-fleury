// Recepção de Documentos — extrai itens de NF/PDF/imagem/texto via OpenAI
// Body: { kind: 'pdf'|'imagem'|'texto', content: string (base64 ou texto cru), prompt_extra?: string }
// Retorno: { fornecedor: {...}, itens: [...], totals: {...}, custo_cents, modelo }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const MODEL = Deno.env.get('OPENAI_EXTRACT_MODEL') ?? 'gpt-4o-mini'

const SYSTEM_PROMPT = `Voce eh um assistente que extrai dados estruturados de notas fiscais e documentos comerciais brasileiros (NF-e, NFS-e, boletos, recibos, ordens de servico).
Extraia em JSON estrito, sem markdown, sem explicacoes:

{
  "fornecedor": {
    "nome": string|null,
    "cnpj": string|null,
    "ie": string|null
  },
  "documento": {
    "numero": string|null,
    "serie": string|null,
    "data_emissao": "YYYY-MM-DD"|null,
    "data_vencimento": "YYYY-MM-DD"|null,
    "valor_total": number|null,
    "tipo": "NFE"|"NFSE"|"BOLETO"|"RECIBO"|"OUTRO"
  },
  "itens": [
    {
      "ordem": number,
      "descricao": string,
      "ncm": string|null,
      "unidade": string|null,
      "quantidade": number|null,
      "valor_unitario": number|null,
      "valor_total": number|null
    }
  ],
  "observacoes": string|null
}

Regras:
- Numeros: ponto como decimal (1234.56), nunca virgula nem string
- CNPJ: so digitos
- Datas: ISO 8601
- Se nao identificar campo, use null (nunca string vazia)
- Itens: liste TODOS. Em listas extensas, mantenha a ordem fisica do documento
- Soma de itens.valor_total deve aproximar valor_total geral; se divergir muito, mencione em observacoes`

async function callOpenAI(messages: any[]): Promise<{ json: any; usage: any }> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  return {
    json: JSON.parse(data.choices[0].message.content),
    usage: data.usage,
  }
}

// Custo aproximado em centavos (gpt-4o-mini: $0.150/M input, $0.600/M output)
function estimateCostCents(usage: any, model: string): number {
  if (!usage) return 0
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-4o-mini': { in: 0.150, out: 0.600 },
    'gpt-4o':      { in: 5.000, out: 20.000 },
  }
  const r = rates[model] ?? rates['gpt-4o-mini']
  const inCost = (usage.prompt_tokens / 1_000_000) * r.in
  const outCost = (usage.completion_tokens / 1_000_000) * r.out
  return Math.round((inCost + outCost) * 100 * 100) / 100  // 2 casas
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { kind, content, prompt_extra } = await req.json()
    if (!kind || !content) {
      return new Response(JSON.stringify({ error: 'missing kind/content' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    let messages: any[]
    if (kind === 'imagem' || kind === 'pdf') {
      // OpenAI vision: PDF nao e suportado direto, usuario deve mandar imagem (1 pagina) ou converter PDF -> imagem
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + (prompt_extra ? `\n\nContexto extra: ${prompt_extra}` : '') },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados estruturados deste documento.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${content}` } },
          ],
        },
      ]
    } else if (kind === 'texto') {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + (prompt_extra ? `\n\nContexto extra: ${prompt_extra}` : '') },
        { role: 'user', content: `Extraia os dados estruturados do seguinte documento:\n\n${content}` },
      ]
    } else {
      return new Response(JSON.stringify({ error: 'kind invalido (use imagem|pdf|texto)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { json, usage } = await callOpenAI(messages)
    const custo_cents = estimateCostCents(usage, MODEL)

    return new Response(
      JSON.stringify({ ...json, _meta: { modelo: MODEL, custo_cents, usage } }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
