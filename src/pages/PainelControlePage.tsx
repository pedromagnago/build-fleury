/**
 * PainelControlePage — Consistência do sistema
 *
 * Hierarquia:
 *   1. Semáforo global (1 linha)
 *   2. 4 Equações contábeis (A/B/C/D)
 *   3. Ações necessárias — todos os checks críticos e atenção, flat, com botão de ação
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { AuditoriaContabilCard } from '@/components/financeiro/AuditoriaContabilCard'
import {
  Gauge, CheckCircle2, XCircle, AlertTriangle, ArrowRight, Scale,
} from 'lucide-react'
import { useHealthChecks, type HealthCheck } from '@/hooks/useHealthChecks'
import { useEquacoesContabeis } from '@/hooks/useEquacoesContabeis'
import { useAdiantamentos } from '@/hooks/useAdiantamentos'
import { useProject } from '@/contexts/ProjectContext'
import { useMedicoes } from '@/hooks/useOperacional'
import { usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMutuos } from '@/hooks/useMutuos'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { GapInspectorDrawer, type GapOrigin } from '@/components/painel/GapInspectorDrawer'
import { formatCurrency } from '@/lib/utils'

// ─── Semáforo global ─────────────────────────────────────────────────────────

function FaixaSaude({
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
          Sistema consistente — todas as equações fecham, nenhum alerta
        </span>
        <span className="ml-auto text-[10px] text-emerald-600">{total} verificações OK</span>
      </div>
    )
  }
  return (
    <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
      critical > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Saúde</span>
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

// ─── Linha de ação ────────────────────────────────────────────────────────────

function AcaoRow({ check }: { check: HealthCheck }) {
  const isCritical = check.severity === 'critical'
  const total = check.items.reduce((s, i) => s + (i.value ?? 0), 0)
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border-l-[3px] px-4 py-3 ${
      isCritical
        ? 'border-l-red-500 bg-red-500/5 border border-red-200/30 dark:border-red-900/30'
        : 'border-l-amber-500 bg-amber-500/5 border border-amber-200/30 dark:border-amber-900/30'
    }`}>
      <div className="flex items-start gap-3 min-w-0">
        {isCritical
          ? <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${isCritical ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {check.title}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
            {check.items.length} item{check.items.length !== 1 ? 's' : ''}
            {total > 0.01 && ` · ${formatCurrency(total)}`}
          </div>
        </div>
      </div>
      {check.route && (
        <Link
          to={check.route}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isCritical
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {check.routeLabel ?? 'Corrigir'} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PainelControlePage() {
  const { currentCompany } = useProject()
  const { data: medicoes = [] } = useMedicoes()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: mutuos = [] } = useMutuos()
  const { data: adiantamentos = [] } = useAdiantamentos()
  const { events: fcEvents } = useCashFlowEvents('completo')
  const { stats: healthStats, checks } = useHealthChecks()
  const { equacoes } = useEquacoesContabeis()

  const [inspectOrigin, setInspectOrigin] = useState<GapOrigin | null>(null)

  const qtdCasas = currentCompany?.qtd_casas ?? 1
  const eqComGap = equacoes.filter(e => e.status !== 'ok').length

  // Todos os checks com problema, críticos primeiro
  const acoes = useMemo(() => {
    const comProblema = checks.filter(c => c.items.length > 0)
    return [
      ...comProblema.filter(c => c.severity === 'critical'),
      ...comProblema.filter(c => c.severity === 'warn'),
    ]
  }, [checks])

  // Adiantamentos com prazo vencido (alerta especial)
  const hoje = new Date().toISOString().split('T')[0]!
  const adiantamentosEmRisco = useMemo(
    () => adiantamentos.filter(a => a.status !== 'abatido' && a.data_prevista_abatimento && a.data_prevista_abatimento < hoje),
    [adiantamentos, hoje]
  )

  // FC maps para o GapInspectorDrawer (equações)
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
    return { fcTotals: t, despesaFcMap: dMap, pedidoFcMap: pMap, medicaoFcMap: mMap, mutuoCaptacaoFcMap: mcMap, mutuoDevolucaoFcMap: mdMap }
  }, [fcEvents])

  const pedidosTotal = useMemo(() =>
    pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => {
      const coberto = Number((p as any).valor_coberto_por_realizacao || 0)
      return s + Math.max(0, Number(p.valor_total_real || 0) - coberto)
    }, 0),
    [pedidos]
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Painel de Controle"
        description={`Consistência do sistema · ${qtdCasas} casa${qtdCasas !== 1 ? 's' : ''}`}
        icon={Gauge}
      />

      {/* 1. Semáforo */}
      <FaixaSaude
        critical={healthStats.critical}
        warn={healthStats.warn}
        eqComGap={eqComGap}
        total={healthStats.total}
      />

      {/* 2. 4 Equações contábeis */}
      <AuditoriaContabilCard onOrfasClick={() => setInspectOrigin('orfas')} />

      {/* 3. Ações necessárias */}
      {acoes.length === 0 && adiantamentosEmRisco.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Nenhuma ação necessária — sistema consistente.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
            Ações necessárias ({acoes.length + (adiantamentosEmRisco.length > 0 ? 1 : 0)})
          </div>

          {/* Adiantamentos em risco */}
          {adiantamentosEmRisco.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border-l-[3px] border-l-red-500 bg-red-500/5 border border-red-200/30 dark:border-red-900/30 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">
                    Adiantamentos com prazo vencido
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    {adiantamentosEmRisco.length} item{adiantamentosEmRisco.length !== 1 ? 's' : ''} · {formatCurrency(adiantamentosEmRisco.reduce((s, a) => s + (a.valor - a.valor_abatido), 0))}
                  </div>
                </div>
              </div>
              <Link to="/adiantamentos" className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                Ver <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Todos os checks com problema */}
          {acoes.map(c => <AcaoRow key={c.id} check={c} />)}
        </div>
      )}

      {/* Drawer de inspeção (equações) */}
      <GapInspectorDrawer
        origin={inspectOrigin}
        onClose={() => setInspectOrigin(null)}
        medicoes={medicoes}
        pedidos={pedidos as any}
        parcelas={parcelas}
        mutuos={mutuos}
        despesas={despesas as any}
        fcTotalPedidos={fcTotals.pedidosObra}
        pedidosTotal={pedidosTotal}
        despesaFcMap={despesaFcMap}
        pedidoFcMap={pedidoFcMap}
        medicaoFcMap={medicaoFcMap}
        mutuoCaptacaoFcMap={mutuoCaptacaoFcMap}
        mutuoDevolucaoFcMap={mutuoDevolucaoFcMap}
      />
    </div>
  )
}
