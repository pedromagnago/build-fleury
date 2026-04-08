import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { localDate, parsearCondicao, ajustarDiaUtil } from '@/lib/parcelas'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, Line } from 'recharts'
import type { Etapa } from '@/hooks/useEtapas'
import type { Distribuicao } from '@/hooks/useOperacional'
import type { Parcela } from '@/hooks/useFinanceiro'
import type { Pedido, ItemCompra } from '@/hooks/useCompras'
import type { FinancialViewMode } from './FinancialViewFilter'
import FinancialViewFilter from './FinancialViewFilter'

interface CashFlowData {
  label: string
  month: string
  receita: number
  custo: number
  saldo: number
  acumuladoReceita: number
  acumuladoCusto: number
  acumuladoSaldo: number
}

interface Props {
  etapas: Etapa[]
  distribuicoes: Distribuicao[]
  parcelas: Parcela[]
  pedidos: Pedido[]
  itensCompra: ItemCompra[]
  saldoInicial: number
  faturamentoContrato: number
  dataInicioObras: string | null
  viewMode: FinancialViewMode
  onViewModeChange: (mode: FinancialViewMode) => void
}

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CashFlowChart({ etapas, distribuicoes, parcelas, pedidos, itensCompra, saldoInicial, dataInicioObras, viewMode, onViewModeChange }: Props) {
  const chartData = useMemo(() => {
    const dates: Date[] = []
    if (dataInicioObras) dates.push(localDate(dataInicioObras))

    // --- Filter distributions based on viewMode ---
    let filteredDists: Distribuicao[]
    if (viewMode === 'realizado') {
      filteredDists = distribuicoes.filter(d => d.casas_realizadas > 0)
    } else {
      filteredDists = distribuicoes
    }

    // --- Filter parcelas based on viewMode ---
    let filteredParcelas: Parcela[]
    if (viewMode === 'realizado') {
      filteredParcelas = parcelas.filter(p => p.status === 'paga')
    } else {
      filteredParcelas = parcelas
    }

    // --- Pedidos confirmados sem parcelas (modo 'pedidos') ---
    const pedidoCosts: { date: string; valor: number }[] = []
    if (viewMode === 'pedidos') {
      const parcelaPedidoIds = new Set(parcelas.map(p => p.pedido_id).filter(Boolean))
      pedidos
        .filter(p => p.status === 'confirmado' && !parcelaPedidoIds.has(p.id) && p.data_entrega_prevista)
        .forEach(p => {
          pedidoCosts.push({ date: p.data_entrega_prevista!, valor: p.valor_total_real ?? 0 })
        })
    }

    // --- Custo planejado (Nível 1 bruto): itens sem pedido ---
    // Para cada item_compra sem pedido, calcular quando o custo ocorre:
    //   - baseDate = data_fim ou data_inicio da primeira distribuição da etapa
    //   - Aplica cond_pagamento do item → gerar vencimentos
    //   - valor = valor_total_orcado - valor_consumido já em pedidos
    const brutoCosts: { date: string; valor: number }[] = []
    if (viewMode === 'planejado' || viewMode === 'pedidos') {
      // Montar mapa de quanto já tem pedidos por item
      const pedidosPorItem = new Map<string, number>()
      pedidos.forEach(p => {
        pedidosPorItem.set(p.item_compra_id, (pedidosPorItem.get(p.item_compra_id) ?? 0) + (p.valor_total_real ?? 0))
      })

      // Mapa de datas por etapa (primeira distribuição com data)
      const etapaDateMap = new Map<string, string>()
      // Tentar usar distribuições com datas, senão a data_inicio_plan da etapa
      const distByEtapa = new Map<string, Distribuicao[]>()
      distribuicoes.forEach(d => {
        if (!distByEtapa.has(d.etapa_id)) distByEtapa.set(d.etapa_id, [])
        distByEtapa.get(d.etapa_id)!.push(d)
      })

      etapas.forEach(e => {
        const dists = distByEtapa.get(e.id) ?? []
        // Primeira distribuição com data
        const withDate = dists
          .filter(d => d.data_fim || d.data_inicio)
          .sort((a, b) => {
            const da = a.data_inicio || a.data_fim || ''
            const db = b.data_inicio || b.data_fim || ''
            return da.localeCompare(db)
          })
        if (withDate.length > 0) {
          etapaDateMap.set(e.id, withDate[0]!.data_fim || withDate[0]!.data_inicio!)
        } else if (e.data_inicio_plan) {
          etapaDateMap.set(e.id, e.data_inicio_plan)
        }
      })

      for (const item of itensCompra) {
        const comPedido = pedidosPorItem.get(item.id) ?? 0
        const semPedido = Math.max(0, (item.valor_total_orcado ?? 0) - comPedido - (item.valor_consumido ?? 0))
        if (semPedido <= 0) continue

        const baseDate = etapaDateMap.get(item.etapa_id)
        if (!baseDate) continue

        // Parsear condição de pagamento do item (ou fallback "à vista")
        const cond = item.cond_pagamento || 'à vista'
        const diasParcelas = parsearCondicao(cond)
        const n = diasParcelas.length
        const valorBase = Math.floor((semPedido * 100) / n) / 100
        const somaBase = Math.round(valorBase * (n - 1) * 100) / 100
        const valorUlt = Math.round((semPedido - somaBase) * 100) / 100

        const dtBase = localDate(baseDate)
        for (let i = 0; i < n; i++) {
          const dt = new Date(dtBase.getTime())
          dt.setDate(dt.getDate() + diasParcelas[i]!)
          const adjusted = ajustarDiaUtil(dt)
          const val = i === n - 1 ? valorUlt : valorBase
          brutoCosts.push({ date: fmtISO(adjusted), valor: val })
        }
      }
    }

    // Collect all dates
    filteredDists.forEach(d => {
      if (d.data_inicio) dates.push(localDate(d.data_inicio))
      if (d.data_fim) dates.push(localDate(d.data_fim))
    })

    filteredParcelas.forEach(p => {
      dates.push(localDate(p.data_vencimento))
      if (p.data_pagamento_real) dates.push(localDate(p.data_pagamento_real))
    })

    pedidoCosts.forEach(p => dates.push(localDate(p.date)))
    brutoCosts.forEach(p => dates.push(localDate(p.date)))

    if (dates.length === 0) return []

    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    const projectedMax = new Date(maxDate)
    projectedMax.setMonth(projectedMax.getMonth() + 3)

    const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    const end = new Date(projectedMax.getFullYear(), projectedMax.getMonth() + 1, 1)

    const months: { year: number; month: number; key: string; label: string }[] = []
    const cursor = new Date(start)
    while (cursor < end) {
      const m = cursor.getMonth()
      const y = cursor.getFullYear()
      const label = `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m]}/${String(y).slice(2)}`
      months.push({ year: y, month: m, key: `${y}-${String(m + 1).padStart(2, '0')}`, label })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    // Receita by month
    const receitaByMonth = new Map<string, number>()
    filteredDists.forEach(d => {
      const dt = d.data_fim || d.data_inicio
      if (!dt) return
      const date = localDate(dt)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      receitaByMonth.set(key, (receitaByMonth.get(key) || 0) + (d.valor_liberado_faturamento || 0))
    })

    // Custo by month (parcelas + pedidos + bruto)
    const custoByMonth = new Map<string, number>()
    filteredParcelas.forEach(p => {
      const date = localDate(p.data_vencimento)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      custoByMonth.set(key, (custoByMonth.get(key) || 0) + (p.valor || 0))
    })

    pedidoCosts.forEach(p => {
      const date = localDate(p.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      custoByMonth.set(key, (custoByMonth.get(key) || 0) + p.valor)
    })

    // Add bruto costs
    brutoCosts.forEach(p => {
      const date = localDate(p.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      custoByMonth.set(key, (custoByMonth.get(key) || 0) + p.valor)
    })

    // Build chart data
    let acumReceita = 0
    let acumCusto = 0
    let saldo = saldoInicial

    const data: CashFlowData[] = months.map(m => {
      const receita = receitaByMonth.get(m.key) || 0
      const custo = custoByMonth.get(m.key) || 0
      acumReceita += receita
      acumCusto += custo
      saldo += receita - custo

      return {
        label: m.label,
        month: m.key,
        receita, custo, saldo,
        acumuladoReceita: acumReceita,
        acumuladoCusto: acumCusto,
        acumuladoSaldo: saldo,
      }
    })

    return data
  }, [distribuicoes, parcelas, pedidos, itensCompra, saldoInicial, dataInicioObras, viewMode, etapas])

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fluxo de Caixa do Projeto</h3>
          <FinancialViewFilter value={viewMode} onChange={onViewModeChange} />
        </div>
        <p className="text-xs text-muted-foreground text-center py-8">
          Sem dados suficientes para o gráfico de fluxo de caixa. Cadastre distribuições com datas e parcelas para visualizar.
        </p>
      </div>
    )
  }

  const modeLabel = viewMode === 'realizado' ? 'Apenas dados confirmados (pagos/realizados)' :
    viewMode === 'planejado' ? 'Confirmados + planejados/futuros' :
    'Confirmados + planejados + pedidos confirmados'

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg text-xs">
        <p className="font-bold mb-1.5">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex justify-between gap-4">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-semibold">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fluxo de Caixa do Projeto</h3>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{modeLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <FinancialViewFilter value={viewMode} onChange={onViewModeChange} />
          <div className="flex items-center gap-3 text-[10px] border-l pl-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Saldo</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Receita</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Custo</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="gradientSaldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="acumuladoSaldo" name="Saldo Acum." stroke="#10b981" fill="url(#gradientSaldo)" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="acumuladoReceita" name="Receita Acum." stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          <Line type="monotone" dataKey="acumuladoCusto" name="Custo Acum." stroke="#f87171" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
