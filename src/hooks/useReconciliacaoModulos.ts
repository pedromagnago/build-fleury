/**
 * useReconciliacaoModulos — ponte entre o total de Compras e o total de Pagamentos.
 *
 * Cada tela calcula "total" com critério próprio:
 *   - Compras (ItensTab): Σ pedido_itens.valor_total_real com pedido ≠ cancelado,
 *     fora_orcamento ≠ true e item de orçamento vivo (não deletado).
 *   - Pagamentos (ParcelasTab, filtros default): Σ parcelas.valor (exclui renegociadas)
 *     + parcelas de mútuos de captação + amortizações avulsas.
 *
 * Este hook reproduz as duas fórmulas e decompõe a diferença em linhas (BridgeLine)
 * que somam exatamente o gap. O que sobrar sem explicação vira `residuo` — bug de dado.
 */
import { useMemo } from 'react'
import { useParcelas, useAmortizacoesAvulsas, type Parcela } from '@/hooks/useFinanceiro'
import { usePedidos, usePedidoItens, useItensCompra, type Pedido } from '@/hooks/useCompras'
import { useMutuos } from '@/hooks/useMutuos'

export interface BridgeItem {
  id: string
  label: string
  valor: number
}

export interface BridgeLine {
  /** Slug estável da ponte. */
  chave: string
  label: string
  /** Contribuição com sinal: positivo = está em Pagamentos além de Compras; negativo = está em Compras sem chegar em Pagamentos. */
  valor: number
  /** Drill-down (até 50, ordenados por |valor| desc). */
  itens: BridgeItem[]
  /** Deep-link quando existe rota com filtro. */
  rota?: string
  /** Linha de contexto (ex.: originais renegociadas) — não entra na soma da ponte. */
  informativa?: boolean
}

export interface ReconciliacaoModulos {
  totalCompras: number
  totalPagamentos: number
  linhas: BridgeLine[]
  /** totalPagamentos − totalCompras − Σ linhas não-informativas. ≤ 0.01 = ponte fecha. */
  residuo: number
  isLoading: boolean
}

const MAX_ITENS = 50

