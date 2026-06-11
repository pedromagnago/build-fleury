import { newWorkbook, addJsonSheet, downloadWorkbook } from '@/lib/safeXlsx'
import type { Etapa } from '@/hooks/useEtapas'
import type { ItemCompra } from '@/hooks/useCompras'
import type { Distribuicao } from '@/hooks/useOperacional'

export async function exportWBSToExcel(etapas: Etapa[], itensCompra: ItemCompra[], distribuicoes: Distribuicao[]): Promise<void> {
  const wb = newWorkbook()
  const etapaMap = new Map(etapas.map(e => [e.id, e]))

  // ── Aba 1: Etapas ─────────────────────────────────────
  const etapaRows = etapas.map(e => {
    const items = itensCompra.filter(i => i.etapa_id === e.id)
    const custoOrc = items.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
    const custoConsumido = items.reduce((s, i) => s + (i.valor_consumido ?? 0), 0)
    const receita = e.faturamento_valor_total || 0
    return {
      'Código': e.codigo,
      'Nome': e.nome,
      'Status': e.status,
      'Casas': e.casas_total,
      'Ordem': e.ordem,
      'Receita CEF': receita,
      'Preço Unitário (Serv)': e.faturamento_preco_unitario || 0,
      'Qtd/Casa (Serv)': e.faturamento_quantidade_unitaria || 0,
      'Unidade (Serv)': e.faturamento_unidade || '',
      'Custo Orçado': custoOrc,
      'Custo Consumido': custoConsumido,
      'Saldo': custoOrc - custoConsumido,
      'Margem (R$)': receita - custoOrc,
      'Data Início Plan': e.data_inicio_plan || '',
      'Data Fim Plan': e.data_fim_plan || '',
      'Data Início Real': e.data_inicio_real || '',
      'Data Fim Real': e.data_fim_real || '',
      'Observações': e.observacoes || '',
    }
  })

  addJsonSheet(wb, 'Etapas', etapaRows, { widths: [10, 30, 14, 8, 8, 16, 16, 12, 10, 16, 16, 16, 16, 14, 14, 14, 14, 30] })

  // ── Aba 2: Itens de Compra ─────────────────────────────
  const itemRows = itensCompra.map(i => {
    const et = etapaMap.get(i.etapa_id)
    const casas = et?.casas_total ?? 0
    const qtdCasa = i.qtd_por_casa ?? 0
    const custoUnit = i.custo_unitario_orcado ?? 0
    const custoCasa = qtdCasa * custoUnit
    return {
      'Etapa Cód': et?.codigo || '',
      'Etapa Nome': et?.nome || '',
      'Item Cód': i.codigo,
      'Descrição': i.descricao,
      'Tipo': i.tipo,
      'Qtd/Casa': qtdCasa,
      'Unidade': i.unidade || '',
      'Custo Unitário': custoUnit,
      'Custo/Casa': custoCasa,
      'Casas': casas,
      'Qtd Total': i.qtd_total || (qtdCasa > 0 ? qtdCasa * casas : 0),
      'Valor Total Orçado': i.valor_total_orcado || 0,
      'Valor Consumido': i.valor_consumido || 0,
      'Saldo': (i.valor_total_orcado || 0) - (i.valor_consumido || 0),
      'Fornecedor': i.fornecedor_nome || '',
      'Cond. Pagamento': i.cond_pagamento || '',
    }
  })

  addJsonSheet(wb, 'Itens de Compra', itemRows, { widths: [10, 30, 14, 30, 12, 10, 8, 14, 14, 8, 10, 16, 16, 16, 20, 14] })

  // ── Aba 3: Distribuição Física ─────────────────────────
  const distRows = distribuicoes.map(d => {
    const et = etapaMap.get(d.etapa_id)
    return {
      'Etapa Cód': et?.codigo || '',
      'Etapa Nome': et?.nome || '',
      'Medição': d.medicao_numero,
      'Casas Planejadas': d.casas_planejadas,
      'Casas Realizadas': d.casas_realizadas,
      'Data Início': d.data_inicio || '',
      'Data Fim': d.data_fim || '',
      'Receita a Liberar': d.valor_liberado_faturamento || 0,
    }
  })

  addJsonSheet(wb, 'Distribuição', distRows, { widths: [10, 30, 10, 14, 14, 14, 14, 16] })

  // Download
  const dateStr = new Date().toISOString().split('T')[0]
  await downloadWorkbook(wb, `WBS_Projeto_${dateStr}.xlsx`)
}
