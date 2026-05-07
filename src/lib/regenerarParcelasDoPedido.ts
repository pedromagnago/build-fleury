/**
 * regenerarParcelasDoPedido — Regenera parcelas de um único pedido,
 * preservando as já pagas (cascata do `lib/parcelas.regenerarParcelas`).
 *
 * Usado pelo Painel de Controle como ação inline para corrigir
 * "Σ parcelas ≠ valor do pedido".
 */
import { supabase } from '@/lib/supabase'
import { regenerarParcelas, localDate } from '@/lib/parcelas'

export interface RegenerarPedidoResult {
  deletadas: number
  criadas: number
  pagasPreservadas: number
  valorTotal: number
  valorJaPago: number
}

export async function regenerarParcelasDoPedido(
  pedidoId: string,
  companyId: string
): Promise<RegenerarPedidoResult> {
  const { data: pedido, error: pedErr } = await supabase
    .from('pedidos')
    .select('id, valor_total_real, cond_pagamento, data_entrega_prevista, item_compra_id, itens_compra(etapas(data_inicio_plan))')
    .eq('id', pedidoId)
    .single()
  if (pedErr) throw pedErr
  if (!pedido) throw new Error('Pedido não encontrado')

  const { data: parcelasExistentes, error: parErr } = await supabase
    .from('parcelas')
    .select('id, status, valor_pago')
    .eq('pedido_id', pedidoId)
  if (parErr) throw parErr

  const item = (pedido.itens_compra as any) ?? null
  const etapa = item?.etapas
  const dataInicioPlan = Array.isArray(etapa) ? etapa[0]?.data_inicio_plan : etapa?.data_inicio_plan
  const dataEntregaFallback = pedido.data_entrega_prevista || dataInicioPlan || new Date().toISOString().split('T')[0]

  const { parcelasParaDeletar, parcelasParaCriar } = regenerarParcelas({
    pedidoId,
    companyId,
    valorTotal: Number(pedido.valor_total_real || 0),
    condPagamento: pedido.cond_pagamento || 'à vista',
    novaDataEntrega: localDate(dataEntregaFallback),
    parcelasExistentes: (parcelasExistentes ?? []).map(p => ({
      id: p.id,
      status: String(p.status),
      valor_pago: Number(p.valor_pago || 0),
    })),
  })

  if (parcelasParaDeletar.length > 0) {
    const { error: delErr } = await supabase
      .from('parcelas')
      .delete()
      .in('id', parcelasParaDeletar)
    if (delErr) throw delErr
  }

  if (parcelasParaCriar.length > 0) {
    const { error: insErr } = await supabase
      .from('parcelas')
      .insert(parcelasParaCriar)
    if (insErr) throw insErr
  }

  const pagasPreservadas = (parcelasExistentes ?? []).filter(
    p => p.status === 'paga' || p.status === 'parcialmente_paga'
  ).length
  const valorJaPago = (parcelasExistentes ?? [])
    .filter(p => p.status === 'paga' || p.status === 'parcialmente_paga')
    .reduce((s, p) => s + Number(p.valor_pago || 0), 0)

  await supabase.from('audit_logs').insert({
    company_id: companyId,
    tabela: 'parcelas',
    acao: 'CREATE',
    agente: 'humano',
    dados_antes: {
      type: 'inline_regenerate_pedido',
      pedido_id: pedidoId,
      qtd_deletadas: parcelasParaDeletar.length,
    },
    dados_depois: {
      qtd_criadas: parcelasParaCriar.length,
      pagas_preservadas: pagasPreservadas,
    },
  })

  return {
    deletadas: parcelasParaDeletar.length,
    criadas: parcelasParaCriar.length,
    pagasPreservadas,
    valorTotal: Number(pedido.valor_total_real || 0),
    valorJaPago,
  }
}