export function useReconciliacaoModulos(): ReconciliacaoModulos {
  const { data: parcelas = [], isLoading: lParcelas } = useParcelas()
  const { data: pedidos = [], isLoading: lPedidos } = usePedidos()
  const { data: pedidoItens = [], isLoading: lPedidoItens } = usePedidoItens()
  const { data: itens = [], isLoading: lItens } = useItensCompra()
  const { data: mutuos = [], isLoading: lMutuos } = useMutuos()
  const { data: amortizacoes = [], isLoading: lAmort } = useAmortizacoesAvulsas()

  const isLoading = lParcelas || lPedidos || lPedidoItens || lItens || lMutuos || lAmort

  return useMemo<ReconciliacaoModulos>(() => {
    if (isLoading) {
      return { totalCompras: 0, totalPagamentos: 0, linhas: [], residuo: 0, isLoading: true }
    }

    const itensVivos = new Set(itens.map(i => i.id))
    const pedidoById = new Map<string, Pedido>(pedidos.map(p => [p.id, p]))
    const labelPedido = (ped: Pedido | undefined, fallback = 'Pedido ?') =>
      ped ? `Pedido #${ped.numero_pedido ?? '?'} — ${ped.fornecedor_nome ?? ped.item_descricao ?? 'sem fornecedor'}` : fallback
    const labelParcela = (p: Parcela) =>
      `Parcela ${p.numero_parcela} — ${p.pedido_item ?? p.descricao ?? p.fornecedor_nome ?? 'sem descrição'}`

    // ─── Lado Compras (fórmula da ItensTab) ─────────────────────────────────
    // Por pedido ativo: consumo de itens vivos (entra no total da tela),
    // consumo de itens excluídos (a tela NÃO soma) e linhas fora_orcamento.
    type AggPed = { vivo: number; itemExcluido: number; fora: number }
    const porPedido = new Map<string, AggPed>()
    const itensFora: BridgeItem[] = []
    const itensExcluidos: BridgeItem[] = []
    let totalCompras = 0

    for (const pi of pedidoItens as any[]) {
      const ped = pi.pedidos
      if (!ped || ped.status === 'cancelado') continue
      const agg = porPedido.get(pi.pedido_id) ?? { vivo: 0, itemExcluido: 0, fora: 0 }
      const valor = Number(pi.valor_total_real ?? 0)
      const labelBase = `Pedido #${ped.numero_pedido ?? '?'} — ${pi.itens_compra?.descricao ?? 'item ?'}`
      if (pi.fora_orcamento === true) {
        agg.fora += valor
        if (valor > 0.005) itensFora.push({ id: pi.id, label: labelBase, valor })
      } else if (!itensVivos.has(pi.item_compra_id)) {
        agg.itemExcluido += valor
        if (valor > 0.005) itensExcluidos.push({ id: pi.id, label: `${labelBase} (item excluído do orçamento)`, valor })
      } else {
        agg.vivo += valor
        totalCompras += valor
      }
      porPedido.set(pi.pedido_id, agg)
    }

    // ─── Lado Pagamentos (fórmula da ParcelasTab com filtros default) ───────
    const vivas = parcelas.filter(p => p.status !== 'renegociada')
    const renegociadas = parcelas.filter(p => p.status === 'renegociada')

    const itensCancelados: BridgeItem[] = []
    const itensOrfasContr: BridgeItem[] = []
    const itensOrfasAdiant: BridgeItem[] = []
    const itensDespesas: BridgeItem[] = []
    const itensAcordo: BridgeItem[] = []
    const itensPedidoDesconhecido: BridgeItem[] = []
    const vivasPorPedido = new Map<string, number>()
    let totalPagamentos = 0

    for (const p of vivas) {
      const valor = Number(p.valor || 0)
      totalPagamentos += valor
      if ((p as any).acordo_id) {
        itensAcordo.push({ id: p.id, label: `${labelParcela(p)}${(p as any).acordo_nome ? ` · ${(p as any).acordo_nome}` : ''}`, valor })
      } else if (p.pedido_id) {
        const ped = pedidoById.get(p.pedido_id)
        if (!ped) {
          itensPedidoDesconhecido.push({ id: p.id, label: labelParcela(p), valor })
        } else if (ped.status === 'cancelado') {
          itensCancelados.push({ id: p.id, label: `${labelParcela(p)} · ${labelPedido(ped)}`, valor })
        } else {
          vivasPorPedido.set(p.pedido_id, (vivasPorPedido.get(p.pedido_id) ?? 0) + valor)
        }
      } else if (p.despesa_indireta_id) {
        itensDespesas.push({ id: p.id, label: labelParcela(p), valor })
      } else if (p.tipo === 'adiantamento') {
        itensOrfasAdiant.push({ id: p.id, label: labelParcela(p), valor })
      } else {
        itensOrfasContr.push({ id: p.id, label: labelParcela(p), valor })
      }
    }

    // Mútuos de captação — mesmo predicado da ParcelasTab (exclui "adiantamento feito/a receber").
    const isAdiantamentoFeito = (m: { categoria?: string | null }) => {
      const cat = String(m.categoria ?? '').toLowerCase()
      return cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')
    }
    const itensMutuos: BridgeItem[] = []
    for (const m of mutuos) {
      if (isAdiantamentoFeito(m)) continue
      const soma = (m.parcelas ?? []).reduce((s, mp) => s + Number(mp.valor || 0), 0)
      if (soma <= 0.005) continue
      totalPagamentos += soma
      itensMutuos.push({ id: m.id, label: `${m.nome} (${m.tipo}) — ${m.parcelas?.length ?? 0} parcela(s)`, valor: soma })
    }

    const itensAmort: BridgeItem[] = amortizacoes.map(a => {
      totalPagamentos += Number(a.valor || 0)
      return { id: a.id, label: `Amortização avulsa — ${a.mutuo_nome} (${a.data})`, valor: Number(a.valor || 0) }
    })

    // ─── Pontes por pedido ativo ────────────────────────────────────────────
    // Para pedidos COM parcela viva, o esperado é:
    //   Σ parcelas = consumo (vivo + item excluído + fora) + frete − coberto por realização
    // O que fugir disso vira "divergência". Pedidos SEM parcela viva saem
    // inteiros da ponte (valor negativo: estão em Compras e não em Pagamentos).
    const itensSemParcela: BridgeItem[] = []
    const itensFrete: BridgeItem[] = []
    const itensCoberto: BridgeItem[] = []
    const itensDivergencia: BridgeItem[] = []

    for (const ped of pedidos) {
      if (ped.status === 'cancelado') continue
      const agg = porPedido.get(ped.id) ?? { vivo: 0, itemExcluido: 0, fora: 0 }
      const consumoTotal = agg.vivo + agg.itemExcluido + agg.fora
      const somaVivas = vivasPorPedido.get(ped.id)
      if (somaVivas == null) {
        if (consumoTotal > 0.005) {
          itensSemParcela.push({ id: ped.id, label: labelPedido(ped), valor: -consumoTotal })
        }
        continue
      }
      const frete = Number(ped.valor_frete || 0)
      const coberto = Number(ped.valor_coberto_por_realizacao || 0)
      if (frete > 0.005) itensFrete.push({ id: ped.id, label: labelPedido(ped), valor: frete })
      if (coberto > 0.005) itensCoberto.push({ id: ped.id, label: labelPedido(ped), valor: -coberto })
      const dif = somaVivas - (consumoTotal + frete - coberto)
      if (Math.abs(dif) > 0.01) {
        itensDivergencia.push({ id: ped.id, label: labelPedido(ped), valor: dif })
      }
    }

    const linha = (
      chave: string, label: string, lista: BridgeItem[],
      opts: { rota?: string; informativa?: boolean } = {},
    ): BridgeLine => ({
      chave,
      label,
      valor: lista.reduce((s, i) => s + i.valor, 0),
      itens: [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, MAX_ITENS),
      ...opts,
    })

    const itensRenegociadas: BridgeItem[] = renegociadas.map(p => ({
      id: p.id, label: labelParcela(p), valor: Number(p.valor || 0),
    }))

    const linhas = [
      linha('parcelas-pedido-cancelado', 'Parcelas de pedidos cancelados (não deletadas)', itensCancelados, { rota: '/pagamentos?canceladas=1' }),
      linha('orfas-contratual', 'Parcelas órfãs contratuais (sem pedido, despesa ou acordo)', itensOrfasContr, { rota: '/pagamentos' }),
      linha('orfas-adiantamento', 'Parcelas órfãs de adiantamento', itensOrfasAdiant, { rota: '/pagamentos' }),
      linha('parcelas-despesa-indireta', 'Parcelas de despesas indiretas', itensDespesas, { rota: '/custos-indiretos' }),
      linha('parcelas-acordo', 'Parcelas de acordo (renegociação)', itensAcordo, { rota: '/pagamentos?tab=acordos' }),
      linha('renegociadas-originais', 'Contrapartida: originais renegociadas (fora dos dois totais)', itensRenegociadas, { rota: '/pagamentos?filtro=renegociadas', informativa: true }),
      linha('mutuos-captacao', 'Parcelas de mútuos de captação', itensMutuos, { rota: '/mutuos' }),
      linha('amortizacoes-avulsas', 'Amortizações avulsas de mútuo', itensAmort, { rota: '/mutuos' }),
      linha('pedido-sem-parcela', 'Pedidos ativos sem nenhuma parcela gerada', itensSemParcela, { rota: '/compras' }),
      linha('frete', 'Frete de NF (entra nas parcelas, fora do WBS)', itensFrete, { rota: '/compras' }),
      linha('coberto-realizacao', 'Coberto por realização (NF realizou previsão — sem parcela)', itensCoberto, { rota: '/compras' }),
      linha('divergencia-pedido', 'Divergência Σ parcelas ≠ valor do pedido', itensDivergencia, { rota: '/pagamentos' }),
      linha('fora-orcamento', 'pedido_itens fora do orçamento (Compras exclui)', itensFora, { rota: '/compras' }),
      linha('item-excluido', 'Consumo de itens excluídos do orçamento', itensExcluidos, { rota: '/compras' }),
      linha('parcela-pedido-desconhecido', 'Parcelas apontando pedido não carregado (bug de dado)', itensPedidoDesconhecido, { rota: '/pagamentos' }),
    ].filter(l => l.itens.length > 0 || Math.abs(l.valor) > 0.005)

    const somaPontes = linhas.filter(l => !l.informativa).reduce((s, l) => s + l.valor, 0)
    const residuo = totalPagamentos - totalCompras - somaPontes

    return { totalCompras, totalPagamentos, linhas, residuo, isLoading: false }
  }, [parcelas, pedidos, pedidoItens, itens, mutuos, amortizacoes, isLoading])
}
