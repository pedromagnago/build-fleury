/**
 * Export do "Pacote Comercial" — arquivo único multi-aba que carrega
 * Pedidos + Parcelas + Custos Indiretos + Fornecedores.
 *
 * Edite no Excel e re-importe: o `comercialImport.ts` casa por *_id (UUID)
 * para preservar identidade durante reprogramação pesada.
 *
 * Colunas com [colchete] são read-only (contexto humano). O importador
 * ignora silenciosamente — não tente mexer nelas no Excel.
 */
import * as XLSX from 'xlsx'
import type { Etapa } from '@/hooks/useEtapas'
import type { ItemCompra, Pedido, Fornecedor } from '@/hooks/useCompras'
import type { Parcela } from '@/hooks/useFinanceiro'
import type { DespesaIndireta } from '@/hooks/useDespesasIndiretas'
import type { Mutuo } from '@/hooks/useMutuos'

interface ExportInput {
  etapas: Etapa[]
  itensCompra: ItemCompra[]
  pedidos: Pedido[]
  parcelas: Parcela[]
  despesas: DespesaIndireta[]
  fornecedores: Fornecedor[]
  mutuos?: Mutuo[]
}

export function exportComercialToExcel(input: ExportInput) {
  const { etapas, itensCompra, pedidos, parcelas, despesas, fornecedores, mutuos = [] } = input

  const etapaById = new Map(etapas.map(e => [e.id, e]))
  const itemById = new Map(itensCompra.map(i => [i.id, i]))
  const fornById = new Map(fornecedores.map(f => [f.id, f]))
  const pedidoById = new Map(pedidos.map(p => [p.id, p]))
  const despById = new Map(despesas.map(d => [d.id, d]))

  const wb = XLSX.utils.book_new()

  // ── Aba 1: Pedidos ─────────────────────────────────────
  // Diff esperado entre Σ parcelas e valor_total_real:
  //  - Σ parcelas TOTAL pode incluir adiantamentos (tipo='adiantamento') → soma cresce
  //  - Σ parcelas CONTRATUAIS deve bater com valor_total_real do pedido (tolerância R$ 0,01)
  const pedidoRows = pedidos.map(p => {
    const item = p.item_compra_id ? itemById.get(p.item_compra_id) : undefined
    const etapa = item ? etapaById.get(item.etapa_id) : undefined
    const forn = p.fornecedor_id ? fornById.get(p.fornecedor_id) : undefined
    const parcsDoPedido = parcelas.filter(parc => parc.pedido_id === p.id)
    const parcsContratuais = parcsDoPedido.filter(x => (x.tipo ?? 'contratual') === 'contratual')
    const parcsAdiantamentos = parcsDoPedido.filter(x => x.tipo === 'adiantamento')
    const somaTodas = parcsDoPedido.reduce((s, parc) => s + Number(parc.valor || 0), 0)
    const somaContratuais = parcsContratuais.reduce((s, x) => s + Number(x.valor || 0), 0)
    const somaPagas = parcsDoPedido.reduce((s, x) => s + Number(x.valor_pago || 0), 0)
    const valorTotal = Number(p.valor_total_real ?? 0)
    return {
      'pedido_id': p.id,
      'etapa_codigo': etapa?.codigo ?? '',
      'item_codigo': item?.codigo ?? '',
      'numero_pedido': p.numero_pedido ?? '',
      'fornecedor_nome': forn?.nome ?? p.fornecedor_nome ?? '',
      'casas_lote': p.casas_lote ?? '',
      'qtd_lote': p.qtd_lote ?? '',
      'valor_unitario_real': p.valor_unitario_real ?? '',
      'valor_total_real': p.valor_total_real ?? '',
      'cond_pagamento': p.cond_pagamento ?? '',
      'data_entrega_prevista': p.data_entrega_prevista ?? '',
      'data_entrega_real': p.data_entrega_real ?? '',
      'status': p.status ?? '',
      'observacoes': p.observacoes ?? '',
      // Read-only — para visualização. Importador ignora.
      '[etapa_nome]': etapa?.nome ?? '',
      '[item_descricao]': item?.descricao ?? '',
      '[parcelas_count_total]': parcsDoPedido.length,
      '[parcelas_count_contratuais]': parcsContratuais.length,
      '[parcelas_count_adiantamentos]': parcsAdiantamentos.length,
      '[parcelas_soma_todas]': somaTodas.toFixed(2),
      '[parcelas_soma_contratuais]': somaContratuais.toFixed(2),
      '[parcelas_soma_pagas]': somaPagas.toFixed(2),
      '[diff_contratuais_vs_total]': (valorTotal - somaContratuais).toFixed(2),
    }
  })
  const wsPedidos = XLSX.utils.json_to_sheet(pedidoRows)
  setColumnWidths(wsPedidos, [38, 12, 14, 14, 24, 10, 10, 14, 14, 16, 14, 14, 14, 30, 24, 30, 12, 12, 12, 14, 14, 14, 14])
  XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos')

  // ── Aba 2: Parcelas ────────────────────────────────────
  // Ordem: por pedido (data_entrega_prevista, depois numero_parcela), depois despesa
  const parcOrdenadas = [...parcelas].sort((a, b) => {
    if (a.pedido_id && b.pedido_id) {
      const pa = pedidoById.get(a.pedido_id)
      const pb = pedidoById.get(b.pedido_id)
      const da = pa?.data_entrega_prevista ?? ''
      const db = pb?.data_entrega_prevista ?? ''
      if (da !== db) return da.localeCompare(db)
      return a.numero_parcela - b.numero_parcela
    }
    if (a.pedido_id) return -1
    if (b.pedido_id) return 1
    return a.numero_parcela - b.numero_parcela
  })

  const parcelaRows = parcOrdenadas.map(parc => {
    const ped = parc.pedido_id ? pedidoById.get(parc.pedido_id) : undefined
    const desp = parc.despesa_indireta_id ? despById.get(parc.despesa_indireta_id) : undefined
    const item = ped?.item_compra_id ? itemById.get(ped.item_compra_id) : undefined
    const forn = ped?.fornecedor_id
      ? fornById.get(ped.fornecedor_id)
      : (desp?.fornecedor_id ? fornById.get(desp.fornecedor_id) : undefined)
    const origem = parc.pedido_id
      ? 'pedido'
      : parc.despesa_indireta_id
        ? 'despesa_indireta'
        : 'sem_vinculo'
    return {
      'parcela_id': parc.id,
      '[origem]': origem,
      'pedido_id': parc.pedido_id ?? '',
      'despesa_indireta_id': parc.despesa_indireta_id ?? '',
      'numero_parcela': parc.numero_parcela,
      'valor': parc.valor,
      'data_vencimento': parc.data_vencimento ?? '',
      'data_prevista_pagamento': (parc as any).data_prevista_pagamento ?? parc.data_vencimento ?? '',
      'valor_pago': parc.valor_pago ?? 0,
      'data_pagamento_real': parc.data_pagamento_real ?? '',
      'status': parc.status ?? '',
      'tipo': parc.tipo ?? 'contratual',
      'descricao': parc.descricao ?? '',
      'observacoes': parc.observacoes ?? '',
      // Read-only
      '[fornecedor_nome]': forn?.nome ?? '',
      '[item_descricao]': item?.descricao ?? desp?.descricao ?? '',
      '[pedido_numero]': ped?.numero_pedido ?? '',
      '[saldo_aberto]': (Number(parc.valor || 0) - Number(parc.valor_pago || 0)).toFixed(2),
    }
  })
  const wsParcelas = XLSX.utils.json_to_sheet(parcelaRows)
  setColumnWidths(wsParcelas, [38, 16, 38, 38, 8, 14, 14, 14, 16, 14, 14, 24, 30, 24, 30, 12, 14])
  XLSX.utils.book_append_sheet(wb, wsParcelas, 'Parcelas')

  // ── Aba 3: Parcelas Mútuos (read-only) ─────────────────
  // Mútuos vivem em `mutuo_parcelas` (tabela separada de `parcelas`).
  // Exportado aqui só pra visualização — re-importar NÃO altera mútuos
  // (use a tela de Mútuos pra editar).
  const mutuoById = new Map(mutuos.map(m => [m.id, m]))
  const mutuoParcelaRows = mutuos
    .flatMap(m => (m.parcelas ?? []).map(parc => ({ mutuo: m, parc })))
    .sort((a, b) => {
      const na = a.mutuo.nome ?? ''
      const nb = b.mutuo.nome ?? ''
      if (na !== nb) return na.localeCompare(nb)
      return a.parc.numero_parcela - b.parc.numero_parcela
    })
    .map(({ mutuo, parc }) => ({
      'parcela_id': parc.id,
      '[origem]': 'mutuo',
      'mutuo_id': parc.mutuo_id,
      '[mutuo_nome]': mutuo.nome ?? '',
      '[mutuo_tipo]': mutuo.tipo ?? '',
      '[instituicao]': mutuo.instituicao ?? '',
      'numero_parcela': parc.numero_parcela,
      'valor': parc.valor,
      'data_vencimento': parc.data_vencimento ?? '',
      'valor_pago': parc.valor_pago ?? 0,
      'data_pagamento_real': parc.data_pagamento_real ?? '',
      'status': parc.status ?? '',
      'observacoes': parc.observacoes ?? '',
      '[saldo_aberto]': (Number(parc.valor || 0) - Number(parc.valor_pago || 0)).toFixed(2),
    }))
  // Mesmo sem dados, cria a aba pra deixar claro que mútuos NÃO estão na aba Parcelas
  const wsMutParc = XLSX.utils.json_to_sheet(
    mutuoParcelaRows.length > 0
      ? mutuoParcelaRows
      : [{
          'parcela_id': '', '[origem]': 'mutuo', 'mutuo_id': '',
          '[mutuo_nome]': '(sem mútuos cadastrados)', '[mutuo_tipo]': '', '[instituicao]': '',
          'numero_parcela': '', 'valor': '', 'data_vencimento': '', 'valor_pago': '',
          'data_pagamento_real': '', 'status': '', 'observacoes': '', '[saldo_aberto]': '',
        }]
  )
  setColumnWidths(wsMutParc, [38, 12, 38, 28, 14, 22, 8, 14, 14, 14, 14, 22, 30, 14])
  XLSX.utils.book_append_sheet(wb, wsMutParc, 'Parcelas Mutuos')
  // Suprime warning de mapa não-usado quando não há mútuos
  void mutuoById

  // ── Aba 4: Custos Indiretos ────────────────────────────
  const despRows = despesas.map(d => {
    const forn = d.fornecedor_id ? fornById.get(d.fornecedor_id) : undefined
    const parcsDoCusto = parcelas.filter(parc => parc.despesa_indireta_id === d.id)
    return {
      'despesa_id': d.id,
      'descricao': d.descricao,
      'categoria': d.categoria ?? '',
      'fornecedor_nome': forn?.nome ?? d.fornecedor_nome ?? '',
      'valor_orcado': d.valor_orcado ?? '',
      'cond_pagamento': d.cond_pagamento ?? '',
      'data_inicio': d.data_inicio ?? '',
      'data_fim': d.data_fim ?? '',
      'recorrente': d.recorrente ? 'sim' : 'nao',
      'frequencia': d.frequencia ?? '',
      'ativo': d.ativo ? 'sim' : 'nao',
      'observacoes': d.observacoes ?? '',
      // Read-only
      '[valor_consumido]': d.valor_consumido ?? 0,
      '[parcelas_count]': parcsDoCusto.length,
    }
  })
  const wsDesp = XLSX.utils.json_to_sheet(despRows)
  setColumnWidths(wsDesp, [38, 30, 18, 24, 14, 16, 14, 14, 12, 14, 8, 30, 14, 12])
  XLSX.utils.book_append_sheet(wb, wsDesp, 'Custos Indiretos')

  // ── Aba 5: Fornecedores ────────────────────────────────
  const fornRows = fornecedores.map(f => ({
    'fornecedor_id': f.id,
    'nome': f.nome,
    'cnpj': f.cnpj ?? '',
    'contato': f.contato ?? '',
    'cond_pagamento_padrao': f.cond_pagamento_padrao ?? '',
    'tipo': f.tipo ?? 'fornecedor',
    'observacoes': f.observacoes ?? '',
  }))
  const wsForn = XLSX.utils.json_to_sheet(fornRows)
  setColumnWidths(wsForn, [38, 28, 18, 22, 18, 12, 30])
  XLSX.utils.book_append_sheet(wb, wsForn, 'Fornecedores')

  // ── Aba 6: Instruções (opcional, ajuda o usuário) ──────
  const instrucoes = [
    ['Pacote Comercial — Build Fleury'],
    [''],
    ['Este arquivo contém TODOS os pedidos, parcelas, custos indiretos, fornecedores'],
    ['e parcelas de mútuos (read-only) do projeto. Edite à vontade no Excel e re-importe'],
    ['para aplicar as mudanças.'],
    [''],
    ['ABAS NESTE ARQUIVO'],
    ['- Pedidos:           pedidos de compra + agregados de parcelas'],
    ['- Parcelas:          parcelas de pedidos E custos indiretos (origem na coluna [origem])'],
    ['- Parcelas Mutuos:   parcelas de mútuos/empréstimos/financiamentos (READ-ONLY,'],
    ['                     vivem em outra tabela — edite na tela de Mútuos)'],
    ['- Custos Indiretos:  cadastro de despesas indiretas/recorrentes'],
    ['- Fornecedores:      cadastro de fornecedores'],
    [''],
    ['COLUNA [origem] (aba Parcelas)'],
    ['- pedido           → parcela vinculada a um pedido de compra'],
    ['- despesa_indireta → parcela vinculada a um custo indireto/recorrente'],
    ['- sem_vinculo      → parcela órfã (revise: provavelmente erro de cadastro)'],
    ['Mútuos NÃO aparecem na aba Parcelas — só na aba "Parcelas Mutuos".'],
    [''],
    ['CHAVES DE IDENTIDADE'],
    ['- Coluna *_id (UUID) é a chave estável. NÃO altere nem invente IDs.'],
    ['- Linha com *_id preenchido → o sistema faz UPDATE.'],
    ['- Linha com *_id vazio → o sistema CRIA novo.'],
    ['- Linha presente no banco mas SUMIDA da planilha → o preview pergunta'],
    ['  linha por linha o que fazer (ignorar / soft-delete).'],
    [''],
    ['COLUNAS COM [colchete]'],
    ['São read-only (contexto humano). O importador ignora ao re-importar.'],
    ['Não tente mexer nelas — mude as colunas-fonte (ex.: edite "valor_total_real",'],
    ['não "[parcelas_soma]").'],
    [''],
    ['VALIDAÇÕES NO PREVIEW'],
    ['- Σ parcelas CONTRATUAIS vs valor_total_real do pedido: se diferir > R$ 0,01,'],
    ['  aparece warning amarelo. Você pode corrigir e re-subir, ou seguir mesmo assim.'],
    ['- Mudou cond_pagamento de pedido sem editar suas parcelas → preview'],
    ['  pergunta "regenerar parcelas?".'],
    ['- Mudou data_entrega_prevista → só parcelas não-pagas serão regeneradas.'],
    [''],
    ['LEITURA DAS COLUNAS [parcelas_*] na aba Pedidos'],
    ['- [parcelas_soma_todas]:        Σ valor de TODAS as parcelas do pedido'],
    ['                                (inclui adiantamentos — pode ser MAIOR que o total!)'],
    ['- [parcelas_soma_contratuais]:  Σ valor só das parcelas tipo=contratual'],
    ['                                (deve bater com valor_total_real, ± R$ 0,01)'],
    ['- [parcelas_soma_pagas]:        Σ valor_pago de todas as parcelas'],
    ['                                (representa o que já saiu do caixa)'],
    ['- [diff_contratuais_vs_total]:  valor_total_real − soma_contratuais'],
    ['                                (zero = ok; ≠ zero = parcelas precisam ajuste)'],
    [''],
    ['LOOKUP'],
    ['- etapa_codigo / item_codigo: se o código não existir, linha rejeitada.'],
    ['- fornecedor_nome: criado automaticamente se não existir.'],
    [''],
    ['Em caso de dúvida, mantenha um backup do arquivo original antes de editar.'],
  ]
  const wsInstr = XLSX.utils.aoa_to_sheet(instrucoes)
  setColumnWidths(wsInstr, [120])
  XLSX.utils.book_append_sheet(wb, wsInstr, '_Instruções')

  // Download
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Comercial_Projeto_${dateStr}.xlsx`)
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }))
}
