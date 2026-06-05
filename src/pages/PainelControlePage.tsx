/**
 * PainelControlePage — Validação 360° dos números da obra
 *
 * Estrutura em 5 zonas funcionais:
 *   FAIXA  — saúde global em 1 linha (semáforo)
 *   ZONA 1 — posição financeira: caixa, projeção 30d, vencimentos, KPIs macro
 *   ZONA 2 — alertas operacionais unificados (1 lugar, sem duplicação)
 *   ZONA 3 — auditoria 360°: equações A/B/C/D + grade de integridade + conciliação
 *   ZONA 4 — análise de custo: breakdown por tipo + margem bruta
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
  CheckCircle2, XCircle, ArrowRight, Scale,
} from 'lucide-react'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useMedicoes, useMovimentacoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency } from '@/lib/utils'
import { useHealthChecks } from '@/hooks/useHealthChecks'
import { useEquacoesContabeis } from '@/hooks/useEquacoesContabeis'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { GapInspectorDrawer, type GapOrigin } from '@/components/painel/GapInspectorDrawer'
import { useAdiantamentos } from '@/hooks/useAdiantamentos'
import { useMedicaoParcelas } from '@/hooks/useMedicaoParcelas'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(value: number, total: number): string {
  if (!total || total === 0) return '—'
  return `${((value / total) * 100).toFixed(1)}%`
}

// ─── Faixa de Saúde Global ────────────────────────────────────────────────────

function FaixaSaudeGlobal({
  stats,
  eqComGap,
}: {
  stats: { critical: number; warn: number; ok: number; total: number }
  eqComGap: number
}) {
  const tudoOk = stats.critical === 0 && stats.warn === 0 && eqComGap === 0

  if (tudoOk) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Plataforma íntegra — nenhum alerta, todas as equações fecham
        </span>
        <span className="ml-auto text-[10px] text-emerald-600 tabular-nums">
          {stats.total} verificações OK
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
      stats.critical > 0
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Saúde da plataforma
      </span>
      {stats.critical > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600">
          <XCircle className="h-3 w-3" />
          {stats.critical} crítico{stats.critical !== 1 ? 's' : ''}
        </span>
      )}
      {stats.warn > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          {stats.warn} atenção
        </span>
      )}
      {eqComGap > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600">
          <Scale className="h-3 w-3" />
          {eqComGap}/4 equaç{eqComGap !== 1 ? 'ões' : 'ão'} com gap
        </span>
      )}
      <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
        {stats.ok} verificaç{stats.ok !== 1 ? 'ões' : 'ão'} OK de {stats.total}
      </span>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, subLabel, subValue, tone = 'default', warning,
}: {
  icon: typeof Gauge
  label: string
  value: string
  subLabel?: string
  subValue?: string
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'primary'
  warning?: boolean
}) {
  const toneClass = {
    default: 'border-border',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    danger:  'border-red-500/30 bg-red-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    primary: 'border-primary/30 bg-primary/5',
  }[tone]
  const iconTone = {
    default: 'text-muted-foreground',
    success: 'text-emerald-600',
    danger:  'text-red-600',
    warning: 'text-amber-600',
    primary: 'text-primary',
  }[tone]
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {value}
          </div>
          {subLabel && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {subLabel} <span className="font-semibold tabular-nums">{subValue}</span>
            </div>
          )}
        </div>
        <div className={`rounded-lg p-2 ${iconTone}`}>
          <Icon className="h-5 w-5" />
          {warning && <AlertTriangle className="h-3 w-3 text-amber-600 -mt-1 ml-3" />}
        </div>
      </div>
    </div>
  )
}

// ─── Grade de Integridade por Origem ─────────────────────────────────────────

interface OrigemRow {
  label: string
  sublabel: string
  dot: string
  route: string
  inspectKey?: GapOrigin
  registrado: number
  noFC: number
  gap: number
  gapNote?: string
  severity: 'ok' | 'warn' | 'gap'
}

function OrigemIntegridadeGrid({
  rows,
  onInspect,
}: {
  rows: OrigemRow[]
  onInspect: (key: GapOrigin) => void
}) {
  const totalGap = rows.reduce((s, r) => s + r.gap, 0)
  const nOk = rows.filter(r => r.severity === 'ok').length

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {nOk === rows.length
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            Integridade por Origem
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Se cada real da tela-fonte tem representação no fluxo de caixa —
            {nOk === rows.length
              ? <span className="text-emerald-600 font-semibold ml-1">todas {rows.length} origens OK</span>
              : <span className="text-amber-600 font-semibold ml-1">{rows.length - nOk} origem(ns) com gap · {formatCurrency(totalGap)} fora do FC</span>}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left">Origem</th>
              <th className="px-4 py-2 text-right">Registrado na tela</th>
              <th className="px-4 py-2 text-right">Com entrada no FC</th>
              <th className="px-4 py-2 text-right">Gap (fora do FC)</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(row => {
              const pctVal = row.registrado > 0 ? (row.noFC / row.registrado) * 100 : 100
              const isOk = row.severity === 'ok'
              const isWarn = row.severity === 'warn'
              return (
                <tr key={row.label} className={`hover:bg-muted/20 transition-colors ${row.severity === 'gap' ? 'bg-red-500/3' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${row.dot}`} />
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-[10px] text-muted-foreground">{row.sublabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(row.registrado)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={isOk ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                      {formatCurrency(row.noFC)}
                    </span>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOk ? 'bg-emerald-500' : isWarn ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(pctVal, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.gap < 0.5
                      ? <span className="text-muted-foreground/40">—</span>
                      : (
                        <div>
                          <span className={`font-semibold ${row.severity === 'gap' ? 'text-red-600' : 'text-amber-600'}`}>
                            {formatCurrency(row.gap)}
                          </span>
                          {row.gapNote && (
                            <div className="text-[10px] text-muted-foreground max-w-[220px] text-right leading-tight mt-0.5">
                              {row.gapNote}
                            </div>
                          )}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isOk
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                      : isWarn
                        ? <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                        : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      {row.inspectKey && (
                        <button
                          onClick={() => onInspect(row.inspectKey!)}
                          className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          Inspecionar <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                      {row.route && (
                        <Link
                          to={row.route}
                          className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          Ir à origem <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-5 px-4 py-2.5 border-t bg-muted/20 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Tudo incluído no FC</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" /> Incluído via cálculo simplificado</span>
        <span className="flex items-center gap-1.5"><XCircle className="h-3 w-3 text-red-500" /> Itens ausentes do FC — ação necessária</span>
      </div>
    </div>
  )
}

// ─── BreakdownRow + Drilldowns ────────────────────────────────────────────────

function BreakdownRow({
  label, orcado, pedidos, pago, qtdCasas, isExpanded, onToggle, customCells,
}: {
  label: string
  orcado: number | null
  pedidos: number | null
  pago: number | null
  qtdCasas: number
  isExpanded: boolean
  onToggle: () => void
  customCells?: React.ReactNode
}) {
  return (
    <tr onClick={onToggle} className="cursor-pointer hover:bg-accent/30">
      <td className="px-3 py-2 font-medium">
        <div className="inline-flex items-center gap-2">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </div>
      </td>
      {customCells ? customCells : (
        <>
          <td className="px-3 py-2 text-right tabular-nums">
            {orcado == null ? '—' : formatCurrency(orcado)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {pedidos == null ? '—' : formatCurrency(pedidos)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
            {pago == null ? '—' : formatCurrency(pago)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {orcado == null || pago == null ? '—' : pct(pago, orcado)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {orcado == null || pago == null ? '—' : formatCurrency(orcado - pago)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {orcado == null ? '—' : formatCurrency(orcado / qtdCasas)}
          </td>
        </>
      )}
      <td className="px-3 py-2" />
    </tr>
  )
}

function DrilldownDiretos({ data, qtdCasas }: { data: Array<{ id: string; etapa_nome: string; orcado: number; pedidos: number; pago: number; itensCount: number }>; qtdCasas: number }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por etapa ({data.length})
        </td>
      </tr>
      {data.map(e => (
        <tr key={e.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span> {e.etapa_nome}
            <span className="ml-2 text-[10px] text-muted-foreground">({e.itensCount} itens)</span>
          </td>
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
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por categoria ({data.length})
        </td>
      </tr>
      {data.map(c => (
        <tr key={c.categoria} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span> {c.categoria}
            <span className="ml-2 text-[10px] text-muted-foreground">({c.itens} despesa{c.itens > 1 ? 's' : ''})</span>
          </td>
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
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por mútuo/empréstimo ({data.length})
        </td>
      </tr>
      {data.map(m => (
        <tr key={m.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span>
            <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[9px] font-semibold">{m.tipo}</span>
            {' '}{m.nome}
            {m.instituicao && <span className="ml-2 text-[10px] text-muted-foreground">{m.instituicao}</span>}
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(m.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(m.pago, m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.saldo)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
            <span className={`rounded px-1.5 py-0.5 text-[9px] ${m.status === 'quitado' ? 'bg-emerald-500/20 text-emerald-700' : m.status === 'inadimplente' ? 'bg-red-500/20 text-red-700' : 'bg-blue-500/20 text-blue-700'}`}>
              {m.status}
            </span>
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
  const { data: medicoes = [] } = useMedicoes()
  const { data: movimentacoes = [] } = useMovimentacoes()
  const { data: etapas = [] } = useEtapas()
  const { data: adiantamentos = [] } = useAdiantamentos()
  const { data: medicaoParcelas = [] } = useMedicaoParcelas()

  const { events: fcEvents } = useCashFlowEvents('completo')
  const { stats: healthStats, checks } = useHealthChecks()
  const { equacoes } = useEquacoesContabeis()

  const eqComGap = equacoes.filter(e => e.status !== 'ok').length

  const fcTotals = useMemo(() => {
    const t = { medicoes: 0, capitalMutuo: 0, pedidosObra: 0, despesasIndiretas: 0, mutuoDevolucoes: 0 }
    for (const ev of fcEvents) {
      const origem = ev.meta?.origem
      const cat = ev.meta?.cat ?? ''
      const etapa = ev.meta?.etapa ?? ''
      if ((origem as string) === 'transferencia' || cat === 'Transferência Interna') continue
      if (ev.type === 'bruto') continue
      if (ev.type === 'entrada') {
        if (origem === 'medicao') t.medicoes += ev.valor
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) t.capitalMutuo += ev.valor
      } else {
        if (origem === 'despesa') t.despesasIndiretas += ev.valor
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) t.mutuoDevolucoes += ev.valor
        else if (cat !== 'Banco' && origem !== 'avulsa') t.pedidosObra += ev.valor
      }
    }
    return t
  }, [fcEvents])

  const [inspectOrigin, setInspectOrigin] = useState<GapOrigin | null>(null)
  const [expandedSection, setExpandedSection] = useState<'diretos' | 'indiretos' | 'capital' | null>('diretos')
  const qtdCasas = currentCompany?.qtd_casas ?? 1

  // ─── Agregações financeiras ───────────────────────────────────────────────
  const agg = useMemo(() => {
    const orcadoDiretos = itens.reduce((s, i) => s + (Number(i.valor_total_orcado) || 0), 0)
    const pedidosTotal = pedidos
      .filter(p => p.status !== 'cancelado')
      .reduce((s, p) => {
        const v = Number(p.valor_total_real || 0)
        const coberto = Number((p as any).valor_coberto_por_realizacao || 0)
        return s + Math.max(0, v - coberto)
      }, 0)
    const previstoDiretosParcelas = parcelas
      .filter(p => p.pedido_id != null)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoDiretos = parcelas
      .filter(p => p.pedido_id != null)
      .reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)

    const orcadoIndiretos = despesas.reduce((s: number, d: any) => s + (Number(d.valor_orcado) || 0), 0)
    const previstoIndiretosParcelas = parcelas
      .filter(p => p.despesa_indireta_id != null)
      .reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0)
    const pagoIndiretos = parcelas
      .filter(p => p.despesa_indireta_id != null)
      .reduce((s: number, p: any) => s + (Number(p.valor_pago) || 0), 0)

    const capitalCaptado = mutuos.reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const capitalPagoTotal = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor_pago) || 0), 0), 0)
    const capitalContratadoParcelas = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor) || 0), 0), 0)
    const custoFinanceiroProjetado = Math.max(0, capitalContratadoParcelas - capitalCaptado)
    const ratioPago = capitalContratadoParcelas > 0 ? capitalPagoTotal / capitalContratadoParcelas : 0
    const custoFinanceiroRealizado = custoFinanceiroProjetado * ratioPago
    const capitalSaldoDevedor = Math.max(0, capitalContratadoParcelas - capitalPagoTotal)

    const medicoesLiberadas = medicoes.reduce((s, m) => s + (Number(m.valor_liberado) || 0), 0)
    const medicoesPlanejadas = medicoes.reduce((s, m) => s + (Number(m.valor_planejado) || 0), 0)

    const movSaidas = movimentacoes
      .filter(m => m.tipo === 'saida')
      .reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0)
    const conciliado = movimentacoes
      .filter(m => m.conciliado)
      .reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0)

    const orcadoOperacional = orcadoDiretos + orcadoIndiretos
    const pagoOperacional = pagoDiretos + pagoIndiretos
    const orcadoComFinanceiro = orcadoOperacional + custoFinanceiroProjetado
    const pagoComFinanceiro = pagoOperacional + custoFinanceiroRealizado

    const previstoOrfas = parcelas
      .filter(p => !p.pedido_id && !p.despesa_indireta_id)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoOrfas = parcelas
      .filter(p => !p.pedido_id && !p.despesa_indireta_id)
      .reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)

    const totalParcelasGeradas = previstoDiretosParcelas + previstoIndiretosParcelas
      + previstoOrfas + capitalContratadoParcelas

    const previstoPedidos = pedidosTotal
    const previstoIndiretos = previstoIndiretosParcelas
    const previstoCapital = capitalContratadoParcelas
    const previstoTotalFontes = previstoPedidos + previstoIndiretos + previstoCapital + previstoOrfas
    const gapPrevisto = previstoTotalFontes - totalParcelasGeradas

    const pagoTotal = pagoDiretos + pagoIndiretos + capitalPagoTotal + pagoOrfas
    const gap = pagoTotal - conciliado

    const medicoesComData = medicoes
      .filter(m => !!m.data_prevista)
      .reduce((s, m) => s + (Number(m.valor_planejado) || 0), 0)
    const medicoesGap = medicoesPlanejadas - medicoesComData
    const pedidosSemParcela = Math.max(0, pedidosTotal - previstoDiretosParcelas)
    const despesasGap = Math.max(0, orcadoIndiretos - previstoIndiretos)
    const mutuosCaptacaoComData = mutuos
      .filter(m => !!m.data_captacao && String(m.categoria ?? '').toUpperCase() !== 'STUB_DEDUPE')
      .reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const mutuosCaptacaoGap = Math.max(0, capitalCaptado - mutuosCaptacaoComData)
    const mutuosDevolucoesComData = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).filter((p: any) => !!p.data_vencimento).reduce((ss: number, p: any) => ss + (Number(p.valor) || 0), 0), 0)
    const mutuosDevolucoesGap = Math.max(0, capitalContratadoParcelas - mutuosDevolucoesComData)

    return {
      orcadoDiretos, orcadoIndiretos,
      orcadoOperacional, orcadoComFinanceiro,
      pedidosTotal,
      pagoDiretos, pagoIndiretos,
      pagoOperacional, pagoComFinanceiro,
      capitalCaptado, capitalPagoTotal, capitalContratadoParcelas, capitalSaldoDevedor,
      custoFinanceiroProjetado, custoFinanceiroRealizado,
      medicoesLiberadas, medicoesPlanejadas,
      movSaidas, conciliado, gap,
      previstoPedidos, previstoIndiretos, previstoCapital, previstoOrfas,
      previstoTotalFontes, totalParcelasGeradas, gapPrevisto,
      pagoOrfas, pagoTotal,
      medicoesComData, medicoesGap,
      pedidosSemParcela, previstoDiretosParcelas,
      despesasGap,
      mutuosCaptacaoComData, mutuosCaptacaoGap,
      mutuosDevolucoesComData, mutuosDevolucoesGap,
    }
  }, [itens, pedidos, parcelas, despesas, mutuos, medicoes, movimentacoes])

  // ─── Agregações: adiantamentos + recebimentos por medição ────────────────
  const aggNovo = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!

    const adiantamentosTotal = adiantamentos.reduce((s, a) => s + (Number(a.valor) || 0), 0)
    const adiantamentosComData = adiantamentos
      .filter(a => !!a.data_pagamento)
      .reduce((s, a) => s + (Number(a.valor) || 0), 0)
    const adiantamentosGap = Math.max(0, adiantamentosTotal - adiantamentosComData)
    const adiantamentosEmRisco = adiantamentos.filter(a =>
      a.status !== 'abatido' &&
      a.data_prevista_abatimento &&
      a.data_prevista_abatimento < today
    )
    const adiantamentosAbatidos = adiantamentos.reduce((s, a) => s + (Number(a.valor_abatido) || 0), 0)

    const medicoesLiberadasValor = medicoes
      .filter(m => m.status === 'liberada' || m.status === 'paga')
      .reduce((s, m) => s + (Number(m.valor_liberado) || 0), 0)
    const medParcelasTotal = medicaoParcelas
      .filter(p => !p.deleted_at)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const medParcelasGap = Math.max(0, medicoesLiberadasValor - medParcelasTotal)
    const medParcelasRecebido = medicaoParcelas
      .filter(p => !p.deleted_at)
      .reduce((s, p) => s + (Number(p.valor_recebido) || 0), 0)

    return {
      adiantamentosTotal, adiantamentosComData, adiantamentosGap,
      adiantamentosEmRisco, adiantamentosAbatidos,
      medicoesLiberadasValor, medParcelasTotal, medParcelasGap, medParcelasRecebido,
    }
  }, [adiantamentos, medicaoParcelas, medicoes])

  // ─── Drill-downs ─────────────────────────────────────────────────────────
  const diretosPorEtapa = useMemo(() => {
    const map = new Map<string, { etapa_nome: string; etapa_ordem: number; orcado: number; pedidos: number; pago: number; itensCount: number }>()
    const parcPorPedido = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      parcPorPedido.set(p.pedido_id, (parcPorPedido.get(p.pedido_id) ?? 0) + (Number(p.valor_pago) || 0))
    }
    const pedidosPorItem = new Map<string, { total: number; pago: number }>()
    for (const ped of pedidos) {
      const curr = pedidosPorItem.get(ped.item_compra_id) ?? { total: 0, pago: 0 }
      curr.total += Number(ped.valor_total_real) || 0
      curr.pago += parcPorPedido.get(ped.id) ?? 0
      pedidosPorItem.set(ped.item_compra_id, curr)
    }
    for (const item of itens) {
      const etapaId = item.etapa_id
      const etapa = etapas.find(e => e.id === etapaId)
      const row = map.get(etapaId) ?? {
        etapa_nome: etapa?.nome ?? item.etapa_nome ?? '—',
        etapa_ordem: etapa?.ordem ?? 999,
        orcado: 0, pedidos: 0, pago: 0, itensCount: 0,
      }
      row.orcado += Number(item.valor_total_orcado) || 0
      const ped = pedidosPorItem.get(item.id) ?? { total: 0, pago: 0 }
      row.pedidos += ped.total
      row.pago += ped.pago
      row.itensCount += 1
      map.set(etapaId, row)
    }
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => a.etapa_ordem - b.etapa_ordem)
  }, [itens, pedidos, parcelas, etapas])

  const indiretosPorCategoria = useMemo(() => {
    const map = new Map<string, { categoria: string; orcado: number; pago: number; itens: number }>()
    const parcPorDespesa = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.despesa_indireta_id) continue
      parcPorDespesa.set(p.despesa_indireta_id, (parcPorDespesa.get(p.despesa_indireta_id) ?? 0) + (Number(p.valor_pago) || 0))
    }
    for (const d of despesas) {
      const cat = d.categoria || '—'
      const row = map.get(cat) ?? { categoria: cat, orcado: 0, pago: 0, itens: 0 }
      row.orcado += Number(d.valor_orcado) || 0
      row.pago += parcPorDespesa.get(d.id) ?? 0
      row.itens += 1
      map.set(cat, row)
    }
    return Array.from(map.values()).sort((a, b) => b.orcado - a.orcado)
  }, [despesas, parcelas])

  const capitalPorMutuo = useMemo(() => {
    return mutuos.map(m => {
      const pago = (m.parcelas ?? []).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
      return {
        id: m.id,
        nome: m.nome,
        tipo: m.tipo,
        valor_captado: Number(m.valor_captado) || 0,
        pago,
        saldo: (Number(m.valor_captado) || 0) - pago,
        instituicao: m.instituicao,
        status: m.status,
      }
    }).sort((a, b) => b.valor_captado - a.valor_captado)
  }, [mutuos])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Controle"
        description={`Validação 360° · ${qtdCasas} casa(s)`}
        icon={Gauge}
      />

      {/* ─── FAIXA: SAÚDE GLOBAL ─── */}
      <FaixaSaudeGlobal stats={healthStats} eqComGap={eqComGap} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ZONA 1 — POSIÇÃO FINANCEIRA                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionLabel label="Zona 1 — Posição Financeira" />

        {/* Caixa & Projeção 30d + vencimentos */}
        <Zona1Panel />

        {/* KPIs macro */}
        <div>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            KPIs macro
          </h3>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              icon={Wallet}
              label="Orçado Operacional"
              value={formatCurrency(agg.orcadoOperacional)}
              subLabel="R$/casa"
              subValue={formatCurrency(agg.orcadoOperacional / qtdCasas)}
              tone="primary"
            />
            <KpiCard
              icon={Package}
              label="Pedidos"
              value={formatCurrency(agg.pedidosTotal)}
              subLabel="% orç. diretos"
              subValue={pct(agg.pedidosTotal, agg.orcadoDiretos)}
            />
            <KpiCard
              icon={CreditCard}
              label="Pago Operacional"
              value={formatCurrency(agg.pagoOperacional)}
              subLabel="% orç. operacional"
              subValue={pct(agg.pagoOperacional, agg.orcadoOperacional)}
              tone="success"
            />
            <KpiCard
              icon={Landmark}
              label="Custo Financeiro"
              value={formatCurrency(agg.custoFinanceiroProjetado)}
              subLabel="juros pago (prop.)"
              subValue={formatCurrency(agg.custoFinanceiroRealizado)}
              tone="warning"
            />
            <KpiCard
              icon={FileCheck2}
              label="Medições Lib."
              value={formatCurrency(agg.medicoesLiberadas)}
              subLabel="planejado"
              subValue={formatCurrency(agg.medicoesPlanejadas)}
            />
            <KpiCard
              icon={agg.gap > 0 ? TrendingUp : TrendingDown}
              label="Gap Pago↔Banco"
              value={formatCurrency(agg.gap)}
              subLabel={agg.gap === 0 ? 'OK — conciliado' : 'divergência'}
              tone={Math.abs(agg.gap) > 1 ? 'danger' : 'success'}
              warning={Math.abs(agg.gap) > 1}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ZONA 2 — ALERTAS OPERACIONAIS                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionLabel label="Zona 2 — Alertas Operacionais" />

        {/* Adiantamentos em risco — bloco dedicado só quando há itens */}
        {aggNovo.adiantamentosEmRisco.length > 0 && (
          <div className="rounded-xl border-2 border-red-300/60 bg-red-50/30 dark:bg-red-950/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                <h3 className="text-sm font-bold text-red-800 dark:text-red-400">
                  Adiantamentos em Risco — prazo de abatimento vencido
                </h3>
                <span className="text-xs text-red-600 tabular-nums">
                  {aggNovo.adiantamentosEmRisco.length} item{aggNovo.adiantamentosEmRisco.length !== 1 ? 's' : ''} ·{' '}
                  {formatCurrency(aggNovo.adiantamentosEmRisco.reduce((s, a) => s + (a.valor - a.valor_abatido), 0))} pendente
                </span>
              </div>
              <Link to="/adiantamentos"
                className="text-xs font-semibold px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
                Ver Adiantamentos →
              </Link>
            </div>
            <div className="space-y-1 max-h-48 overflow-auto">
              {aggNovo.adiantamentosEmRisco.slice(0, 10).map(a => {
                const diasAtraso = Math.floor(
                  (Date.now() - new Date((a.data_prevista_abatimento ?? '') + 'T00:00:00').getTime()) / 86400000
                )
                const saldo = a.valor - a.valor_abatido
                return (
                  <div key={a.id}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg border border-red-200/50 bg-red-500/3">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">
                        {a.fornecedor?.nome ?? a.pedido?.fornecedores?.nome ?? 'Fornecedor —'}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        Pedido #{a.pedido?.numero_pedido ?? '—'}
                      </span>
                    </div>
                    <span className="text-red-600 font-semibold tabular-nums shrink-0">
                      {formatCurrency(saldo)}
                    </span>
                    <span className="text-red-500 text-[10px] font-bold shrink-0">
                      {diasAtraso}d
                    </span>
                  </div>
                )
              })}
              {aggNovo.adiantamentosEmRisco.length > 10 && (
                <p className="text-xs text-muted-foreground px-2">
                  +{aggNovo.adiantamentosEmRisco.length - 10} mais — veja em Adiantamentos
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tabela unificada de inconsistências (health checks + filtros + export) */}
        <InconsistenciasTable />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ZONA 3 — AUDITORIA 360°                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <SectionLabel label="Zona 3 — Auditoria 360°" />

        {/* 3A — 4 equações contábeis (fonte primária de verdade) */}
        <AuditoriaContabilCard onOrfasClick={() => setInspectOrigin('orfas')} />

        {/* 3B — Grade de integridade por origem (drill-down visual das equações) */}
        <OrigemIntegridadeGrid
          onInspect={setInspectOrigin}
          rows={[
            {
              label: 'Medições',
              sublabel: 'entradas do contrato',
              dot: 'bg-purple-500',
              route: '/recebimentos',
              inspectKey: 'medicoes',
              registrado: agg.medicoesPlanejadas,
              noFC: agg.medicoesComData,
              gap: agg.medicoesGap,
              gapNote: agg.medicoesGap > 0.5 ? 'sem data prevista → invisíveis ao FC' : undefined,
              severity: agg.medicoesGap > 0.5 ? 'gap' : 'ok',
            },
            {
              label: 'Pedidos de Obra',
              sublabel: 'saídas diretas',
              dot: 'bg-blue-500',
              route: '/compras',
              inspectKey: 'pedidos',
              registrado: agg.pedidosTotal,
              noFC: fcTotals.pedidosObra,
              gap: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra),
              gapNote: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5
                ? (fcTotals.pedidosObra > agg.pedidosTotal
                    ? 'FC inclui overrun/parcelas avulsas além do valor_total_real'
                    : 'parcelas cobrem menos que o valor contratado')
                : undefined,
              severity: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5 ? 'warn' : 'ok',
            },
            {
              label: 'Custos Indiretos',
              sublabel: 'saídas indiretas',
              dot: 'bg-rose-500',
              route: '/custos-indiretos',
              inspectKey: 'indiretos',
              registrado: agg.orcadoIndiretos,
              noFC: fcTotals.despesasIndiretas,
              gap: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas),
              gapNote: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas) > 0.5
                ? (fcTotals.despesasIndiretas > agg.orcadoIndiretos
                    ? 'banco pagou acima do orçado'
                    : 'sem parcela gerada → AUSENTES do FC')
                : undefined,
              severity: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas) > 0.5 ? 'warn' : 'ok',
            },
            {
              label: 'Capital de Giro',
              sublabel: 'captações (entradas)',
              dot: 'bg-indigo-500',
              route: '/mutuos',
              inspectKey: 'capital',
              registrado: agg.capitalCaptado,
              noFC: fcTotals.capitalMutuo,
              gap: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo),
              gapNote: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5
                ? (fcTotals.capitalMutuo > agg.capitalCaptado
                    ? 'banco creditou acima do valor_captado planejado'
                    : 'sem data de captação ou abaixo do planejado')
                : undefined,
              severity: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5 ? 'warn' : 'ok',
            },
            {
              label: 'Devoluções de Mútuo',
              sublabel: 'saídas financeiras',
              dot: 'bg-amber-500',
              route: '/mutuos',
              inspectKey: 'devolucoes',
              registrado: agg.capitalContratadoParcelas,
              noFC: fcTotals.mutuoDevolucoes,
              gap: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes),
              gapNote: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5
                ? (fcTotals.mutuoDevolucoes > agg.capitalContratadoParcelas
                    ? 'banco pagou acima do planejado (juros / correção monetária)'
                    : 'adiantamentos feitos aguardando retorno')
                : undefined,
              severity: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5 ? 'warn' : 'ok',
            },
            {
              label: 'Adiantamentos',
              sublabel: 'saídas antecipadas a fornecedores',
              dot: 'bg-orange-500',
              route: '/adiantamentos',
              registrado: aggNovo.adiantamentosTotal,
              noFC: aggNovo.adiantamentosComData,
              gap: aggNovo.adiantamentosGap,
              gapNote: aggNovo.adiantamentosGap > 0.5
                ? 'sem data de pagamento → invisíveis ao FC'
                : undefined,
              severity: aggNovo.adiantamentosGap > 0.5 ? 'gap' : 'ok',
            },
            {
              label: 'Recebimentos (med → parcelas)',
              sublabel: 'entradas estruturadas por medição',
              dot: 'bg-teal-500',
              route: '/medicoes',
              registrado: aggNovo.medicoesLiberadasValor,
              noFC: aggNovo.medParcelasTotal,
              gap: aggNovo.medParcelasGap,
              gapNote: aggNovo.medParcelasGap > 0.5
                ? 'medições liberadas sem parcelas de recebimento geradas'
                : undefined,
              severity: aggNovo.medParcelasGap > 0.5 ? 'gap' : 'ok',
            },
          ]}
        />

        {/* 3C — Conciliação 3 fontes × pagamentos */}
        <div>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conciliação 3 fontes × pagamentos
          </h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Confere se <strong>Pedidos + Custos Indiretos + Capital (devolução)</strong> batem
            com o total de parcelas geradas (previsto) e com as saídas conciliadas no banco (real).
          </p>

          <div className="overflow-hidden rounded-xl border">
            <table className="tbl-bf w-full text-sm">
              <thead className="bg-muted/80">
                <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Fonte</th>
                  <th className="px-3 py-2 text-right">Previsto (contratado)</th>
                  <th className="px-3 py-2 text-right">Real (pago)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="px-3 py-2">Pedidos</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoPedidos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoDiretos)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Custos Indiretos</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoIndiretos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoIndiretos)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Capital (devolução + juros)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoCapital)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.capitalPagoTotal)}</td>
                </tr>
                {(agg.previstoOrfas > 0.5 || agg.pagoOrfas > 0.5) && (
                  <tr className="bg-amber-500/5">
                    <td className="px-3 py-2 text-amber-700 dark:text-amber-400"
                      title="Parcelas sem pedido_id e sem despesa_indireta_id — não rastreáveis a uma fonte">
                      Órfãs (sem pedido/despesa)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.previstoOrfas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.pagoOrfas)}</td>
                  </tr>
                )}
                <tr className="bg-primary/15 font-bold">
                  <td className="px-3 py-2">Σ Total das fontes</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoTotalFontes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoTotal)}</td>
                </tr>
                <tr className="bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground"
                    title="Previsto: Σ parcelas. Real: Σ saídas conciliadas no extrato.">
                    Referência (pagamentos)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(agg.totalParcelasGeradas)}
                    <div className="text-[10px] text-muted-foreground/70">Σ parcelas geradas</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(agg.conciliado)}
                    <div className="text-[10px] text-muted-foreground/70">
                      Σ saídas conciliadas ({movimentacoes.filter(m => m.conciliado).length}/{movimentacoes.length} mov.)
                    </div>
                  </td>
                </tr>
                <tr className={`font-bold border-t-2 ${
                  Math.abs(agg.gapPrevisto) > 1 || Math.abs(agg.gap) > 1
                    ? 'bg-red-500/10 border-red-500/40'
                    : 'bg-emerald-500/10 border-emerald-500/40'
                }`}>
                  <td className="px-3 py-2">Gap (fontes − referência)</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gapPrevisto) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(agg.gapPrevisto)}
                    {Math.abs(agg.gapPrevisto) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gap) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(agg.gap)}
                    {Math.abs(agg.gap) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {(Math.abs(agg.gapPrevisto) > 1 || Math.abs(agg.gap) > 1) && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-900 dark:text-amber-200">
              <div className="font-semibold mb-1">Possíveis causas do gap:</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><strong>Previsto:</strong> pedido com <code>valor_total_real</code> diferente da soma das suas parcelas (ex.: pedido sem cond. de pagamento, ou parcelas não geradas/excluídas).</li>
                <li><strong>Real:</strong> pagamento lançado em parcela mas movimentação bancária não conciliada — ou conciliada num período fora deste filtro.</li>
                <li><strong>Capital:</strong> juros embutidos nas parcelas dos mútuos podem inflar o total contratado vs valor captado.</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ZONA 4 — ANÁLISE DE CUSTO                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionLabel label="Zona 4 — Análise de Custo" />

        <div className="overflow-hidden rounded-xl border">
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
              <BreakdownRow
                label="Diretos (itens × etapas)"
                orcado={agg.orcadoDiretos}
                pedidos={agg.pedidosTotal}
                pago={agg.pagoDiretos}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'diretos'}
                onToggle={() => setExpandedSection(s => s === 'diretos' ? null : 'diretos')}
              />
              {expandedSection === 'diretos' && (
                <DrilldownDiretos data={diretosPorEtapa} qtdCasas={qtdCasas} />
              )}
              <BreakdownRow
                label="Indiretos (despesas)"
                orcado={agg.orcadoIndiretos}
                pedidos={null}
                pago={agg.pagoIndiretos}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'indiretos'}
                onToggle={() => setExpandedSection(s => s === 'indiretos' ? null : 'indiretos')}
              />
              {expandedSection === 'indiretos' && (
                <DrilldownIndiretos data={indiretosPorCategoria} qtdCasas={qtdCasas} />
              )}
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

              <tr>
                <td colSpan={8} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-t-2 border-border">
                  Operações Financeiras <span className="normal-case text-[10px] text-muted-foreground/70 ml-2">(só os juros entram no custo do projeto)</span>
                </td>
              </tr>
              <BreakdownRow
                label="Capital de giro (operação financeira — pagamento do principal NÃO é custo)"
                orcado={null}
                pedidos={null}
                pago={null}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'capital'}
                onToggle={() => setExpandedSection(s => s === 'capital' ? null : 'capital')}
                customCells={
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Captado (entrada)">
                      + {formatCurrency(agg.capitalCaptado)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Total contratado em parcelas">
                      {formatCurrency(agg.capitalContratadoParcelas)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Pago (principal + juros)">
                      − {formatCurrency(agg.capitalPagoTotal)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Saldo devedor">
                      {formatCurrency(agg.capitalSaldoDevedor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                  </>
                }
              />
              {expandedSection === 'capital' && (
                <DrilldownCapital data={capitalPorMutuo} />
              )}
              <tr className="bg-amber-500/10 font-semibold">
                <td className="px-3 py-2">Custo Financeiro (juros)</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400"
                  title="Projetado: total parcelas − captado">
                  {formatCurrency(agg.custoFinanceiroProjetado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400"
                  title="Juros apropriado proporcionalmente ao que foi pago">
                  {formatCurrency(agg.custoFinanceiroRealizado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {pct(agg.custoFinanceiroRealizado, agg.custoFinanceiroProjetado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(agg.custoFinanceiroProjetado - agg.custoFinanceiroRealizado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(agg.custoFinanceiroProjetado / qtdCasas)}
                </td>
                <td />
              </tr>

              <tr className="bg-primary/20 font-bold border-t-2 border-primary/50">
                <td className="px-3 py-2">TOTAL CUSTO DO PROJETO (operacional + juros)</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(agg.pagoComFinanceiro, agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro - agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro / qtdCasas)}</td>
                <td />
              </tr>

              <tr>
                <td colSpan={8} className="px-3 py-1.5 bg-muted/40 border-t-2 border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Margem do Projeto <span className="normal-case font-normal text-muted-foreground/70 ml-2">(receita − custo total)</span>
                </td>
              </tr>
              {(() => {
                const receita = agg.medicoesPlanejadas
                const margemBrutaOrcada = receita - agg.orcadoComFinanceiro
                const margemBrutaReal = agg.medicoesLiberadas - agg.pagoComFinanceiro
                const margemPctOrcada = receita > 0 ? (margemBrutaOrcada / receita) * 100 : 0
                const margemPctReal = agg.medicoesLiberadas > 0 ? (margemBrutaReal / agg.medicoesLiberadas) * 100 : 0
                const toneOrcado = margemBrutaOrcada >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                const toneReal = margemBrutaReal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                return (
                  <>
                    <tr className="bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground pl-6">Receita (medições)</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{formatCurrency(receita)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{formatCurrency(agg.medicoesLiberadas)}</td>
                      <td colSpan={4} />
                    </tr>
                    <tr className={`font-bold ${margemBrutaOrcada >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <td className="px-3 py-2">Margem Bruta</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${toneOrcado}`}>
                        {formatCurrency(margemBrutaOrcada)}
                        <span className="ml-1 text-xs font-normal opacity-70">({margemPctOrcada.toFixed(1)}%)</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${toneReal}`}>
                        {formatCurrency(margemBrutaReal)}
                        <span className="ml-1 text-xs font-normal opacity-70">({margemPctReal.toFixed(1)}%)</span>
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── DRAWER DE INSPEÇÃO ─── */}
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
      />
    </div>
  )
}

// ─── Separador de seção ───────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )
}
