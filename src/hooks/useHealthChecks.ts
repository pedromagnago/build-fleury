/**
 * useHealthChecks — Conferências rápidas de integridade financeira
 *
 * Cruza dados de pedidos, parcelas, itens, medições, etapas, mútuos e
 * despesas indiretas para produzir checks de status (ok / warn / critical).
 */
import { useMemo } from 'react'
import { useParcelas } from '@/hooks/useFinanceiro'
import { usePedidos, useItensCompra } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useMedicoes, useDistribuicao } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'

export type CheckSeverity = 'ok' | 'warn' | 'critical'

export interface HealthCheckItem {
  id: string
  label: string
  description: string
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
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: itens = [] } = useItensCompra()
  const { data: etapas = [] } = useEtapas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: mutuos = [] } = useMutuos()
  const { despesas = [] } = useDespesasIndiretas()

  const isLoading = !parcelas || !pedidos || !itens || !etapas

  const checks = useMemo<HealthCheck[]>(() => {
    const today = todayISO()
    const all: HealthCheck[] = []

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
      })),
      route: '/despesas-indiretas',
      routeLabel: 'Ver Custos Indiretos',
    })

    return all
  }, [parcelas, pedidos, itens, etapas, medicoes, distribuicoes, mutuos, despesas])

  // Aggregate stats
  const stats = useMemo(() => {
    const ok = checks.filter(c => c.severity === 'ok').length
    const warn = checks.filter(c => c.severity === 'warn').length
    const critical = checks.filter(c => c.severity === 'critical').length
    const totalItems = checks.reduce((s, c) => s + c.items.length, 0)
    return { ok, warn, critical, total: checks.length, totalItems }
  }, [checks])

  return { checks, stats, isLoading }
}
