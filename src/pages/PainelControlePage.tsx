/**
 * PainelControlePage — Painel de controle da obra
 *
 * Hierarquia:
 *   1. Faixa de saúde global (semáforo)
 *   2. KPIs macro (contexto financeiro — primeiro scroll)
 *   3. Caixa & projeção + vencimentos
 *   4. Alertas: críticos como cards de ação + pendências colapsáveis
 *   5. Auditoria 360°: equações A/B/C/D → grade de integridade → conciliação
 *   6. Análise de custo: breakdown + margem (colapsável)
 *   7. Detalhe completo: InconsistenciasTable (colapsada por padrão)
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { InconsistenciasTable } from '@/components/financeiro/InconsistenciasTable'
import { AuditoriaContabilCard } from '@/components/financeiro/AuditoriaContabilCard'
import { Zona1Panel } from '@/components/painel/Zona1Panel'
import {
  Gauge, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  Package, CreditCard, Wallet, FileCheck2, Landmark, AlertTriangle,
  CheckCircle2, XCircle, ArrowRight, Scale, List,
} from 'lucide-react'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useProjetoKPIs } from '@/hooks/useProjetoKPIs'
import { useMedicoes, useMovimentacoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency } from '@/lib/utils'
import { useHealthChecks, type HealthCheck } from '@/hooks/useHealthChecks'
import { useEquacoesContabeis } from '@/hooks/useEquacoesContabeis'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { GapInspectorDrawer, type GapOrigin } from '@/components/painel/GapInspectorDrawer'
import { useAdiantamentos } from '@/hooks/useAdiantamentos'
import { useMedicaoParcelas } from '@/hooks/useMedicaoParcelas'

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(value: number, total: number): string {
  if (!total) return '—'
  return `${((value / total) * 100).toFixed(1)}%`
}

// ─── Faixa de saúde global ────────────────────────────────────────────────────

function FaixaSaudeGlobal({
  critical, warn, eqComGap, total,
}: {
  critical: number; warn: number; eqComGap: number; total: number
}) {
  const ok = critical === 0 && warn === 0 && eqComGap === 0
  if (ok) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Plataforma íntegra — nenhum alerta, todas as equações fecham
        </span>
        <span className="ml-auto text-[10px] text-emerald-600">{total} verificações OK</span>
      </div>
    )
  }
  return (
    <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5 ${critical > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Saúde da plataforma</span>
      {critical > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600">
          <XCircle className="h-3 w-3" />{critical} crítico{critical !== 1 ? 's' : ''}
        </span>
      )}
      {warn > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600">
          <AlertTriangle className="h-3 w-3" />{warn} atenção
        </span>
      )}
      {eqComGap > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600">
          <Scale className="h-3 w-3" />{eqComGap}/4 equaç{eqComGap !== 1 ? 'ões' : 'ão'} com gap
        </span>
      )}
      <span className="ml-auto text-[10px] text-muted-foreground">{total - critical - warn} OK de {total}</span>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, tone = 'default',
}: {
  icon: typeof Gauge; label: string; value: string
  sub?: string; tone?: 'default' | 'success' | 'danger' | 'warning' | 'primary'
}) {
  const border = { default: 'border-border', success: 'border-emerald-500/30 bg-emerald-500/5', danger: 'border-red-500/30 bg-red-500/5', warning: 'border-amber-500/30 bg-amber-500/5', primary: 'border-primary/30 bg-primary/5' }[tone]
  const ic = { default: 'text-muted-foreground', success: 'text-emerald-600', danger: 'text-red-600', warning: 'text-amber-600', primary: 'text-primary' }[tone]
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums leading-tight">{value}</div>
          {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${ic}`} />
      </div>
    </div>
  )
}

// ─── Alerta compacto (1 check = 1 linha de ação) ─────────────────────────────

function AlertaRow({ check }: { check: HealthCheck }) {
  const isCritical = check.severity === 'critical'
  const total = check.items.reduce((s, i) => s + (i.value ?? 0), 0)
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border-l-[3px] px-4 py-2.5 ${
      isCritical
        ? 'border-l-red-500 border-red-200/30 dark:border-red-900/30 bg-red-500/5'
        : 'border-l-amber-500 border-amber-200/30 dark:border-amber-900/30 bg-amber-500/5'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        {isCritical
          ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
        <span className={`text-sm font-semibold ${isCritical ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
          {check.title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {check.items.length} item{check.items.length !== 1 ? 's' : ''}
          {total > 0 && ` · ${formatCurrency(total)}`}
        </span>
      </div>
      {check.route && (
        <Link
          to={check.route}
          className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
            isCritical
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {check.routeLabel ?? 'Ver'} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Grade de Integridade por Origem ─────────────────────────────────────────

interface OrigemRow {
  label: string; sublabel: string; dot: string; route: string
  inspectKey?: GapOrigin; registrado: number; noFC: number
  gap: number; gapNote?: string; severity: 'ok' | 'warn' | 'gap'
}

function OrigemIntegridadeGrid({ rows, onInspect }: { rows: OrigemRow[]; onInspect: (k: GapOrigin) => void }) {
  const nOk = rows.filter(r => r.severity === 'ok').length
  const totalGap = rows.reduce((s, r) => s + r.gap, 0)
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {nOk === rows.length ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            Integridade por Origem
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {nOk === rows.length
              ? <span className="text-emerald-600 font-semibold">todas {rows.length} origens representadas no FC</span>
              : <span className="text-amber-600 font-semibold">{rows.length - nOk} origem(ns) com gap · {formatCurrency(totalGap)} fora do FC</span>}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left">Origem</th>
              <th className="px-4 py-2 text-right">Registrado</th>
              <th className="px-4 py-2 text-right">No FC</th>
              <th className="px-4 py-2 text-right">Gap</th>
              <th className="px-4 py-2 text-center w-16">Status</th>
              <th className="px-2 py-2 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(row => {
              const pctVal = row.registrado > 0 ? (row.noFC / row.registrado) * 100 : 100
              const isOk = row.severity === 'ok'
              const isWarn = row.severity === 'warn'
              return (
                <tr key={row.label} className={`hover:bg-muted/20 transition-colors ${row.severity === 'gap' ? 'bg-red-500/3' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${row.dot}`} />
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-[10px] text-muted-foreground">{row.sublabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(row.registrado)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={isOk ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>{formatCurrency(row.noFC)}</span>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${isOk ? 'bg-emerald-500' : isWarn ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(pctVal, 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.gap < 0.5 ? <span className="text-muted-foreground/30">—</span> : (
                      <div>
                        <span className={`font-semibold ${row.severity === 'gap' ? 'text-red-600' : 'text-amber-600'}`}>{formatCurrency(row.gap)}</span>
                        {row.gapNote && <div className="text-[10px] text-muted-foreground max-w-[200px] text-right leading-tight mt-0.5">{row.gapNote}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : isWarn ? <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" /> : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      {row.inspectKey && (
                        <button onClick={() => onInspect(row.inspectKey!)} className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors">
                          Inspecionar <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                      <Link to={row.route} className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors">
                        Ir à origem <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-5 px-4 py-2.5 border-t bg-muted/20 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Tudo no FC</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" />Incluído via simplificado</span>
        <span className="flex items-center gap-1.5"><XCircle className="h-3 w-3 text-red-500" />Ausente do FC</span>
      </div>
    </div>
  )
}

// ─── BreakdownRow + Drilldowns ────────────────────────────────────────────────

function BreakdownRow({ label, orcado, pedidos, pago, qtdCasas, isExpanded, onToggle, customCells }: {
  label: string; orcado: number | null; pedidos: number | null; pago: number | null
  qtdCasas: number; isExpanded: boolean; onToggle: () => void; customCells?: React.ReactNode
}) {
  return (
    <tr onClick={onToggle} className="cursor-pointer hover:bg-accent/30">
      <td className="px-3 py-2 font-medium">
        <div className="inline-flex items-center gap-2">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </div>
      </td>
      {customCells ?? (
        <>
          <td className="px-3 py-2 text-right tabular-nums">{orcado == null ? '—' : formatCurrency(orcado)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pedidos == null ? '—' : formatCurrency(pedidos)}</td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{pago == null ? '—' : formatCurrency(pago)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{orcado == null || pago == null ? '—' : pct(pago, orcado)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{orcado == null || pago == null ? '—' : formatCurrency(orcado - pago)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{orcado == null ? '—' : formatCurrency(orcado / qtdCasas)}</td>
        </>
      )}
      <td className="px-3 py-2" />
    </tr>
  )
}

function DrilldownDiretos({ data, qtdCasas }: { data: Array<{ id: string; etapa_nome: string; orcado: number; pedidos: number; pago: number; itensCount: number }>; qtdCasas: number }) {
  return (
    <>
      <tr className="bg-muted/40"><td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">↓ por etapa ({data.length})</td></tr>
      {data.map(e => (
        <tr key={e.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs"><span className="text-muted-foreground">└─</span> {e.etapa_nome} <span className="text-[10px] text-muted-foreground ml-1">({e.itensCount})</span></td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(e.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(e.pedidos)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(e.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(e.pago, e.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(e.orcado - e.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(e.orcado / qtdCasas)}</td>
          <td />
        </tr>
      ))}
    </>
  )
}

function DrilldownIndiretos({ data, qtdCasas }: { data: Array<{ categoria: string; orcado: number; pago: number; itens: number }>; qtdCasas: number }) {
  return (
    <>
      <tr className="bg-muted/40"><td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">↓ por categoria ({data.length})</td></tr>
      {data.map(c => (
        <tr key={c.categoria} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs"><span className="text-muted-foreground">└─</span> {c.categoria} <span className="text-[10px] text-muted-foreground ml-1">({c.itens})</span></td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(c.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(c.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(c.pago, c.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(c.orcado - c.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(c.orcado / qtdCasas)}</td>
          <td />
        </tr>
      ))}
    </>
  )
}

function DrilldownCapital({ data }: { data: Array<{ id: string; nome: string; tipo: string; valor_captado: number; pago: number; saldo: number; instituicao: string | null; status: string }> }) {
  return (
    <>
      <tr className="bg-muted/40"><td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">↓ por mútuo ({data.length})</td></tr>
      {data.map(m => (
        <tr key={m.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span>
            <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[9px] font-semibold">{m.tipo}</span>
            {' '}{m.nome}{m.instituicao && <span className="ml-2 text-[10px] text-muted-foreground">{m.instituicao}</span>}
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(m.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(m.pago, m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.saldo)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
            <span className={`rounded px-1.5 py-0.5 text-[9px] ${m.status === 'quitado' ? 'bg-emerald-500/20 text-emerald-700' : m.status === 'inadimplente' ? 'bg-red-500/20 text-red-700' : 'bg-blue-500/20 text-blue-700'}`}>{m.status}</span>
          </td>
          <td />
        </tr>
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PainelControlePage() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: mutuos = [] } = useMutuos()
  const projetoKPIs = useProjetoKPIs()
  const { data: medicoes = [] } = useMedicoes()
  const { data: movimentacoes = [] } = useMovimentacoes()
  const { data: etapas = [] } = useEtapas()
  const { data: adiantamentos = [] } = useAdiantamentos()
  const { data: medicaoParcelas = [] } = useMedicaoParcelas()
  const { events: fcEvents } = useCashFlowEvents('completo')
  const { stats: healthStats, checks } = useHealthChecks()
  const { equacoes } = useEquacoesContabeis()

  const eqComGap = equacoes.filter(e => e.status !== 'ok').length

  // Alertas separados por severidade
  const criticos = useMemo(() =>
    checks.filter(c => c.severity === 'critical' && c.items.length > 0),
    [checks]
  )
  const pendencias = useMemo(() =>
    checks.filter(c => c.severity === 'warn' && c.items.length > 0),
    [checks]
  )

  const [pendenciasOpen, setPendenciasOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [inconsistenciasOpen, setInconsistenciasOpen] = useState(false)
  const [inspectOrigin, setInspectOrigin] = useState<GapOrigin | null>(null)
  const [expandedSection, setExpandedSection] = useState<'diretos' | 'indiretos' | 'capital' | null>(null)
  const qtdCasas = currentCompany?.qtd_casas ?? 1

  const { fcTotals, despesaFcMap, pedidoFcMap, medicaoFcMap, mutuoCaptacaoFcMap, mutuoDevolucaoFcMap } = useMemo(() => {
    const t = { medicoes: 0, capitalMutuo: 0, pedidosObra: 0, despesasIndiretas: 0, mutuoDevolucoes: 0 }
    const dMap: Record<string, number> = {}
    const pMap: Record<string, number> = {}
    const mMap: Record<string, number> = {}
    const mcMap: Record<string, number> = {}
    const mdMap: Record<string, number> = {}
    for (const ev of fcEvents) {
      const origem = ev.meta?.origem
      const cat = ev.meta?.cat ?? ''
      const etapa = ev.meta?.etapa ?? ''
      if ((origem as string) === 'transferencia' || cat === 'Transferência Interna') continue
      if (ev.type === 'bruto') continue
      if (ev.type === 'entrada') {
        if (origem === 'medicao') {
          t.medicoes += ev.valor
          if (ev.meta?.medicaoId) mMap[ev.meta.medicaoId] = (mMap[ev.meta.medicaoId] ?? 0) + ev.valor
        } else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) {
          t.capitalMutuo += ev.valor
          if (ev.meta?.mutuoId) mcMap[ev.meta.mutuoId] = (mcMap[ev.meta.mutuoId] ?? 0) + ev.valor
        }
      } else {
        if (origem === 'despesa') {
          t.despesasIndiretas += ev.valor
          if (ev.meta?.despesaId) dMap[ev.meta.despesaId] = (dMap[ev.meta.despesaId] ?? 0) + ev.valor
        } else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) {
          t.mutuoDevolucoes += ev.valor
          if (ev.meta?.mutuoId) mdMap[ev.meta.mutuoId] = (mdMap[ev.meta.mutuoId] ?? 0) + ev.valor
        } else if (cat !== 'Banco' && origem !== 'avulsa') {
          t.pedidosObra += ev.valor
          if (ev.meta?.pedidoId) pMap[ev.meta.pedidoId] = (pMap[ev.meta.pedidoId] ?? 0) + ev.valor
        }
      }
    }
    return {
      fcTotals: t,
      despesaFcMap: dMap,
      pedidoFcMap: pMap,
      medicaoFcMap: mMap,
      mutuoCaptacaoFcMap: mcMap,
      mutuoDevolucaoFcMap: mdMap,
    }
  }, [fcEvents])

  // ─── Agregações ────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const orcadoDiretos = itens.reduce((s, i) => s + (Number(i.valor_total_orcado) || 0), 0)
    const pedidosTotal = pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => {
      const v = Number(p.valor_total_real || 0)
      const coberto = Number((p as any).valor_coberto_por_realizacao || 0)
      return s + Math.max(0, v - coberto)
    }, 0)
    const previstoDiretosParcelas = parcelas.filter(p => p.pedido_id != null).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoDiretos = parcelas.filter(p => p.pedido_id != null).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    const orcadoIndiretos = despesas.reduce((s: number, d: any) => s + (Number(d.valor_orcado) || 0), 0)
    const previstoIndiretosParcelas = parcelas.filter(p => p.despesa_indireta_id != null).reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0)
    const pagoIndiretos = parcelas.filter(p => p.despesa_indireta_id != null).reduce((s: number, p: any) => s + (Number(p.valor_pago) || 0), 0)
    const capitalCaptado = mutuos.reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const capitalPagoTotal = mutuos.reduce((s, m) => s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor_pago) || 0), 0), 0)
    const capitalContratadoParcelas = mutuos.reduce((s, m) => s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor) || 0), 0), 0)
    const custoFinanceiroProjetado = Math.max(0, capitalContratadoParcelas - capitalCaptado)
    const ratioPago = capitalContratadoParcelas > 0 ? capitalPagoTotal / capitalContratadoParcelas : 0
    const custoFinanceiroRealizado = custoFinanceiroProjetado * ratioPago
    const capitalSaldoDevedor = Math.max(0, capitalContratadoParcelas - capitalPagoTotal)
    const medicoesLiberadas = medicoes.reduce((s, m) => s + (Number(m.valor_liberado) || 0), 0)
    const medicoesPlanejadas = medicoes.reduce((s, m) => s + (Number(m.valor_planejado) || 0), 0)
    const conciliado = movimentacoes.filter(m => m.conciliado && m.tipo === 'saida').reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0)
    const orcadoOperacional = orcadoDiretos + orcadoIndiretos
    const pagoOperacional = pagoDiretos + pagoIndiretos
    const orcadoComFinanceiro = orcadoOperacional + custoFinanceiroProjetado
    const pagoComFinanceiro = pagoOperacional + custoFinanceiroRealizado
    const previstoOrfas = parcelas.filter(p => !p.pedido_id && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoOrfas = parcelas.filter(p => !p.pedido_id && !p.despesa_indireta_id).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    const totalParcelasGeradas = previstoDiretosParcelas + previstoIndiretosParcelas + previstoOrfas + capitalContratadoParcelas
    const previstoCapital = capitalContratadoParcelas
    const previstoTotalFontes = pedidosTotal + previstoIndiretosParcelas + previstoCapital + previstoOrfas
    const pagoTotal = pagoDiretos + pagoIndiretos + capitalPagoTotal + pagoOrfas
    const gap = pagoTotal - conciliado
    const gapPrevisto = previstoTotalFontes - totalParcelasGeradas
    const medicoesComData = medicoes.filter(m => !!m.data_prevista).reduce((s, m) => s + (Number(m.valor_planejado) || 0), 0)
    const medicoesGap = medicoesPlanejadas - medicoesComData
    const mutuosCaptacaoComData = mutuos.filter(m => !!m.data_captacao && String(m.categoria ?? '').toUpperCase() !== 'STUB_DEDUPE').reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const mutuosDevolucoesComData = mutuos.reduce((s, m) => s + (m.parcelas ?? []).filter((p: any) => !!p.data_vencimento).reduce((ss: number, p: any) => ss + (Number(p.valor) || 0), 0), 0)
    return {
      orcadoDiretos, orcadoIndiretos, orcadoOperacional, orcadoComFinanceiro,
      pedidosTotal, previstoDiretosParcelas,
      pagoDiretos, pagoIndiretos, pagoOperacional, pagoComFinanceiro,
      capitalCaptado, capitalPagoTotal, capitalContratadoParcelas, capitalSaldoDevedor,
      custoFinanceiroProjetado, custoFinanceiroRealizado,
      medicoesLiberadas, medicoesPlanejadas,
      conciliado, gap, gapPrevisto,
      previstoIndiretos: previstoIndiretosParcelas, previstoCapital,
      previstoOrfas, previstoTotalFontes, totalParcelasGeradas,
      pagoOrfas, pagoTotal,
      medicoesComData, medicoesGap,
      mutuosCaptacaoComData, mutuosCaptacaoGap: Math.max(0, capitalCaptado - mutuosCaptacaoComData),
      mutuosDevolucoesComData, mutuosDevolucoesGap: Math.max(0, capitalContratadoParcelas - mutuosDevolucoesComData),
    }
  }, [itens, pedidos, parcelas, despesas, mutuos, medicoes, movimentacoes])

  const aggNovo = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!
    const adiantamentosTotal = adiantamentos.reduce((s, a) => s + (Number(a.valor) || 0), 0)
    const adiantamentosComData = adiantamentos.filter(a => !!a.data_pagamento).reduce((s, a) => s + (Number(a.valor) || 0), 0)
    const adiantamentosEmRisco = adiantamentos.filter(a => a.status !== 'abatido' && a.data_prevista_abatimento && a.data_prevista_abatimento < today)
    const medicoesLiberadasValor = medicoes.filter(m => m.status === 'liberada' || m.status === 'paga').reduce((s, m) => s + (Number(m.valor_liberado) || 0), 0)
    const medParcelasTotal = medicaoParcelas.filter(p => !p.deleted_at).reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const medParcelasGap = Math.max(0, medicoesLiberadasValor - medParcelasTotal)
    return {
      adiantamentosTotal, adiantamentosComData,
      adiantamentosGap: Math.max(0, adiantamentosTotal - adiantamentosComData),
      adiantamentosEmRisco,
      medicoesLiberadasValor, medParcelasTotal, medParcelasGap,
    }
  }, [adiantamentos, medicaoParcelas, medicoes])

  const diretosPorEtapa = useMemo(() => {
    const map = new Map<string, { etapa_nome: string; etapa_ordem: number; orcado: number; pedidos: number; pago: number; itensCount: number }>()
    const parcPorPedido = new Map<string, number>()
    for (const p of parcelas) { if (p.pedido_id) parcPorPedido.set(p.pedido_id, (parcPorPedido.get(p.pedido_id) ?? 0) + (Number(p.valor_pago) || 0)) }
    // pedidosPorItem híbrido: mesma lógica do pedMap em useCashFlowEvents
    // Pedidos COM linhas → cada pi.item_compra_id recebe sua parte; SEM linhas → header recebe tudo
    const pedidosPorItem = new Map<string, { total: number; pago: number }>()
    for (const ped of pedidos) {
      const pagoPed = parcPorPedido.get(ped.id) ?? 0
      if (ped.itens && ped.itens.length > 0) {
        for (const pi of ped.itens) {
          if ((pi as any).fora_orcamento === true) continue
          const curr = pedidosPorItem.get(pi.item_compra_id) ?? { total: 0, pago: 0 }
          curr.total += Number(pi.valor_total_real) || 0
          pedidosPorItem.set(pi.item_compra_id, curr)
        }
        // pago é do pedido inteiro — atribui ao item_compra_id do header (proxy)
        const curr = pedidosPorItem.get(ped.item_compra_id) ?? { total: 0, pago: 0 }
        curr.pago += pagoPed
        pedidosPorItem.set(ped.item_compra_id, curr)
      } else {
        const curr = pedidosPorItem.get(ped.item_compra_id) ?? { total: 0, pago: 0 }
        curr.total += Number(ped.valor_total_real) || 0
        curr.pago += pagoPed
        pedidosPorItem.set(ped.item_compra_id, curr)
      }
    }
    for (const item of itens) {
      const etapa = etapas.find(e => e.id === item.etapa_id)
      const row = map.get(item.etapa_id) ?? { etapa_nome: etapa?.nome ?? item.etapa_nome ?? '—', etapa_ordem: etapa?.ordem ?? 999, orcado: 0, pedidos: 0, pago: 0, itensCount: 0 }
      row.orcado += Number(item.valor_total_orcado) || 0
      const ped = pedidosPorItem.get(item.id) ?? { total: 0, pago: 0 }
      row.pedidos += ped.total; row.pago += ped.pago; row.itensCount += 1
      map.set(item.etapa_id, row)
    }
    return Array.from(map.entries()).map(([id, d]) => ({ id, ...d })).sort((a, b) => a.etapa_ordem - b.etapa_ordem)
  }, [itens, pedidos, parcelas, etapas])

  const indiretosPorCategoria = useMemo(() => {
    const map = new Map<string, { categoria: string; orcado: number; pago: number; itens: number }>()
    const parcPorDespesa = new Map<string, number>()
    for (const p of parcelas) { if (p.despesa_indireta_id) parcPorDespesa.set(p.despesa_indireta_id, (parcPorDespesa.get(p.despesa_indireta_id) ?? 0) + (Number(p.valor_pago) || 0)) }
    for (const d of despesas) {
      const cat = d.categoria || '—'
      const row = map.get(cat) ?? { categoria: cat, orcado: 0, pago: 0, itens: 0 }
      row.orcado += Number(d.valor_orcado) || 0; row.pago += parcPorDespesa.get(d.id) ?? 0; row.itens += 1
      map.set(cat, row)
    }
    return Array.from(map.values()).sort((a, b) => b.orcado - a.orcado)
  }, [despesas, parcelas])

  const capitalPorMutuo = useMemo(() => mutuos.map(m => {
    const pago = (m.parcelas ?? []).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
    return { id: m.id, nome: m.nome, tipo: m.tipo, valor_captado: Number(m.valor_captado) || 0, pago, saldo: (Number(m.valor_captado) || 0) - pago, instituicao: m.instituicao, status: m.status }
  }).sort((a, b) => b.valor_captado - a.valor_captado), [mutuos])

  // ─── Rows da grade de integridade ──────────────────────────────────────────
  const integridadeRows: OrigemRow[] = [
    { label: 'Medições', sublabel: 'entradas do contrato', dot: 'bg-purple-500', route: '/recebimentos', inspectKey: 'medicoes', registrado: agg.medicoesPlanejadas, noFC: agg.medicoesComData, gap: agg.medicoesGap, gapNote: agg.medicoesGap > 0.5 ? 'sem data prevista → invisíveis ao FC' : undefined, severity: agg.medicoesGap > 0.5 ? 'gap' : 'ok' },
    { label: 'Pedidos de Obra', sublabel: 'saídas diretas', dot: 'bg-blue-500', route: '/compras', inspectKey: 'pedidos', registrado: agg.pedidosTotal, noFC: fcTotals.pedidosObra, gap: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra), gapNote: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5 ? (fcTotals.pedidosObra > agg.pedidosTotal ? 'FC inclui overrun acima do contratado' : 'parcelas cobrem menos que o contratado') : undefined, severity: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5 ? 'warn' : 'ok' },
    { label: 'Custos Indiretos', sublabel: 'saídas indiretas', dot: 'bg-rose-500', route: '/custos-indiretos', inspectKey: 'indiretos', registrado: agg.pagoIndiretos, noFC: fcTotals.despesasIndiretas, gap: Math.abs(agg.pagoIndiretos - fcTotals.despesasIndiretas), gapNote: Math.abs(agg.pagoIndiretos - fcTotals.despesasIndiretas) > 0.5 ? (fcTotals.despesasIndiretas > agg.pagoIndiretos ? 'banco debitou acima do registrado nas parcelas' : 'sem parcela → AUSENTES do FC') : undefined, severity: Math.abs(agg.pagoIndiretos - fcTotals.despesasIndiretas) > 0.5 ? 'warn' : 'ok' },
    { label: 'Capital de Giro', sublabel: 'captações (entradas)', dot: 'bg-indigo-500', route: '/mutuos', inspectKey: 'capital', registrado: agg.capitalCaptado, noFC: fcTotals.capitalMutuo, gap: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo), gapNote: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5 ? (fcTotals.capitalMutuo > agg.capitalCaptado ? 'banco creditou acima do planejado' : 'sem data de captação') : undefined, severity: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5 ? 'warn' : 'ok' },
    { label: 'Devoluções de Mútuo', sublabel: 'saídas financeiras', dot: 'bg-amber-500', route: '/mutuos', inspectKey: 'devolucoes', registrado: agg.capitalContratadoParcelas, noFC: fcTotals.mutuoDevolucoes, gap: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes), gapNote: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5 ? (fcTotals.mutuoDevolucoes > agg.capitalContratadoParcelas ? 'banco pagou acima do planejado' : 'adiantamentos aguardando retorno') : undefined, severity: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5 ? 'warn' : 'ok' },
    { label: 'Adiantamentos', sublabel: 'saídas antecipadas', dot: 'bg-orange-500', route: '/adiantamentos', registrado: aggNovo.adiantamentosTotal, noFC: aggNovo.adiantamentosComData, gap: aggNovo.adiantamentosGap, gapNote: aggNovo.adiantamentosGap > 0.5 ? 'sem data de pagamento → invisíveis ao FC' : undefined, severity: aggNovo.adiantamentosGap > 0.5 ? 'gap' : 'ok' },
    { label: 'Recebimentos (med → parcelas)', sublabel: 'entradas estruturadas', dot: 'bg-teal-500', route: '/medicoes', registrado: aggNovo.medicoesLiberadasValor, noFC: aggNovo.medParcelasTotal, gap: aggNovo.medParcelasGap, gapNote: aggNovo.medParcelasGap > 0.5 ? 'medições liberadas sem parcelas de recebimento' : undefined, severity: aggNovo.medParcelasGap > 0.5 ? 'gap' : 'ok' },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Painel de Controle"
        description={`Validação 360° · ${qtdCasas} casa${qtdCasas !== 1 ? 's' : ''}`}
        icon={Gauge}
      />

      {/* Faixa de saúde global */}
      <FaixaSaudeGlobal
        critical={healthStats.critical}
        warn={healthStats.warn}
        eqComGap={eqComGap}
        total={healthStats.total}
      />

      {/* ── KPIs macro ── */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={Wallet} label="Orçado Operacional" value={formatCurrency(projetoKPIs.orcadoOperacional)} sub={`R$/casa: ${formatCurrency(projetoKPIs.orcadoOperacional / qtdCasas)}`} tone="primary" />
        <KpiCard icon={Package} label="Pedidos" value={formatCurrency(projetoKPIs.pedidosTotal)} sub={`${pct(projetoKPIs.pedidosTotal, projetoKPIs.orcadoDiretos)} do orç. diretos`} />
        <KpiCard icon={CreditCard} label="Pago" value={formatCurrency(projetoKPIs.pagoTotal)} sub={`${pct(projetoKPIs.pagoTotal, projetoKPIs.orcadoOperacional)} do orçado`} tone="success" />
        <KpiCard icon={Landmark} label="Custo Financeiro" value={formatCurrency(agg.custoFinanceiroProjetado)} sub={`juros pago: ${formatCurrency(agg.custoFinanceiroRealizado)}`} tone="warning" />
        <KpiCard icon={FileCheck2} label="Medições Lib." value={formatCurrency(agg.medicoesLiberadas)} sub={`planejado: ${formatCurrency(agg.medicoesPlanejadas)}`} />
        <KpiCard icon={Math.abs(agg.gap) > 1 ? TrendingDown : TrendingUp} label="Gap Pago↔Banco" value={formatCurrency(agg.gap)} sub={Math.abs(agg.gap) <= 1 ? 'conciliado' : 'divergência'} tone={Math.abs(agg.gap) > 1 ? 'danger' : 'success'} />
      </div>

      {/* ── Caixa & projeção ── */}
      <Zona1Panel />

      {/* ── Alertas críticos ── */}
      {criticos.length === 0 && pendencias.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Nenhum alerta crítico ou pendência operacional.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Adiantamentos em risco — dentro dos alertas críticos */}
          {aggNovo.adiantamentosEmRisco.length > 0 && (
            <div className="rounded-xl border-l-[3px] border-l-red-500 border-red-200/30 dark:border-red-900/30 bg-red-500/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-400">Adiantamentos com prazo vencido</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {aggNovo.adiantamentosEmRisco.length} item{aggNovo.adiantamentosEmRisco.length !== 1 ? 's' : ''} · {formatCurrency(aggNovo.adiantamentosEmRisco.reduce((s, a) => s + (a.valor - a.valor_abatido), 0))}
                  </span>
                </div>
                <Link to="/adiantamentos" className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                  Ver Adiantamentos <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {/* Críticos */}
          {criticos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3 w-3 text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">
                  Crítico — ação imediata ({criticos.length})
                </span>
              </div>
              {criticos.map(c => <AlertaRow key={c.id} check={c} />)}
            </div>
          )}

          {/* Pendências operacionais — colapsáveis */}
          {pendencias.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setPendenciasOpen(o => !o)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 hover:opacity-80 transition-opacity"
              >
                {pendenciasOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Pendências operacionais ({pendencias.length})
              </button>
              {pendenciasOpen && pendencias.map(c => <AlertaRow key={c.id} check={c} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Auditoria 360° ── */}
      <div className="space-y-4">
        <Divisor label="Auditoria 360°" />

        {/* 4 equações contábeis */}
        <AuditoriaContabilCard onOrfasClick={() => setInspectOrigin('orfas')} />

        {/* Grade de integridade por origem */}
        <OrigemIntegridadeGrid rows={integridadeRows} onInspect={setInspectOrigin} />

        {/* Conciliação 3 fontes × pagamentos */}
        <div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            <strong>Pedidos + Indiretos + Capital</strong> devem bater com parcelas geradas (previsto) e saídas conciliadas (real).
          </p>
          <div className="overflow-hidden rounded-xl border">
            <table className="tbl-bf w-full text-sm">
              <thead className="bg-muted/80">
                <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Fonte</th>
                  <th className="px-3 py-2 text-right">Previsto</th>
                  <th className="px-3 py-2 text-right">Real (pago)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr><td className="px-3 py-2">Pedidos</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pedidosTotal)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoDiretos)}</td></tr>
                <tr><td className="px-3 py-2">Custos Indiretos</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoIndiretos)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoIndiretos)}</td></tr>
                <tr><td className="px-3 py-2">Capital (devolução + juros)</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoCapital)}</td><td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.capitalPagoTotal)}</td></tr>
                {(agg.previstoOrfas > 0.5 || agg.pagoOrfas > 0.5) && (
                  <tr className="bg-amber-500/5">
                    <td className="px-3 py-2 text-amber-700 dark:text-amber-400">Órfãs (sem pedido/despesa)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.previstoOrfas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.pagoOrfas)}</td>
                  </tr>
                )}
                <tr className="bg-primary/15 font-bold">
                  <td className="px-3 py-2">Σ Total das fontes</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoTotalFontes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoTotal)}</td>
                </tr>
                <tr className="bg-muted/30 text-muted-foreground text-xs">
                  <td className="px-3 py-2">Referência (pagamentos)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.totalParcelasGeradas)}<div className="text-[10px] opacity-70">Σ parcelas geradas</div></td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.conciliado)}<div className="text-[10px] opacity-70">Σ saídas conciliadas</div></td>
                </tr>
                <tr className={`font-bold border-t-2 ${Math.abs(agg.gapPrevisto) > 1 || Math.abs(agg.gap) > 1 ? 'bg-red-500/10 border-red-500/40' : 'bg-emerald-500/10 border-emerald-500/40'}`}>
                  <td className="px-3 py-2">Gap (fontes − referência)</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gapPrevisto) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(agg.gapPrevisto)}{Math.abs(agg.gapPrevisto) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gap) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(agg.gap)}{Math.abs(agg.gap) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Análise de custo (colapsável) ── */}
      <div className="rounded-xl border overflow-hidden">
        <button
          onClick={() => setBreakdownOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            {breakdownOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm font-semibold">Análise de Custo</span>
            <span className="text-[11px] text-muted-foreground">breakdown por tipo + margem bruta</span>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatCurrency(agg.orcadoComFinanceiro)} orçado · {pct(agg.pagoComFinanceiro, agg.orcadoComFinanceiro)} executado
          </span>
        </button>
        {breakdownOpen && (
          <table className="tbl-bf w-full text-sm">
            <thead className="bg-muted/80">
              <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Orçado</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">% Pago</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">/ casa</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <BreakdownRow label="Diretos (itens × etapas)" orcado={agg.orcadoDiretos} pedidos={agg.pedidosTotal} pago={agg.pagoDiretos} qtdCasas={qtdCasas} isExpanded={expandedSection === 'diretos'} onToggle={() => setExpandedSection(s => s === 'diretos' ? null : 'diretos')} />
              {expandedSection === 'diretos' && <DrilldownDiretos data={diretosPorEtapa} qtdCasas={qtdCasas} />}
              <BreakdownRow label="Indiretos (despesas)" orcado={agg.orcadoIndiretos} pedidos={null} pago={agg.pagoIndiretos} qtdCasas={qtdCasas} isExpanded={expandedSection === 'indiretos'} onToggle={() => setExpandedSection(s => s === 'indiretos' ? null : 'indiretos')} />
              {expandedSection === 'indiretos' && <DrilldownIndiretos data={indiretosPorCategoria} qtdCasas={qtdCasas} />}
              <tr className="bg-primary/15 font-bold">
                <td className="px-3 py-2">Σ Custo Operacional</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pedidosTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(agg.pagoOperacional, agg.orcadoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional - agg.pagoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional / qtdCasas)}</td>
                <td />
              </tr>
              <tr><td colSpan={8} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-t-2 border-border">Operações Financeiras <span className="normal-case font-normal opacity-70">(só os juros entram no custo)</span></td></tr>
              <BreakdownRow label="Capital de giro (principal NÃO é custo)" orcado={null} pedidos={null} pago={null} qtdCasas={qtdCasas} isExpanded={expandedSection === 'capital'} onToggle={() => setExpandedSection(s => s === 'capital' ? null : 'capital')}
                customCells={<>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">+ {formatCurrency(agg.capitalCaptado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(agg.capitalContratadoParcelas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">− {formatCurrency(agg.capitalPagoTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(agg.capitalSaldoDevedor)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                </>}
              />
              {expandedSection === 'capital' && <DrilldownCapital data={capitalPorMutuo} />}
              <tr className="bg-amber-500/10 font-semibold">
                <td className="px-3 py-2">Custo Financeiro (juros)</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.custoFinanceiroProjetado)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.custoFinanceiroRealizado)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pct(agg.custoFinanceiroRealizado, agg.custoFinanceiroProjetado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.custoFinanceiroProjetado - agg.custoFinanceiroRealizado)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(agg.custoFinanceiroProjetado / qtdCasas)}</td>
                <td />
              </tr>
              <tr className="bg-primary/20 font-bold border-t-2 border-primary/50">
                <td className="px-3 py-2">TOTAL CUSTO DO PROJETO</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(agg.pagoComFinanceiro, agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro - agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro / qtdCasas)}</td>
                <td />
              </tr>
              {(() => {
                const receita = agg.medicoesPlanejadas
                const margemOrcada = receita - agg.orcadoComFinanceiro
                const margemReal = agg.medicoesLiberadas - agg.pagoComFinanceiro
                const pctOrcada = receita > 0 ? (margemOrcada / receita) * 100 : 0
                const pctReal = agg.medicoesLiberadas > 0 ? (margemReal / agg.medicoesLiberadas) * 100 : 0
                return (
                  <>
                    <tr><td colSpan={8} className="px-3 py-1.5 bg-muted/40 border-t-2 border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Margem do Projeto</td></tr>
                    <tr className="bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground pl-6">Receita (medições)</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{formatCurrency(receita)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{formatCurrency(agg.medicoesLiberadas)}</td>
                      <td colSpan={4} />
                    </tr>
                    <tr className={`font-bold ${margemOrcada >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <td className="px-3 py-2">Margem Bruta</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${margemOrcada >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>{formatCurrency(margemOrcada)}<span className="ml-1 text-xs font-normal opacity-70">({pctOrcada.toFixed(1)}%)</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${margemReal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>{formatCurrency(margemReal)}<span className="ml-1 text-xs font-normal opacity-70">({pctReal.toFixed(1)}%)</span></td>
                      <td colSpan={4} />
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detalhe completo (colapsado por padrão) ── */}
      <div className="rounded-xl border overflow-hidden">
        <button
          onClick={() => setInconsistenciasOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            {inconsistenciasOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <List className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Detalhe completo de inconsistências</span>
            <span className="text-[11px] text-muted-foreground">com filtros, busca e export CSV</span>
          </div>
          {!inconsistenciasOpen && healthStats.critical + healthStats.warn > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {healthStats.critical + healthStats.warn} problema(s) — expanda para detalhar
            </span>
          )}
        </button>
        {inconsistenciasOpen && (
          <div className="border-t">
            <InconsistenciasTable />
          </div>
        )}
      </div>

      {/* ── Drawer de inspeção ── */}
      <GapInspectorDrawer
        origin={inspectOrigin}
        onClose={() => setInspectOrigin(null)}
        medicoes={medicoes}
        pedidos={pedidos as any}
        parcelas={parcelas}
        mutuos={mutuos}
        despesas={despesas as any}
        fcTotalPedidos={fcTotals.pedidosObra}
        pedidosTotal={agg.pedidosTotal}
        despesaFcMap={despesaFcMap}
        pedidoFcMap={pedidoFcMap}
        medicaoFcMap={medicaoFcMap}
        mutuoCaptacaoFcMap={mutuoCaptacaoFcMap}
        mutuoDevolucaoFcMap={mutuoDevolucaoFcMap}
      />
    </div>
  )
}

// ─── Divisor de seção ─────────────────────────────────────────────────────────

function Divisor({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )
}
