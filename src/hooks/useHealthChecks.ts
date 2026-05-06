/**
 * useHealthChecks — Conferências rápidas de integridade financeira
 *
 * Cruza dados de pedidos, parcelas, itens, medições, etapas, mútuos e
 * despesas indiretas para produzir checks de status (ok / warn / critical).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParcelas } from '@/hooks/useFinanceiro'
import { usePedidos, useItensCompra } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useMedicoes, useDistribuicao, useMovimentacoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'

export type CheckSeverity = 'ok' | 'warn' | 'critical'

export interface HealthCheckItem {
  id: string
  label: string
  description: string
  /** Valor monetario do problema (saldo, divergencia, atraso). Usado para ordenar a tabela do Painel. */
  value?: number
  /** Quando o item se refere a um pedido (direta ou indiretamente via parcela), permite drill-down no Painel. */
  pedidoId?: string
}

export interface HealthCheck {
  id: string
  title: string
  severity: CheckSeverity
  summary: string
  items: HealthCheckItem[]
  route?: string        // page link to fix
  routeLabel?: string   // button label
}

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function useHealthChecks() {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: itens = [] } = useItensCompra()
  const { data: etapas = [] } = useEtapas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: mutuos = [] } = useMutuos()
  const { data: movs = [] } = useMovimentacoes()
  const { despesas = [] } = useDespesasIndiretas()

  // Liga conciliacao -> parcela. Mesmo padrao do useCashFlowEvents para garantir
  // que a heuristica de "mov vinculada" usa as mesmas conciliacoes que o fluxo.
  const { data: linksMovs = [] } = useQuery({
    queryKey: ['health-links-movs', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return [] as any[]
      const { data, error } = await supabase
        .from('conciliacoes')
        .select('movimentacao_id, status, conciliacao_parcelas(parcela_id)')
        .eq('company_id', currentCompany.id)
        .neq('status', 'rejeitado')
      if (error) throw error
      return data ?? []
    },
    enabled: !!currentCompany,
  })

  const isLoading = !parcelas || !pedidos || !itens || !etapas

  const checks = useMemo<HealthCheck[]>(() => {
    const today = todayISO()
    const all: HealthCheck[] = []

    // Lookups compartilhados pelas regras de integridade cruzada (A/B/C/D).
    const movsByParcelaId = new Map<string, Set<string>>()
    for (const c of (linksMovs as any[])) {
      for (const l of (c.conciliacao_parcelas || [])) {
        if (!l.parcela_id) continue
        const s = movsByParcelaId.get(l.parcela_id) ?? new Set<string>()
        s.add(c.movimentacao_id)
        movsByParcelaId.set(l.parcela_id, s)
      }
    }
    const movById = new Map<string, any>()
    for (const m of (movs as any[])) movById.set(m.id, m)
    const pedidoById = new Map(pedidos.map(p => [p.id, p]))

    // ═══════════════════════════════════════════════════════════
    // 1. Pedidos confirmados sem parcela (não estão no fluxo)
    // ═══════════════════════════════════════════════════════════
    const parcelaPedidoIds = new Set(parcelas.map(p => p.pedido_id).filter(Boolean))
    const pedidosSemParcela = pedidos.filter(
      p => p.status === 'confirmado' && !parcelaPedidoIds.has(p.id)
    )
    all.push({
      id: 'pedidos-sem-parcela',
      title: 'Pedidos sem parcela',
      severity: pedidosSemParcela.length === 0 ? 'ok' : pedidosSemParcela.length <= 3 ? 'warn' : 'critical',
      summary: pedidosSemParcela.length === 0
        ? 'Todos os pedidos confirmados têm parcelas'
        : `${pedidosSemParcela.length} pedido(s) confirmado(s) sem parcela gerada`,
      items: pedidosSemParcela.map(p => ({
        id: p.id,
        label: `Pedido #${p.numero_pedido || '?'} — ${p.fornecedor_nome || 'Sem forn.'}`,
        description: `${p.item_descricao || 'Item'} • ${fmtBRL(Number(p.valor_total_real || 0))}`,
        value: Number(p.valor_total_real || 0),
        pedidoId: p.id,
      })),
      route: '/compras',
      routeLabel: 'Ir para Compras',
    })

    // ═══════════════════════════════════════════════════════════
    // 2. Itens de compra sem pedido (falta cobrir no orçamento)
    // ═══════════════════════════════════════════════════════════
    const itensComPedido = new Set(pedidos.map(p => p.item_compra_id))
    const itensSemPedido = itens.filter(
      i => !itensComPedido.has(i.id) && Number(i.valor_total_orcado) > 0
    )
    const valorSemPedido = itensSemPedido.reduce((s, i) => s + Number(i.valor_total_orcado || 0), 0)
    all.push({
      id: 'itens-sem-pedido',
      title: 'Orçamento sem pedido',
      severity: itensSemPedido.length === 0 ? 'ok' : itensSemPedido.length <= 5 ? 'warn' : 'critical',
      summary: itensSemPedido.length === 0
        ? 'Todos os itens orçados possuem pedidos vinculados'
        : `${itensSemPedido.length} item(ns) sem pedido — ${fmtBRL(valorSemPedido)} descoberto`,
      items: itensSemPedido.slice(0, 20).map(i => ({
        id: i.id,
        label: `${i.codigo} — ${i.descricao}`,
        description: `Orçado: ${fmtBRL(Number(i.valor_total_orcado))} • Etapa: ${i.etapa_nome || '—'}`,
        value: Number(i.valor_total_orcado || 0),
      })),
      route: '/compras',
      routeLabel: 'Ver Itens',
    })

    // ═══════════════════════════════════════════════════════════
    // 3. Consumido vs Orçado (estouro de orçamento)
    // ═══════════════════════════════════════════════════════════
    const itensEstourados = itens.filter(
      i => Number(i.valor_consumido) > Number(i.valor_total_orcado) * 1.0 && Number(i.valor_total_orcado) > 0
    )
    const valorEstouro = itensEstourados.reduce(
      (s, i) => s + (Number(i.valor_consumido) - Number(i.valor_total_orcado)), 0
    )
    all.push({
      id: 'estouro-orcamento',
      title: 'Estouro de orçamento',
      severity: itensEstourados.length === 0 ? 'ok' : 'critical',
      summary: itensEstourados.length === 0
        ? 'Nenhum item ultrapassou o orçamento'
        : `${itensEstourados.length} item(ns) estourado(s) em ${fmtBRL(valorEstouro)}`,
      items: itensEstourados.map(i => ({
        id: i.id,
        label: `${i.codigo} — ${i.descricao}`,
        description: `Consumido: ${fmtBRL(Number(i.valor_consumido))} / Orçado: ${fmtBRL(Number(i.valor_total_orcado))}`,
        value: Number(i.valor_consumido || 0) - Number(i.valor_total_orcado || 0),
      })),
      route: '/cronograma',
      routeLabel: 'Ver WBS',
    })

    // ═══════════════════════════════════════════════════════════
    // 4. Parcelas vencidas sem pagamento
    // ═══════════════════════════════════════════════════════════
    const parcelasVencidas = parcelas.filter(
      p => p.status !== 'paga' && p.data_vencimento < today
    )
    const valorVencido = parcelasVencidas.reduce(
      (s, p) => s + (Number(p.valor) - Number(p.valor_pago || 0)), 0
    )
    all.push({
      id: 'parcelas-vencidas',
      title: 'Parcelas vencidas',
      severity: parcelasVencidas.length === 0 ? 'ok' : parcelasVencidas.length <= 3 ? 'warn' : 'critical',
      summary: parcelasVencidas.length === 0
        ? 'Nenhuma parcela vencida em aberto'
        : `${parcelasVencidas.length} parcela(s) vencida(s) — ${fmtBRL(valorVencido)} em atraso`,
      items: parcelasVencidas.slice(0, 15).map(p => ({
        id: p.id,
        label: `Parcela ${p.numero_parcela} — ${p.pedido_item || 'Sem item'}`,
        description: `Vencimento: ${new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} • Saldo: ${fmtBRL(Number(p.valor) - Number(p.valor_pago || 0))}`,
        value: Number(p.valor) - Number(p.valor_pago || 0),
        pedidoId: p.pedido_id ?? undefined,
      })),
      route: '/pagamentos',
      routeLabel: 'Ir para Pagamentos',
    })

    // ═══════════════════════════════════════════════════════════
    // 5. Medições sem distribuição
    // ═══════════════════════════════════════════════════════════
    const medDistNums = new Set(distribuicoes.map(d => d.medicao_numero))
    const medSemDist = medicoes.filter(m => !medDistNums.has(m.numero))
    all.push({
      id: 'medicoes-sem-dist',
      title: 'Medições sem distribuição',
      severity: medSemDist.length === 0 ? 'ok' : 'warn',
      summary: medSemDist.length === 0
        ? 'Todas as medições possuem distribuições configuradas'
        : `${medSemDist.length} medição(ões) sem cronograma de distribuição`,
      items: medSemDist.map(m => ({
        id: m.id,
        label: `Medição nº ${m.numero}`,
        description: `Previsto: ${fmtBRL(m.valor_planejado)} • Status: ${m.status}`,
        value: Number(m.valor_planejado || 0),
      })),
      route: '/cronograma',
      routeLabel: 'Configurar Distribuição',
    })

    // ═══════════════════════════════════════════════════════════
    // 6. Etapas sem itens de compra
    // ═══════════════════════════════════════════════════════════
    const etapasComItem = new Set(itens.map(i => i.etapa_id))
    const etapasSemItem = etapas.filter(e => !etapasComItem.has(e.id))
    all.push({
      id: 'etapas-sem-item',
      title: 'Etapas sem itens',
      severity: etapasSemItem.length === 0 ? 'ok' : 'warn',
      summary: etapasSemItem.length === 0
        ? 'Todas as etapas possuem itens de compra vinculados'
        : `${etapasSemItem.length} etapa(s) sem nenhum item de compra`,
      items: etapasSemItem.map(e => ({
        id: e.id,
        label: `${e.codigo} — ${e.nome}`,
        description: `Orçado: ${fmtBRL(e.valor_total_orcado || 0)}`,
        value: Number(e.valor_total_orcado || 0),
      })),
      route: '/cronograma',
      routeLabel: 'Ver Etapas',
    })

    // ═══════════════════════════════════════════════════════════
    // 7. Mútuos — parcelas vencidas
    // ═══════════════════════════════════════════════════════════
    const mutuoParcelasVencidas: HealthCheckItem[] = []
    mutuos.forEach(m => {
      (m.parcelas || []).forEach(p => {
        if (p.status !== 'paga' && p.data_vencimento < today) {
          mutuoParcelasVencidas.push({
            id: p.id,
            label: `${m.nome} — Parcela ${p.numero_parcela}`,
            description: `Vencimento: ${new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} • Saldo: ${fmtBRL(Number(p.valor) - Number(p.valor_pago || 0))}`,
            value: Number(p.valor) - Number(p.valor_pago || 0),
          })
        }
      })
    })
    all.push({
      id: 'mutuos-vencidos',
      title: 'Capital de giro vencido',
      severity: mutuoParcelasVencidas.length === 0 ? 'ok' : 'critical',
      summary: mutuoParcelasVencidas.length === 0
        ? 'Nenhuma parcela de mútuo em atraso'
        : `${mutuoParcelasVencidas.length} parcela(s) de mútuo vencida(s)`,
      items: mutuoParcelasVencidas,
      route: '/mutuos',
      routeLabel: 'Ver Mútuos',
    })

    // ═══════════════════════════════════════════════════════════
    // 8. Despesas indiretas — consumido vs orçado
    // ═══════════════════════════════════════════════════════════
    const despEstouradas = despesas.filter(
      d => Number(d.valor_consumido) > Number(d.valor_orcado) && Number(d.valor_orcado) > 0
    )
    all.push({
      id: 'despesas-estouradas',
      title: 'Custos indiretos estourados',
      severity: despEstouradas.length === 0 ? 'ok' : 'warn',
      summary: despEstouradas.length === 0
        ? 'Nenhuma despesa indireta acima do orçado'
        : `${despEstouradas.length} despesa(s) indireta(s) acima do orçamento`,
      items: despEstouradas.map(d => ({
        id: d.id,
        label: d.descricao,
        description: `Consumido: ${fmtBRL(Number(d.valor_consumido))} / Orçado: ${fmtBRL(Number(d.valor_orcado))}`,
        value: Number(d.valor_consumido || 0) - Number(d.valor_orcado || 0),
      })),
      route: '/despesas-indiretas',
      routeLabel: 'Ver Custos Indiretos',
    })

    // ═══════════════════════════════════════════════════════════
    // 9. Saldo de parcela oculto no fluxo (regra A — caso "Charles")
    //    parcela com movs vinculadas mas valor_pago < valor e status != paga
    //    => useCashFlowEvents pula a parcela inteira (linha 295) e o residuo
    //    nunca aparece como previsao futura.
    // ═══════════════════════════════════════════════════════════
    const saldoInvisivel: HealthCheckItem[] = []
    let valorOculto = 0
    parcelas.forEach(p => {
      const v = Number(p.valor || 0)
      const vp = Number(p.valor_pago || 0)
      const saldo = v - vp
      if (saldo <= 0.01) return
      const isPaga = p.status === 'paga' || vp >= v - 0.005
      if (isPaga) return
      const movsCount = movsByParcelaId.get(p.id)?.size ?? 0
      if (movsCount === 0) return
      const ped = p.pedido_id ? pedidoById.get(p.pedido_id) : undefined
      saldoInvisivel.push({
        id: p.id,
        label: `Pedido #${ped?.numero_pedido ?? '?'} P${p.numero_parcela} — ${ped?.fornecedor_nome ?? p.fornecedor_nome ?? 'Sem forn.'}`,
        description: `Saldo invisível: ${fmtBRL(saldo)} • Pago ${fmtBRL(vp)}/${fmtBRL(v)} via ${movsCount} mov(s)`,
        value: saldo,
        pedidoId: p.pedido_id ?? undefined,
      })
      valorOculto += saldo
    })
    all.push({
      id: 'saldo-invisivel-fluxo',
      title: 'Saldo de parcela oculto no fluxo',
      severity: saldoInvisivel.length === 0 ? 'ok' : saldoInvisivel.length <= 2 ? 'warn' : 'critical',
      summary: saldoInvisivel.length === 0
        ? 'Nenhum saldo de parcela escondido do fluxo de caixa'
        : `${saldoInvisivel.length} parcela(s) parcialmente paga(s) com ${fmtBRL(valorOculto)} oculto(s) do fluxo`,
      items: saldoInvisivel.slice(0, 30),
      route: '/pagamentos',
      routeLabel: 'Ir para Pagamentos',
    })

    // ═══════════════════════════════════════════════════════════
    // 10. Σ parcelas ≠ valor do pedido (regra B)
    // ═══════════════════════════════════════════════════════════
    const parcelasPorPedido = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      parcelasPorPedido.set(p.pedido_id, (parcelasPorPedido.get(p.pedido_id) ?? 0) + Number(p.valor || 0))
    }
    const desbalanceados: HealthCheckItem[] = []
    let totalDifB = 0
    for (const ped of pedidos) {
      if (ped.status === 'cancelado') continue
      const valor = Number(ped.valor_total_real ?? 0)
      if (valor <= 0) continue
      const somaParc = parcelasPorPedido.get(ped.id) ?? 0
      if (somaParc === 0) continue // ja coberto por "pedidos sem parcela"
      const dif = somaParc - valor
      if (Math.abs(dif) <= 0.5) continue
      desbalanceados.push({
        id: ped.id,
        label: `Pedido #${ped.numero_pedido ?? '?'} — ${ped.fornecedor_nome ?? 'Sem forn.'}`,
        description: `Pedido ${fmtBRL(valor)} • Parcelas ${fmtBRL(somaParc)} • Dif ${dif > 0 ? '+' : ''}${fmtBRL(dif)}`,
        value: Math.abs(dif),
        pedidoId: ped.id,
      })
      totalDifB += Math.abs(dif)
    }
    all.push({
      id: 'parcelas-vs-pedido',
      title: 'Σ parcelas ≠ valor do pedido',
      severity: desbalanceados.length === 0 ? 'ok' : 'critical',
      summary: desbalanceados.length === 0
        ? 'Cobertura de parcelas bate com o valor de cada pedido'
        : `${desbalanceados.length} pedido(s) com ${fmtBRL(totalDifB)} de divergência total`,
      items: desbalanceados.slice(0, 30),
      route: '/compras',
      routeLabel: 'Ir para Compras',
    })

    // ═══════════════════════════════════════════════════════════
    // 11. Baixa ≠ extrato — Σ valor_pago da parcela ≠ Σ movs vinculadas (regra C)
    // ═══════════════════════════════════════════════════════════
    const divMovParc: HealthCheckItem[] = []
    let totalDivC = 0
    parcelas.forEach(p => {
      const movsSet = movsByParcelaId.get(p.id)
      if (!movsSet || movsSet.size === 0) return
      let somaMovs = 0
      for (const movId of movsSet) {
        const mv = movById.get(movId)
        if (mv) somaMovs += Math.abs(Number(mv.valor || 0))
      }
      const dif = somaMovs - Number(p.valor_pago || 0)
      if (Math.abs(dif) <= 0.5) return
      const ped = p.pedido_id ? pedidoById.get(p.pedido_id) : undefined
      divMovParc.push({
        id: p.id,
        label: `Pedido #${ped?.numero_pedido ?? '?'} P${p.numero_parcela}`,
        description: `valor_pago ${fmtBRL(Number(p.valor_pago || 0))} ≠ Σ movs ${fmtBRL(somaMovs)} (${movsSet.size} mov(s))`,
        value: Math.abs(dif),
        pedidoId: p.pedido_id ?? undefined,
      })
      totalDivC += Math.abs(dif)
    })
    all.push({
      id: 'pago-vs-movs',
      title: 'Baixa ≠ extrato (parcelas)',
      severity: divMovParc.length === 0 ? 'ok' : 'critical',
      summary: divMovParc.length === 0
        ? 'Σ valor_pago bate com Σ das movs conciliadas em cada parcela'
        : `${divMovParc.length} parcela(s) com baixa fora do extrato (${fmtBRL(totalDivC)})`,
      items: divMovParc.slice(0, 30),
      route: '/conciliacao',
      routeLabel: 'Ir para Conciliação',
    })

    // ═══════════════════════════════════════════════════════════
    // 12. Status / valor_pago dessincronizado (regra D)
    // ═══════════════════════════════════════════════════════════
    const dessinc: HealthCheckItem[] = []
    parcelas.forEach(p => {
      const v = Number(p.valor || 0)
      const vp = Number(p.valor_pago || 0)
      if (v <= 0) return
      const ped = p.pedido_id ? pedidoById.get(p.pedido_id) : undefined
      const lbl = `Pedido #${ped?.numero_pedido ?? '?'} P${p.numero_parcela}`
      const pedId = p.pedido_id ?? undefined
      if (p.status === 'paga' && vp < v - 0.5) {
        dessinc.push({ id: p.id, label: lbl, description: `Status paga, mas pago ${fmtBRL(vp)} < valor ${fmtBRL(v)}`, value: v - vp, pedidoId: pedId })
      } else if (vp > v + 0.5) {
        dessinc.push({ id: p.id, label: lbl, description: `valor_pago ${fmtBRL(vp)} > valor ${fmtBRL(v)} (excedente ${fmtBRL(vp - v)})`, value: vp - v, pedidoId: pedId })
      }
    })
    all.push({
      id: 'parcelas-dessinc',
      title: 'Status / valor_pago dessincronizado',
      severity: dessinc.length === 0 ? 'ok' : dessinc.length <= 3 ? 'warn' : 'critical',
      summary: dessinc.length === 0
        ? 'Status das parcelas coerente com valor_pago'
        : `${dessinc.length} parcela(s) com status divergente do valor pago`,
      items: dessinc.slice(0, 30),
      route: '/pagamentos',
      routeLabel: 'Ir para Pagamentos',
    })

    return all
  }, [parcelas, pedidos, itens, etapas, medicoes, distribuicoes, mutuos, despesas, movs, linksMovs])

  // Aggregate stats
  const stats = useMemo(() => {
    const ok = checks.filter(c => c.severity === 'ok').length
    const warn = checks.filter(c => c.severity === 'warn').length
    const critical = checks.filter(c => c.severity === 'critical').length
    const totalItems = checks.reduce((s, c) => s + c.items.length, 0)
    return { ok, warn, critical, total: checks.length, totalItems }
  }, [checks])

  /**
   * Lista plana de inconsistencias — cada item ja carrega a severidade e
   * referencia da regra de origem. Ordenada por severidade (critical>warn>ok)
   * e depois pelo valor da divergencia (desc).
   */
  const flatItems = useMemo(() => {
    type FlatItem = HealthCheckItem & {
      checkId: string
      checkTitle: string
      severity: CheckSeverity
      route?: string
      routeLabel?: string
    }
    const sevOrder: Record<CheckSeverity, number> = { critical: 0, warn: 1, ok: 2 }
    const items: FlatItem[] = []
    for (const c of checks) {
      if (c.severity === 'ok') continue // ok = sem items
      for (const it of c.items) {
        items.push({
          ...it,
          checkId: c.id,
          checkTitle: c.title,
          severity: c.severity,
          route: c.route,
          routeLabel: c.routeLabel,
        })
      }
    }
    items.sort((a, b) => {
      const s = sevOrder[a.severity] - sevOrder[b.severity]
      if (s !== 0) return s
      return (b.value ?? 0) - (a.value ?? 0)
    })
    return items
  }, [checks])

  return { checks, stats, isLoading, flatItems }
}
