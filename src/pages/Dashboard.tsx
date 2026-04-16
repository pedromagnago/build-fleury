import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useDashboardKPIs } from '@/hooks/useFinanceiro'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useEtapas } from '@/hooks/useEtapas'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useMedicoes, useAvancos } from '@/hooks/useOperacional'

import { supabase } from '@/lib/supabase'
import { localDate } from '@/lib/parcelas'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils'
import {
  LayoutDashboard, TrendingUp, TrendingDown,
  Target, PiggyBank, AlertTriangle, Calendar,
  FileText, ArrowDown, Clock, CheckCircle2,
  ShieldCheck, Layers,
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, PieChart, Pie,
} from 'recharts'
import OnboardingPanel from '@/components/OnboardingPanel'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// ═══════════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { currentCompany } = useProject()
  const { data: kpis, isLoading } = useDashboardKPIs()
  const { restartTour } = useTour('dashboard', pageTours.dashboard)

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Visão geral do projeto" icon={LayoutDashboard} />
        <div className="flex h-60 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      </div>
    )
  }

  if (!kpis || !currentCompany) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Visão geral do projeto" icon={LayoutDashboard} />
        <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed">
          <p className="text-sm text-muted-foreground">Selecione um projeto para ver os indicadores</p>
        </div>
      </div>
    )
  }

  const projectName = currentCompany.nome_fantasia ?? currentCompany.razao_social

  return (
    <div>
      <PageHeader title="Dashboard" description={projectName} icon={LayoutDashboard} onHelp={restartTour} />

      {/* Onboarding Panel */}
      <div id="tour-onboarding-panel">
        <OnboardingPanel />
      </div>

      {/* ROW 1: Regra de Ouro — 3-segment bar */}
      <div id="tour-regra-ouro">
        <RegraDeOuro orcado={kpis.totalOrcado} consumido={kpis.totalConsumido} firme={kpis.planejadoFirme} bruto={kpis.planejadoBruto} />
      </div>

      {/* ROW 2: 5 KPI Cards */}
      <div id="tour-kpi-cards" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Orçamento Total" value={formatCurrency(kpis.totalOrcado)} icon={Target} accent="blue" />
        <KpiCard label="Total Consumido" value={formatCurrency(kpis.totalConsumido)} icon={PiggyBank} accent="amber" sub={formatPercent(kpis.percentualConsumido)} />
        <KpiCard label="Total Pago" value={formatCurrency(kpis.totalPago)} icon={CheckCircle2} accent="emerald" sub={formatPercent(kpis.percentualPago)} />
        <KpiCard label="Saldo Disponível" value={formatCurrency(kpis.saldoOrcamento)} icon={kpis.saldoOrcamento >= 0 ? TrendingUp : TrendingDown} accent={kpis.saldoOrcamento >= 0 ? 'emerald' : 'red'} />
        <KpiCard label="Cobertura Pedidos" value={`${kpis.coberturaPercent.toFixed(0)}%`} icon={ShieldCheck} accent={kpis.coberturaPercent >= 80 ? 'emerald' : kpis.coberturaPercent >= 50 ? 'amber' : 'red'} sub={`${formatCurrency(kpis.comPedido)} de ${formatCurrency(kpis.totalOrcado)}`} />
      </div>

      {/* ROW 3: Fluxo de Caixa (2/3) + Maturidade Donut (1/3) */}
      <div id="tour-fluxo-caixa" className="mb-5 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FluxoCaixaWidget />
        </div>
        <MaturidadeWidget consumido={kpis.totalConsumido} firme={kpis.planejadoFirme} bruto={kpis.planejadoBruto} cobertura={kpis.coberturaPercent} />
      </div>

      {/* ROW 4: EVM (1/3) + Curva S (2/3) */}
      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <EvmWidget />
        <div className="lg:col-span-2">
          <CurvaSWidget />
        </div>
      </div>

      {/* ROW 5: Top Desvios (1/2) + Próximos Pagamentos (1/2) */}
      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <TopDesviosWidget />
        <ProximosPagamentosWidget />
      </div>

      {/* ROW 6: Medições (1/2) + Saldo Mínimo (1/2) */}
      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <MedicoesWidget />
        <SaldoMinimoWidget />
      </div>

      {/* ROW 7: IA Docs (1/2) + Avanço Físico (1/2) */}
      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <IADocumentosWidget />
        <AvancoFisicoWidget />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// W1 — Regra de Ouro (3-segment bar)
// ═══════════════════════════════════════════════════════════════
function RegraDeOuro({ orcado, consumido, firme, bruto }: { orcado: number; consumido: number; firme: number; bruto: number }) {
  const pctConsum = orcado > 0 ? (consumido / orcado) * 100 : 0
  const pctFirme = orcado > 0 ? (firme / orcado) * 100 : 0
  const pctBruto = orcado > 0 ? (bruto / orcado) * 100 : 0

  return (
    <div className="mb-5 rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />Regra de Ouro — Composição do Orçamento
        </h3>
        <span className="text-[10px] font-bold tabular-nums">{formatCurrency(orcado)}</span>
      </div>
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted">
        {/* Consumido (green) */}
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(pctConsum, 100)}%` }} />
        {/* Firme (blue) */}
        <div className="absolute inset-y-0 bg-blue-500 transition-all duration-700" style={{ left: `${Math.min(pctConsum, 100)}%`, width: `${Math.min(pctFirme, 100 - pctConsum)}%` }} />
        {/* Bruto (gray/dashed) */}
        <div className="absolute inset-y-0 bg-slate-400/60 transition-all duration-700" style={{ left: `${Math.min(pctConsum + pctFirme, 100)}%`, width: `${Math.min(pctBruto, 100 - pctConsum - pctFirme)}%` }} />
      </div>
      {/* Legend row */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Consumido: <strong>{formatCurrency(consumido)}</strong> ({pctConsum.toFixed(1)}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Firme (c/ pedido): <strong>{formatCurrency(firme)}</strong> ({pctFirme.toFixed(1)}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400/60" />
          Bruto (s/ pedido): <strong>{formatCurrency(bruto)}</strong> ({pctBruto.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// W2 — KPI Card
// ═══════════════════════════════════════════════════════════════
function KpiCard({ label, value, icon: Icon, accent, sub }: {
  label: string; value: string; icon: typeof Clock; accent: string; sub?: string
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500',
    amber: 'bg-amber-500/10 text-amber-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    red: 'bg-red-500/10 text-red-500',
    primary: 'bg-primary/10 text-primary',
  }
  return (
    <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={`rounded-lg p-1.5 ${colors[accent] ?? colors['blue']}`}><Icon className="h-3.5 w-3.5" /></div>
      </div>
      <p className="mt-1.5 text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// W3 — Fluxo de Caixa Projetado (Level 1 + Level 2)
// ═══════════════════════════════════════════════════════════════
function FluxoCaixaWidget() {
  const [viewMode, setViewMode] = useState<'consolidado' | 'maturidade'>('maturidade')
  const [periodicity, setPeriodicity] = useState<'dia' | 'semana' | 'mes'>('semana')
  const { events, saldoInicial } = useCashFlowEvents('pedidos')

  const chartData = useMemo(() => {
    if (events.length === 0) return []

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const fmtISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    type TimelineBucket = { dateTarget: string, dateLabel: string, entradas: number, firme: number, bruto: number, saldo: number }
    const timeline: TimelineBucket[] = []

    // Compute starting saldo: saldoInicial is already the base; however, events
    // may include already-paid parcelas, so we adjust for events before the timeline
    let acum = saldoInicial

    if (periodicity === 'dia') {
      const step = 2
      for (let i = 0; i < 90; i += step) {
        const d = new Date(today)
        d.setDate(d.getDate() + i)
        const iso = fmtISO(d)
        const dStr = iso.slice(8) + '/' + iso.slice(5, 7)
        timeline.push({ dateTarget: iso, dateLabel: dStr, entradas: 0, firme: 0, bruto: 0, saldo: 0 })
      }
    } else if (periodicity === 'semana') {
      const getMonday = (d: Date) => {
        const d2 = new Date(d)
        const day = d2.getDay()
        const diff = d2.getDate() - day + (day === 0 ? -6 : 1)
        d2.setDate(diff)
        d2.setHours(0, 0, 0, 0)
        return d2
      }
      for (let i = 0; i < 24; i++) {
        const d = getMonday(today)
        d.setDate(d.getDate() + i * 7)
        const iso = fmtISO(d)
        timeline.push({ dateTarget: iso, dateLabel: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, entradas: 0, firme: 0, bruto: 0, saldo: 0 })
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
        const iso = fmtISO(d).substring(0, 7)
        timeline.push({ dateTarget: iso, dateLabel: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), entradas: 0, firme: 0, bruto: 0, saldo: 0 })
      }
    }

    // Allocate events to buckets
    events.forEach(e => {
      let bucket
      if (periodicity === 'dia') {
        const idx = timeline.findIndex(t => t.dateTarget >= e.date)
        bucket = idx !== -1 ? timeline[idx] : timeline[timeline.length - 1]
      } else if (periodicity === 'semana') {
        const idx = timeline.findIndex((t, i) => {
          const next = timeline[i + 1]?.dateTarget
          return e.date >= t.dateTarget && (!next || e.date < next)
        })
        bucket = idx !== -1 ? timeline[idx] : timeline[timeline.length - 1]
      } else {
        const m = e.date.substring(0, 7)
        bucket = timeline.find(t => t.dateTarget === m) || timeline[timeline.length - 1]
      }

      if (bucket) {
        if (e.type === 'entrada') bucket.entradas += e.valor
        else if (e.type === 'firme') bucket.firme += e.valor
        else bucket.bruto += e.valor
      }
    })

    // Desconta parcelas pagas que ocorreram ANTES do início do timeline
    // (elas já estão nos events como tipo 'firme' com datas no passado,
    // mas o hook move vencidas->hoje, então isso é coberto automaticamente)

    // Accumulate saldo
    timeline.forEach(t => {
      acum = acum + t.entradas - t.firme - t.bruto
      t.saldo = acum
    })

    return timeline
  }, [events, saldoInicial, periodicity])

  return (
    <WidgetCard title="Fluxo de Caixa Projetado" icon={TrendingUp}>
      {/* Toggles */}
      <div className="mb-2 flex items-center justify-between text-[9px]">
        <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
          {(['dia', 'semana', 'mes'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodicity(p)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${periodicity === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-muted/80'}`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
          {(['consolidado', 'maturidade'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${viewMode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-muted/80'}`}
            >
              {m === 'consolidado' ? 'Consolidado' : 'Por Maturidade'}
            </button>
          ))}
        </div>
      </div>
      {chartData.length === 0 ? <EmptyChart /> : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(value: unknown, name: unknown) => {
                const v = Number(value) || 0
                const n = String(name ?? '')
                const labels: Record<string, string> = { saldo: 'Saldo', firme: 'Saídas Firmes', bruto: 'Saídas Projetadas', entradas: 'Entradas' }
                return [formatCurrency(v), labels[n] ?? n]
              }}
              labelFormatter={(v: unknown, payload: any) => payload?.[0]?.payload?.dateLabel || String(v)}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            {viewMode === 'consolidado' ? (
              <Area type="monotone" dataKey="saldo" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
            ) : (
              <>
                <Area type="monotone" dataKey="entradas" stroke="#22c55e" fill="#22c55e" fillOpacity={0} strokeWidth={1.5} strokeDasharray="2 2" stackId="opt" />
                <Area type="monotone" dataKey="firme" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={1.5} stackId="out" />
                <Area type="monotone" dataKey="bruto" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeWidth={1.5} strokeDasharray="4 2" stackId="out" />
                <Area type="monotone" dataKey="saldo" stroke="#22c55e" fill="none" strokeWidth={2} />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
      {viewMode === 'maturidade' && (
        <div className="flex items-center justify-center gap-4 pt-1 text-[9px]">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-emerald-500/30" style={{ borderTop: '2px dashed #22c55e' }} />Entradas</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-blue-500/70" />Firme (S)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-slate-400/50" style={{ borderTop: '2px dashed #94a3b8' }} />Proj (S)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-emerald-500 rounded" />Saldo</span>
        </div>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W3b — Maturidade do Fluxo (Donut)
// ═══════════════════════════════════════════════════════════════
function MaturidadeWidget({ consumido, firme, bruto, cobertura }: { consumido: number; firme: number; bruto: number; cobertura: number }) {
  const total = consumido + firme + bruto
  const data = [
    { name: 'Consumido', value: consumido, fill: '#22c55e' },
    { name: 'Firme', value: firme, fill: '#3b82f6' },
    { name: 'Bruto', value: bruto, fill: '#94a3b8' },
  ].filter((d) => d.value > 0)

  return (
    <WidgetCard title="Maturidade do Fluxo" icon={ShieldCheck}>
      {total === 0 ? <EmptyChart msg="Sem dados de orçamento" /> : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                formatter={(value: unknown) => [formatCurrency(Number(value) || 0)]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Labels */}
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Consumido</span>
              <span className="font-bold">{total > 0 ? ((consumido / total) * 100).toFixed(0) : 0}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500" /> Firme (c/ pedido)</span>
              <span className="font-bold">{total > 0 ? ((firme / total) * 100).toFixed(0) : 0}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-400" /> Bruto (s/ pedido)</span>
              <span className="font-bold">{total > 0 ? ((bruto / total) * 100).toFixed(0) : 0}%</span>
            </div>
          </div>
          {/* Coverage bar */}
          <div className="mt-3 rounded-lg bg-muted/30 p-2.5">
            <div className="flex items-center justify-between text-[9px] mb-1">
              <span className="font-semibold text-muted-foreground">Cobertura de Pedidos</span>
              <span className="font-bold">{cobertura.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${cobertura >= 80 ? 'bg-emerald-500' : cobertura >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(cobertura, 100)}%` }}
              />
            </div>
          </div>
        </>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W4 — EVM Indicators
// ═══════════════════════════════════════════════════════════════
function EvmWidget() {
  const { data: etapas = [] } = useEtapas()
  const { data: avancos = [] } = useAvancos()
  const { data: parcelas = [] } = useParcelas()

  const evm = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!
    const totalOrcado = etapas.reduce((s, e) => s + (e.valor_total_orcado ?? 0), 0)

    // PV: planned value of stages that should be done by now
    const PV = etapas
      .filter((e) => e.data_fim_plan && e.data_fim_plan <= today)
      .reduce((s, e) => s + (e.valor_total_orcado ?? 0), 0)

    // EV: earned value based on actual progress
    const EV = etapas.reduce((s, e) => {
      const totalCasas = e.casas_total || 1
      const casasDone = avancos
        .filter((a) => a.etapa_id === e.id)
        .reduce((sa, a) => sa + a.casas_concluidas, 0)
      const pct = Math.min(casasDone / totalCasas, 1)
      return s + (e.valor_total_orcado ?? 0) * pct
    }, 0)

    // AC: actual cost (parcelas pagas)
    const AC = parcelas
      .filter((p) => p.status === 'paga')
      .reduce((s, p) => s + p.valor_pago, 0)

    const SPI = PV > 0 ? EV / PV : 1
    const CPI = AC > 0 ? EV / AC : 1
    const EAC = CPI > 0 ? AC + (totalOrcado - EV) / CPI : totalOrcado

    return { PV, EV, AC, SPI, CPI, EAC, totalOrcado }
  }, [etapas, parcelas, avancos])

  const semaforo = (val: number) =>
    val >= 1 ? 'text-emerald-500 bg-emerald-500/10' :
    val >= 0.8 ? 'text-amber-500 bg-amber-500/10' :
    'text-red-500 bg-red-500/10'

  return (
    <WidgetCard title="Indicadores EVM" icon={Target}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniMetric label="PV (Planejado)" value={formatCurrency(evm.PV)} />
          <MiniMetric label="EV (Agregado)" value={formatCurrency(evm.EV)} />
          <MiniMetric label="AC (Real)" value={formatCurrency(evm.AC)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className={`rounded-lg p-2.5 text-center ${semaforo(evm.SPI)}`}>
            <p className="text-[9px] font-semibold uppercase">SPI</p>
            <p className="text-lg font-bold">{evm.SPI.toFixed(2)}</p>
            <p className="text-[8px]">{evm.SPI >= 1 ? 'Adiantado' : 'Atrasado'}</p>
          </div>
          <div className={`rounded-lg p-2.5 text-center ${semaforo(evm.CPI)}`}>
            <p className="text-[9px] font-semibold uppercase">CPI</p>
            <p className="text-lg font-bold">{evm.CPI.toFixed(2)}</p>
            <p className="text-[8px]">{evm.CPI >= 1 ? 'Abaixo orçam.' : 'Acima orçam.'}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase text-muted-foreground">EAC</p>
            <p className="text-sm font-bold">{formatCurrency(evm.EAC)}</p>
            <p className="text-[8px] text-muted-foreground">Est. Conclusão</p>
          </div>
        </div>
      </div>
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W5 — Curva S
// ═══════════════════════════════════════════════════════════════
function CurvaSWidget() {
  const { currentCompany } = useProject()
  const { data: etapas = [] } = useEtapas()
  const { data: parcelas = [] } = useParcelas()
  const { data: avancos = [] } = useAvancos()

  const chartData = useMemo(() => {
    if (!currentCompany?.data_inicio_obras || etapas.length === 0) return []

    const inicio = localDate(currentCompany.data_inicio_obras)
    const today = new Date()
    const weeks: Array<{ week: number; pv: number; ev: number; ac: number }> = []

    let pvAcc = 0, evAcc = 0, acAcc = 0
    const totalWeeks = Math.ceil((today.getTime() - inicio.getTime()) / (7 * 86400000)) + 4

    for (let w = 0; w <= Math.min(totalWeeks, 52); w++) {
      const weekEnd = new Date(inicio)
      weekEnd.setDate(weekEnd.getDate() + w * 7)
      const weekISO = weekEnd.toISOString().split('T')[0]!

      // PV: stages planned to finish by this week
      const pvWeek = etapas
        .filter((e) => e.data_fim_plan && e.data_fim_plan <= weekISO)
        .reduce((s, e) => s + (e.valor_total_orcado ?? 0), 0)
      pvAcc = pvWeek

      // EV: earned from progress up to this week
      evAcc = etapas.reduce((s, e) => {
        const casasDone = avancos
          .filter((a) => a.etapa_id === e.id && a.data_registro <= weekISO)
          .reduce((sa, a) => sa + a.casas_concluidas, 0)
        const pct = Math.min(casasDone / (e.casas_total || 1), 1)
        return s + (e.valor_total_orcado ?? 0) * pct
      }, 0)

      // AC: paid parcelas up to this week
      acAcc = parcelas
        .filter((p) => p.status === 'paga' && p.data_pagamento_real && p.data_pagamento_real <= weekISO)
        .reduce((s, p) => s + p.valor_pago, 0)

      weeks.push({ week: w, pv: pvAcc, ev: evAcc, ac: acAcc })
    }
    return weeks
  }, [currentCompany, etapas, parcelas, avancos])

  return (
    <WidgetCard title="Curva S" icon={TrendingUp}>
      {chartData.length === 0 ? <EmptyChart /> : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="week" tick={{ fontSize: 9 }} label={{ value: 'Semana', position: 'insideBottomRight', fontSize: 9, offset: -5 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(v: unknown, name: unknown) => [formatCurrency(Number(v) || 0), String(name) === 'pv' ? 'PV (Planejado)' : String(name) === 'ev' ? 'EV (Agregado)' : 'AC (Real)']}
            />
            <Line type="monotone" dataKey="pv" stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ev" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ac" stroke="#f97316" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="flex items-center justify-center gap-4 pt-1 text-[9px]">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-slate-400" style={{ borderTop: '2px dashed #94a3b8' }} />PV</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-blue-500 rounded" />EV</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-orange-500 rounded" />AC</span>
      </div>
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W6 — Top 5 Desvios
// ═══════════════════════════════════════════════════════════════
function TopDesviosWidget() {
  const { data: itens = [] } = useItensCompra()

  const desvios = useMemo(() => {
    return itens
      .filter((i) => i.valor_total_orcado > 0)
      .map((i) => ({
        nome: i.descricao,
        orcado: i.valor_total_orcado,
        consumido: i.valor_consumido,
        pct: i.valor_total_orcado > 0 ? (i.valor_consumido / i.valor_total_orcado) * 100 : 0,
        desvio: i.valor_consumido - i.valor_total_orcado,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
  }, [itens])

  return (
    <WidgetCard title="Top 5 Desvios %" icon={AlertTriangle}>
      {desvios.length === 0 ? <EmptyChart msg="Sem itens para análise" /> : (
        <div className="space-y-2.5">
          {desvios.map((d, i) => {
            const over = d.pct > 100
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="truncate max-w-[180px] font-medium">{d.nome}</span>
                  <span className={`font-bold ${over ? 'text-red-500' : 'text-emerald-500'}`}>{d.pct.toFixed(1)}%</span>
                </div>
                <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : d.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(d.pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W7 — Medições
// ═══════════════════════════════════════════════════════════════
function MedicoesWidget() {
  const { data: medicoes = [] } = useMedicoes()

  const statusBadge: Record<string, string> = {
    pendente: 'bg-slate-500/10 text-slate-500',
    enviada: 'bg-blue-500/10 text-blue-500',
    aprovada: 'bg-amber-500/10 text-amber-600',
    liberada: 'bg-emerald-500/10 text-emerald-600',
  }

  return (
    <WidgetCard title="Medições" icon={Calendar}>
      {medicoes.length === 0 ? <EmptyChart msg="Nenhuma medição cadastrada" /> : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {medicoes.slice(0, 8).map((m) => (
            <div key={m.id} className="flex min-w-[100px] shrink-0 flex-col items-center rounded-lg border bg-muted/10 p-2.5">
              <span className="text-xs font-bold">M{m.numero}</span>
              <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${statusBadge[m.status] ?? ''}`}>
                {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
              </span>
              <span className="mt-1 text-[10px] font-semibold">{formatCurrency(m.valor_planejado)}</span>
              <span className="text-[8px] text-muted-foreground">
                {m.data_prevista ? localDate(m.data_prevista).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W8 — Próximos Pagamentos
// ═══════════════════════════════════════════════════════════════
function ProximosPagamentosWidget() {
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()

  const proximos = useMemo(() => {
    const today = new Date()
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 7)
    const todayISO = today.toISOString().split('T')[0]!
    const limitISO = limit.toISOString().split('T')[0]!

    return parcelas
      .filter((p) => p.status !== 'paga' && p.data_vencimento >= todayISO && p.data_vencimento <= limitISO)
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
      .slice(0, 10)
      .map((p) => {
        const ped = pedidos.find((pd) => pd.id === p.pedido_id)
        return { ...p, fornecedor: ped?.fornecedor_nome ?? '—', item: p.pedido_item ?? p.descricao ?? 'Avulsa' }
      })
  }, [parcelas, pedidos])

  return (
    <WidgetCard title="Próximos 7 Dias" icon={Clock}>
      {proximos.length === 0 ? <EmptyChart msg="Nenhum pagamento nos próximos 7 dias" /> : (
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
          {proximos.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px] hover:bg-muted/20">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.fornecedor}</p>
                <p className="truncate text-muted-foreground">{p.item}</p>
              </div>
              <div className="ml-3 text-right shrink-0">
                <p className="font-bold">{formatCurrency(p.valor - p.valor_pago)}</p>
                <p className="text-muted-foreground">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W9 — Saldo Mínimo Projetado
// ═══════════════════════════════════════════════════════════════
function SaldoMinimoWidget() {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()

  const info = useMemo(() => {
    if (!currentCompany) return { minSaldo: 0, minDate: '' }
    let saldo = currentCompany.saldo_inicial_caixa ?? 0
    parcelas.filter((p) => p.status === 'paga').forEach((p) => { saldo -= p.valor_pago })

    let minSaldo = saldo
    let minDate = ''
    const today = new Date()

    for (let i = 0; i < 120; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().split('T')[0]!

      const entradas = medicoes
        .filter((m) => m.data_prevista === iso)
        .reduce((s, m) => s + m.valor_planejado, 0)
      const saidas = parcelas
        .filter((p) => p.data_vencimento === iso && p.status !== 'paga')
        .reduce((s, p) => s + (p.valor - p.valor_pago), 0)

      saldo = saldo + entradas - saidas

      if (saldo < minSaldo) {
        minSaldo = saldo
        minDate = iso
      }
    }
    return { minSaldo, minDate }
  }, [currentCompany, parcelas, medicoes])

  const isNeg = info.minSaldo < 0

  return (
    <div className={`rounded-xl border p-4 ${isNeg ? 'border-red-500/30 bg-red-500/5' : 'bg-card'}`}>
      <div className="mb-2 flex items-center gap-2">
        {isNeg && <AlertTriangle className="h-4 w-4 text-red-500" />}
        <ArrowDown className={`h-3.5 w-3.5 ${isNeg ? 'text-red-500' : 'text-muted-foreground'}`} />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo Mínimo Projetado</h3>
      </div>
      <p className={`text-2xl font-bold ${isNeg ? 'text-red-500' : 'text-emerald-500'}`}>{formatCurrency(info.minSaldo)}</p>
      {info.minDate && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Em {localDate(info.minDate).toLocaleDateString('pt-BR')}
        </p>
      )}
      {isNeg && (
        <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5">
          <p className="text-[9px] font-semibold text-red-500">⚠ Fluxo de caixa ficará negativo — necessário aporte ou renegociar prazos</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// W10 — IA Documentos
// ═══════════════════════════════════════════════════════════════
function IADocumentosWidget() {
  const { currentCompany } = useProject()

  const { data: docs = [] } = useQuery({
    queryKey: ['documentos-recent', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase
        .from('documentos')
        .select('id, nome_arquivo, status, created_at')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) {
        // Table may not exist yet — return empty silently
        console.warn('documentos table:', error.message)
        return []
      }
      return data as Array<{ id: string; nome_arquivo: string; status: string; created_at: string }>
    },
    enabled: !!currentCompany,
    staleTime: 60000,
  })

  const badge: Record<string, string> = {
    pendente: 'bg-slate-500/10 text-slate-500',
    processando: 'bg-blue-500/10 text-blue-500',
    aprovado: 'bg-emerald-500/10 text-emerald-600',
    rejeitado: 'bg-red-500/10 text-red-500',
  }

  return (
    <WidgetCard title="IA Documentos" icon={FileText}>
      {docs.length === 0 ? <EmptyChart msg="Sem documentos recentes" /> : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[10px]">
              <span className="truncate max-w-[120px] font-medium">{d.nome_arquivo}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${badge[d.status] ?? badge['pendente']}`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// W Extra — Avanço Físico
// ═══════════════════════════════════════════════════════════════
function AvancoFisicoWidget() {
  const { data: etapas = [] } = useEtapas()
  const { data: avancos = [] } = useAvancos()

  const stats = useMemo(() => {
    const totalCasas = etapas.reduce((s, e) => s + (e.casas_total || 0), 0)
    const totalDone = etapas.reduce((s, e) => {
      const done = avancos
        .filter((a) => a.etapa_id === e.id)
        .reduce((sa, a) => sa + a.casas_concluidas, 0)
      return s + Math.min(done, e.casas_total || 0)
    }, 0)

    const pct = totalCasas > 0 ? (totalDone / totalCasas) * 100 : 0
    const emAndamento = etapas.filter((e) => e.status === 'em_andamento').length
    const concluidas = etapas.filter((e) => e.status === 'concluido').length

    return { totalCasas, totalDone, pct, emAndamento, concluidas, total: etapas.length }
  }, [etapas, avancos])

  return (
    <WidgetCard title="Avanço Físico" icon={CheckCircle2}>
      <div className="text-center">
        <p className="text-3xl font-bold text-primary">{formatNumber(stats.pct, 1)}%</p>
        <p className="text-[10px] text-muted-foreground">{formatNumber(stats.totalDone)} / {formatNumber(stats.totalCasas)} unid.</p>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(stats.pct, 100)}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px]">
        <div>
          <p className="font-bold">{stats.total}</p>
          <p className="text-muted-foreground">Etapas</p>
        </div>
        <div>
          <p className="font-bold text-blue-500">{stats.emAndamento}</p>
          <p className="text-muted-foreground">Ativas</p>
        </div>
        <div>
          <p className="font-bold text-emerald-500">{stats.concluidas}</p>
          <p className="text-muted-foreground">Prontas</p>
        </div>
      </div>
    </WidgetCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════
function WidgetCard({ title, icon: Icon, children }: { title: string; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{title}
      </h3>
      {children}
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <p className="text-[8px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-bold">{value}</p>
    </div>
  )
}

function EmptyChart({ msg = 'Sem dados disponíveis' }: { msg?: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center">
      <p className="text-xs text-muted-foreground">{msg}</p>
    </div>
  )
}
