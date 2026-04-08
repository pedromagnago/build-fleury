import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { localDate, parsearCondicao, ajustarDiaUtil } from '@/lib/parcelas'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, Line } from 'recharts'
import type { Etapa } from '@/hooks/useEtapas'
import type { Distribuicao } from '@/hooks/useOperacional'
import type { Parcela } from '@/hooks/useFinanceiro'
import type { Pedido, ItemCompra } from '@/hooks/useCompras'
import type { FinancialViewMode } from './FinancialViewFilter'
import FinancialViewFilter from './FinancialViewFilter'

interface MedicaoLocal { id: string; numero: number; data_prevista: string | null; data_liberacao: string | null; status: string; valor_planejado: number }

interface CashFlowData {
  label: string
  key: string
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
  medicoes?: MedicaoLocal[]
  saldoInicial: number
  faturamentoContrato: number
  dataInicioObras: string | null
  viewMode: FinancialViewMode
  onViewModeChange: (mode: FinancialViewMode) => void
}

function fmtISO(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]!
}

export default function CashFlowChart({ etapas, distribuicoes, parcelas, pedidos, itensCompra, medicoes = [], saldoInicial, dataInicioObras, viewMode, onViewModeChange }: Props) {
  const [periodicity, setPeriodicity] = useState<'dia' | 'semana' | 'mes'>('semana')

  const chartData = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = fmtISO(today)

    type Event = { date: string, type: 'receita' | 'custo', valor: number }
    const events: Event[] = []

    if (dataInicioObras) {
      // Just to ensure chart starts here if nothing else
      events.push({ date: dataInicioObras, type: 'receita', valor: 0 })
    }

    // --- Receitas (Medições & Distribuições) ---
    // If viewMode is 'realizado', we only show fully paid medições, or proporção de dists.
    // Let's use medicoes as the source of truth for the date!
    medicoes.forEach(m => {
      // Paga = realizado. Se modo realizado e não tá paga, a gente ignora? 
      // Não, a distribuição tem casas_realizadas. Mas a data oficial do faturamento é o dia da medição.
      const dists = distribuicoes.filter(dd => dd.medicao_numero === m.numero)
      if (dists.length === 0) return

      let baseDate = m.data_liberacao || m.data_prevista || todayISO
      // Se não tá paga, e tá vencida, traz pro hoje
      if (m.status !== 'paga' && baseDate < todayISO && viewMode !== 'realizado') {
        baseDate = todayISO
      }

      dists.forEach(d => {
        let val = 0
        if (viewMode === 'realizado') {
          // Se realizado, pega a proporção de casas_realizadas
          const pct = d.casas_planejadas > 0 ? (d.casas_realizadas / d.casas_planejadas) : 0
          val = (d.valor_liberado_faturamento || 0) * (pct > 1 ? 1 : pct)
        } else {
          val = d.valor_liberado_faturamento || 0
        }
        
        if (val > 0) {
          // Usa a data do fim da distribuição se tiver, mas se for atrasada a baseDate garante que venha pro hoje
          let evDate = d.data_fim || d.data_inicio || baseDate
          if (m.status !== 'paga' && evDate < todayISO && viewMode !== 'realizado') {
             evDate = todayISO
          }
          events.push({ date: evDate, type: 'receita', valor: val })
        }
      })
    })

    // --- Custos (Parcelas firmes) ---
    parcelas.forEach(p => {
      if (viewMode === 'realizado' && p.status !== 'paga') return // Skip pending if we just want realized
      
      let date = p.data_vencimento || todayISO
      if (p.data_pagamento_real) {
         date = p.data_pagamento_real // Sempre confia no real se tiver pago
      } else if (date < todayISO && viewMode !== 'realizado') {
         date = todayISO // Vencido e não pago: traz para hoje
      }

      const val = viewMode === 'realizado' ? (p.valor_pago || 0) : p.valor
      if (val > 0) {
        events.push({ date, type: 'custo', valor: val })
      }
    })

    // --- Custos (Pedidos confirmados mas sem parcela) ---
    if (viewMode === 'pedidos' || viewMode === 'planejado') { // Pedidos includes both
      const parcelaPedidoIds = new Set(parcelas.map(p => p.pedido_id).filter(Boolean))
      pedidos
        .filter(p => p.status === 'confirmado' && !parcelaPedidoIds.has(p.id))
        .forEach(p => {
          let date = p.data_entrega_prevista || todayISO
          if (date < todayISO) date = todayISO
          events.push({ date, type: 'custo', valor: p.valor_total_real ?? 0 })
        })
    }

    // --- Custos (Planejado bruto de itens) ---
    if (viewMode === 'planejado') {
      const pedidosPorItem = new Map<string, number>()
      pedidos.forEach(p => {
        pedidosPorItem.set(p.item_compra_id, (pedidosPorItem.get(p.item_compra_id) ?? 0) + (p.valor_total_real ?? 0))
      })

      const etapaDateMap = new Map<string, string>()
      const distByEtapa = new Map<string, Distribuicao[]>()
      distribuicoes.forEach(d => {
        if (!distByEtapa.has(d.etapa_id)) distByEtapa.set(d.etapa_id, [])
        distByEtapa.get(d.etapa_id)!.push(d)
      })

      etapas.forEach(e => {
        const dists = distByEtapa.get(e.id) ?? []
        const withDate = dists.filter(dd => dd.data_fim || dd.data_inicio).sort((a, b) => (a.data_inicio || '').localeCompare(b.data_inicio || ''))
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

        const baseDate = etapaDateMap.get(item.etapa_id) || todayISO
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
          
          let dateStr = fmtISO(adjusted)
          if (dateStr < todayISO) dateStr = todayISO

          const val = i === n - 1 ? valorUlt : valorBase
          events.push({ date: dateStr, type: 'custo', valor: val })
        }
      }
    }

    if (events.length === 0) return []

    // --- Bucketing Logic ---
    const allDates = events.map(e => localDate(e.date).getTime())
    const minDateTs = Math.min(...allDates)
    const maxDateTs = Math.max(...allDates)
    
    let minDate = new Date(minDateTs)
    // Always pad end manually 3 months to see the future trend clearly
    const maxDate = new Date(maxDateTs)
    maxDate.setMonth(maxDate.getMonth() + 3)

    const buckets: { key: string, label: string, receita: number, custo: number, dateStartMs: number }[] = []
    
    // We will generate the timeline depending on periodicity
    // For 'dia', to prevent lag, we limit to 180 points approx
    let cursor = new Date(minDate)
    
    if (periodicity === 'mes') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      while (cursor < maxDate) {
        const m = cursor.getMonth()
        const y = cursor.getFullYear()
        const label = `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m]}/${String(y).slice(2)}`
        buckets.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, label, receita: 0, custo: 0, dateStartMs: cursor.getTime() })
        cursor.setMonth(cursor.getMonth() + 1)
      }
    } else if (periodicity === 'semana') {
      cursor.setDate(cursor.getDate() - cursor.getDay() + 1) // start on Monday
      while (cursor < maxDate) {
        const label = `${String(cursor.getDate()).padStart(2,'0')}/${String(cursor.getMonth() + 1).padStart(2,'0')}`
        buckets.push({ key: fmtISO(cursor), label, receita: 0, custo: 0, dateStartMs: cursor.getTime() })
        cursor.setDate(cursor.getDate() + 7)
      }
    } else { // dia
      // Create up to 180 points maximum to prevent rechart lag
      const diffDays = Math.ceil((maxDate.getTime() - cursor.getTime()) / 86400000)
      const step = diffDays > 120 ? Math.ceil(diffDays / 120) : 1
      while (cursor < maxDate) {
        const label = `${String(cursor.getDate()).padStart(2,'0')}/${String(cursor.getMonth() + 1).padStart(2,'0')}`
        buckets.push({ key: fmtISO(cursor), label, receita: 0, custo: 0, dateStartMs: cursor.getTime() })
        cursor.setDate(cursor.getDate() + Math.max(1, step))
      }
    }

    // Populate buckets
    // Sorting buckets just to be sure
    buckets.sort((a,b) => a.dateStartMs - b.dateStartMs)

    events.forEach(e => {
        const ems = localDate(e.date).getTime()
        let targetBucket = buckets[0]
        for (let i = buckets.length - 1; i >= 0; i--) {
            if (ems >= buckets[i]!.dateStartMs) {
               targetBucket = buckets[i]
               break
            }
        }
        if (targetBucket) {
           if (e.type === 'receita') targetBucket.receita += e.valor
           if (e.type === 'custo') targetBucket.custo += e.valor
        }
    })

    // Accumulate
    let acumReceita = 0
    let acumCusto = 0
    let saldo = saldoInicial

    return buckets.map(b => {
      acumReceita += b.receita
      acumCusto += b.custo
      saldo += b.receita - b.custo
      return {
        label: b.label,
        key: b.key,
        receita: b.receita, 
        custo: b.custo, 
        saldo,
        acumuladoReceita: acumReceita,
        acumuladoCusto: acumCusto,
        acumuladoSaldo: saldo,
      } as CashFlowData
    })
  }, [distribuicoes, parcelas, pedidos, itensCompra, medicoes, saldoInicial, dataInicioObras, viewMode, etapas, periodicity])

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
          <div className="flex rounded-lg border bg-card">
            {(['dia', 'semana', 'mes'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriodicity(p)}
                className={`px-3 py-1.5 text-[10px] font-medium uppercase transition-colors ${
                  periodicity === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                } ${p === 'dia' ? 'rounded-l-lg' : ''} ${p === 'mes' ? 'rounded-r-lg' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>
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
            <linearGradient id="gradientSaldo2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="acumuladoSaldo" name="Saldo Acum." stroke="#10b981" fill="url(#gradientSaldo2)" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="acumuladoReceita" name="Receita Acum." stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          <Line type="monotone" dataKey="acumuladoCusto" name="Custo Acum." stroke="#f87171" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

