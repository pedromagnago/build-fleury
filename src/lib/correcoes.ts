/**
 * correcoes.ts — Aplicacoes inline para corrigir inconsistencias do Painel.
 *
 * Cada acao mexe diretamente em parcelas (update ou insert) e grava trilha
 * em audit_logs. Sao operacoes determinasticas — a IA usa as mesmas funcoes
 * para aplicar suas sugestoes apos aprovacao humana.
 */
import { supabase } from './supabase'

export type CorrecaoAcao =
  | 'reduzir_ao_pago'
  | 'marcar_paga'
  | 'sync_valor_pago_movs'
  | 'reabrir'
  | 'criar_residuo'

export interface ParcelaContexto {
  id: string
  company_id: string
  pedido_id: string | null
  numero_parcela: number
  valor: number
  valor_pago: number
  status: string
}

export interface AplicarParams {
  parcela: ParcelaContexto
  acao: CorrecaoAcao
  somaMovs?: number
  valorResiduo?: number
  dataVencimentoResiduo?: string
  origemAgente?: 'humano' | 'ia'
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function aplicarCorrecaoParcela({
  parcela, acao, somaMovs, valorResiduo, dataVencimentoResiduo, origemAgente = 'humano',
}: AplicarParams): Promise<{ resumo: string }> {
  const dadosAntes = {
    valor: Number(parcela.valor),
    valor_pago: Number(parcela.valor_pago),
    status: parcela.status,
  }
  let updates: Record<string, unknown> = {}
  let resumo = ''

  switch (acao) {
    case 'reduzir_ao_pago': {
      if (parcela.valor_pago <= 0) throw new Error('Sem valor pago para reduzir.')
      updates = { valor: parcela.valor_pago, status: 'paga' }
      resumo = `Reduzir P${parcela.numero_parcela}: valor de R$ ${parcela.valor.toFixed(2)} → R$ ${parcela.valor_pago.toFixed(2)}`
      break
    }
    case 'marcar_paga': {
      updates = { valor_pago: parcela.valor, status: 'paga', data_pagamento_real: todayISO() }
      resumo = `Marcar P${parcela.numero_parcela} como totalmente paga (R$ ${parcela.valor.toFixed(2)})`
      break
    }
    case 'sync_valor_pago_movs': {
      if (somaMovs == null) throw new Error('somaMovs obrigatorio.')
      updates = { valor_pago: somaMovs }
      const novoStatus = somaMovs >= parcela.valor - 0.005 ? 'paga' : 'parcialmente_paga'
      ;(updates as any).status = novoStatus
      resumo = `Sincronizar P${parcela.numero_parcela}: valor_pago = Σ movs (R$ ${somaMovs.toFixed(2)})`
      break
    }
    case 'reabrir': {
      updates = { status: 'a_vencer', valor_pago: 0, data_pagamento_real: null }
      resumo = `Reabrir P${parcela.numero_parcela} (zerar valor_pago e voltar para a vencer)`
      break
    }
    case 'criar_residuo': {
      if (!valorResiduo || valorResiduo <= 0) throw new Error('valorResiduo obrigatorio.')
      if (!dataVencimentoResiduo) throw new Error('dataVencimentoResiduo obrigatorio.')
      // pega proximo numero_parcela do pedido
      const { data: ultima } = await supabase
        .from('parcelas')
        .select('numero_parcela')
        .eq('pedido_id', parcela.pedido_id!)
        .is('deleted_at', null)
        .order('numero_parcela', { ascending: false })
        .limit(1)
      const novoNumero = ((ultima?.[0]?.numero_parcela ?? 0) + 1)
      const { error: errIns } = await supabase.from('parcelas').insert({
        company_id: parcela.company_id,
        pedido_id: parcela.pedido_id,
        numero_parcela: novoNumero,
        valor: valorResiduo,
        data_vencimento: dataVencimentoResiduo,
        status: 'a_vencer',
        valor_pago: 0,
        tipo: 'contratual',
      })
      if (errIns) throw errIns
      // reduz a parcela origem para o que ja foi pago
      const { error: errUpd } = await supabase
        .from('parcelas')
        .update({ valor: parcela.valor_pago, status: 'paga' })
        .eq('id', parcela.id)
      if (errUpd) throw errUpd
      resumo = `Dividir P${parcela.numero_parcela}: residuo R$ ${valorResiduo.toFixed(2)} → nova P${novoNumero} (venc. ${dataVencimentoResiduo})`
      // audit
      await registrarAudit(parcela, acao, dadosAntes, { residuo: valorResiduo, novoNumero }, resumo, origemAgente)
      return { resumo }
    }
    default:
      throw new Error(`Acao desconhecida: ${acao}`)
  }

  const { error } = await supabase.from('parcelas').update(updates).eq('id', parcela.id)
  if (error) throw error
  await registrarAudit(parcela, acao, dadosAntes, { ...dadosAntes, ...updates }, resumo, origemAgente)
  return { resumo }
}

async function registrarAudit(
  parcela: ParcelaContexto,
  acao: string,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  resumo: string,
  agente: 'humano' | 'ia',
) {
  const { data: { user } } = await supabase.auth.getUser()
  // CHECK constraints: audit_logs.acao IN (INSERT,UPDATE,DELETE); agente IN (humano,ia,sistema).
  // Detalhe da correcao fica em `resumo` + dados_antes/dados_depois.
  const acaoSql = acao === 'criar_residuo' ? 'INSERT' : 'UPDATE'
  await supabase.from('audit_logs').insert({
    company_id: parcela.company_id,
    tabela: 'parcelas',
    registro_id: parcela.id,
    acao: acaoSql,
    agente,
    usuario_id: user?.id ?? null,
    user_email: user?.email ?? null,
    resumo: `[correcao_${acao}] ${resumo}`,
    dados_antes: antes,
    dados_depois: depois,
  })
}
