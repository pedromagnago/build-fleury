import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, Line } from 'recharts'
import type { FinancialViewMode } from './FinancialViewFilter'
import FinancialViewFilter from './FinancialViewFilter'
import { useCashFlowEvents, type CashFlowEvent } from '@/hooks/useCashFlowEvents'

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
  viewMode: FinancialViewMode
  onViewModeChange: (mode: FinancialViewMode) => void
}

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CashFlowChart({ viewMode, onViewModeChange }: Props) {
  const [periodicity, setPeriodicity] = useState<'dia' | 'semana' | 'mes'>('semana')
  const { events, saldoInicial } = useCashFlowEvents(viewMode)

  const chartData = useMemo(() => {
    if (events.length === 0) return []

    // ─── Build timeline buckets ────────────────────────────

    const allDates = events.map(e => localDate(e.date).getTime())
    const minDateTs = Math.min(...allDates)
    const maxDateTs = Math.max(...allDates)

    let minDate = new Date(minDateTs)
    const maxDate = new Date(maxDateTs)
    maxDate.setMonth(maxDate.getMonth() + 3) // pad 3 months

    const buckets: { key: string, label: string, receita: number, custo: number, dateStartMs: number }[] = []

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
        const label = `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`
        buckets.push({ key: fmtISO(cursor), label, receita: 0, custo: 0, dateStartMs: cursor.getTime() })
        cursor.setDate(cursor.getDate() + 7)
      }
    } else { // dia
      const diffDays = Math.ceil((maxDate.getTime() - cursor.getTime()) / 86400000)
      const step = diffDays > 120 ? Math.ceil(diffDays / 120) : 1
      while (cursor < maxDate) {
        const label = `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`
        buckets.push({ key: fmtISO(cursor), label, receita: 0, custo: 0, dateStartMs: cursor.getTime() })
        cursor.setDate(cursor.getDate() + Math.max(1, step))
      }
    }

    buckets.sort((a, b) => a.dateStartMs - b.dateStartMs)

    // ─── Allocate events to buckets ────────────────────────

    events.forEach((e: CashFlowEvent) => {
      const ems = localDate(e.date).getTime()
      let targetBucket = buckets[0]
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (ems >= buckets[i]!.dateStartMs) {
          targetBucket = buckets[i]
          break
        }
      }
      if (targetBucket) {
        if (e.type === 'entrada') targetBucket.receita += e.valor
        if (e.type === 'firme' || e.type === 'bruto') targetBucket.custo += e.valor
      }
    })

    // ─── Accumulate ────────────────────────────────────────

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
  }, [events, saldoInicial, periodicity])

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
