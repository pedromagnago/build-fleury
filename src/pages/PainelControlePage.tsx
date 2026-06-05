/**
 * PainelControlePage — Consistência do sistema
 *
 * 1. Semáforo global
 * 2. 4 Equações contábeis (A/B/C/D)
 * 3. Ações necessárias — expansível por check, ações inline onde possível
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { AuditoriaContabilCard } from '@/components/financeiro/AuditoriaContabilCard'
import {
  Gauge, CheckCircle2, XCircle, AlertTriangle, ArrowRight, Scale,
  ChevronDown, ChevronRight, Trash2, Loader2, Plus,
} from 'lucide-react'
import { useHealthChecks, type HealthCheck, type HealthCheckItem } from '@/hooks/useHealthChecks'
import { useEquacoesContabeis } from '@/hooks/useEquacoesContabeis'
import { useAdiantamentos } from '@/hooks/useAdiantamentos'
import { useProject } from '@/contexts/ProjectContext'
import { useMedicoes } from '@/hooks/useOperacional'
import { usePedidos, useItensCompra } from '@/hooks/useCompras'
import { useParcelas, useCreateParcela, useDeleteParcela } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { GapInspectorDrawer, type GapOrigin } from '@/components/painel/GapInspectorDrawer'
import { gerarParcelas } from '@/lib/parcelas'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Semáforo global ─────────────────────────────────────────────────────────

function FaixaSaude({ critical, warn, eqComGap, total }: {
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
    <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-2.5 ${critical > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
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

// ─── Card de check expansível ─────────────────────────────────────────────────

type InlineAction = {
  label: string
  icon: typeof Trash2
  variant: 'danger' | 'primary'
  onAction: (item: HealthCheckItem) => Promise<void>
}

function CheckCard({
  check, inlineAction, navRoute,
}: {
  check: HealthCheck
  inlineAction?: InlineAction
  navRoute?: { label: string; fn: (item: HealthCheckItem) => string }
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const isCritical = check.severity === 'critical'
  const total = check.items.reduce((s, i) => s + (i.value ?? 0), 0)

  const borderColor = isCritical ? 'border-l-red-500' : 'border-l-amber-500'
  const bg = isCritical ? 'bg-red-500/5 border-red-200/30 dark:border-red-900/30' : 'bg-amber-500/5 border-amber-200/30 dark:border-amber-900/30'
  const titleColor = isCritical ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'

  const handleInline = async (item: HealthCheckItem) => {
    if (!inlineAction) return
    setLoading(item.id)
    try {
      await inlineAction.onAction(item)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className={`rounded-lg border-l-[3px] border ${borderColor} ${bg} overflow-hidden`}>
      {/* Header — clicável para expandir */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open
            ? <ChevronDown className={`h-4 w-4 shrink-0 ${titleColor}`} />
            : <ChevronRight className={`h-4 w-4 shrink-0 ${titleColor}`} />}
          {isCritical
            ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${titleColor}`}>{check.title}</div>
            <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {check.items.length} item{check.items.length !== 1 ? 's' : ''}
              {total > 0.01 && ` · ${formatCurrency(total)}`}
            </div>
          </div>
        </div>
        {/* Botão de navegação à página (quando não há ação inline por item) */}
        {!inlineAction && check.route && (
          <Link
            to={check.route}
            onClick={e => e.stopPropagation()}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isCritical ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {check.routeLabel ?? 'Ver'} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </button>

      {/* Lista de itens expandida */}
      {open && check.items.length > 0 && (
        <div className="border-t border-inherit divide-y divide-border/30">
          {check.items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-background/40">
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{item.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{item.description}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Ação inline (apagar, gerar, etc.) */}
                {inlineAction && (
                  <button
                    onClick={() => handleInline(item)}
                    disabled={loading === item.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      inlineAction.variant === 'danger'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    {loading === item.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <inlineAction.icon className="h-3 w-3" />}
                    {inlineAction.label}
                  </button>
                )}
                {/* Navegação com contexto (vai pro item específico) */}
                {navRoute && (
                  <Link
                    to={navRoute.fn(item)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Ver <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PainelControlePage() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: medicoes = [] } = useMedicoes()
  const { data: pedidos = [] } = usePedidos()
  const { data: itens = [] } = useItensCompra()
  const { data: parcelas = [] } = useParcelas()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: mutuos = [] } = useMutuos()
  const { data: adiantamentos = [] } = useAdiantamentos()
  const { events: fcEvents } = useCashFlowEvents('completo')
  const { stats: healthStats, checks } = useHealthChecks()
  const { equacoes } = useEquacoesContabeis()
  const createParcela = useCreateParcela()
  const deleteParcela = useDeleteParcela()

  const [inspectOrigin, setInspectOrigin] = useState<GapOrigin | null>(null)

  const qtdCasas = currentCompany?.qtd_casas ?? 1
  const eqComGap = equacoes.filter(e => e.status !== 'ok').length

  const acoes = useMemo(() => {
    const com = checks.filter(c => c.items.length > 0)
    return [...com.filter(c => c.severity === 'critical'), ...com.filter(c => c.severity === 'warn')]
  }, [checks])

  const hoje = new Date().toISOString().split('T')[0]!
  const adiantamentosEmRisco = useMemo(
    () => adiantamentos.filter(a => a.status !== 'abatido' && a.data_prevista_abatimento && a.data_prevista_abatimento < hoje),
    [adiantamentos, hoje]
  )

  // ─── Ações inline ──────────────────────────────────────────────────────────

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    qc.invalidateQueries({ queryKey: ['despesas-indiretas'] })
  }

  const apagarParcela = async (item: HealthCheckItem) => {
    await deleteParcela.mutateAsync(item.id)
    toast.success('Parcela removida')
  }

  const gerarParcelaPedido = async (item: HealthCheckItem) => {
    const ped = pedidos.find(p => p.id === item.id)
    if (!ped || !currentCompany) { toast.error('Pedido não encontrado'); return }
    const itemCompra = itens.find(i => i.id === ped.item_compra_id)
    const cond = ped.cond_pagamento || itemCompra?.cond_pagamento || 'à vista'
    const dataRaw = ped.data_entrega_prevista || new Date().toISOString().split('T')[0]!
    const parc = gerarParcelas({
      pedidoId: ped.id,
      companyId: currentCompany.id,
      valorTotal: Number(ped.valor_total_real || 0),
      condPagamento: cond,
      dataEntrega: new Date(dataRaw + 'T12:00:00'),
    })
    for (const p of parc) await createParcela.mutateAsync(p)
    invalidateAll()
    toast.success(`${parc.length} parcela(s) gerada(s)`)
  }

  const gerarParcelaDespesa = async (item: HealthCheckItem) => {
    const desp = (despesas as any[]).find(d => d.id === item.id)
    if (!desp || !currentCompany) { toast.error('Despesa não encontrada'); return }
    const { parsearCondicao } = await import('@/lib/parcelas')
    const cond = desp.cond_pagamento || 'à vista'
    const dataRaw = desp.data_prevista || new Date().toISOString().split('T')[0]!
    const dias = parsearCondicao(cond)
    const base = new Date(dataRaw + 'T12:00:00')
    const valorTotal = Number(desp.valor_orcado || 0)
    const porParcela = Math.floor((valorTotal / dias.length) * 100) / 100
    const parcelas = dias.map((d, idx) => {
      const dt = new Date(base)
      dt.setDate(dt.getDate() + d)
      const isLast = idx === dias.length - 1
      const valor = isLast ? Math.round((valorTotal - porParcela * (dias.length - 1)) * 100) / 100 : porParcela
      return {
        company_id: currentCompany.id,
        despesa_indireta_id: desp.id,
        numero_parcela: idx + 1,
        valor,
        data_vencimento: dt.toISOString().split('T')[0],
        status: 'futura' as const,
      }
    })
    for (const p of parcelas) await createParcela.mutateAsync(p)
    invalidateAll()
    toast.success(`${parcelas.length} parcela(s) gerada(s)`)
  }

  // ─── FC maps para o GapInspectorDrawer ────────────────────────────────────

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
        if (origem === 'medicao') { t.medicoes += ev.valor; if (ev.meta?.medicaoId) mMap[ev.meta.medicaoId] = (mMap[ev.meta.medicaoId] ?? 0) + ev.valor }
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) { t.capitalMutuo += ev.valor; if (ev.meta?.mutuoId) mcMap[ev.meta.mutuoId] = (mcMap[ev.meta.mutuoId] ?? 0) + ev.valor }
      } else {
        if (origem === 'despesa') { t.despesasIndiretas += ev.valor; if (ev.meta?.despesaId) dMap[ev.meta.despesaId] = (dMap[ev.meta.despesaId] ?? 0) + ev.valor }
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) { t.mutuoDevolucoes += ev.valor; if (ev.meta?.mutuoId) mdMap[ev.meta.mutuoId] = (mdMap[ev.meta.mutuoId] ?? 0) + ev.valor }
        else if (cat !== 'Banco' && origem !== 'avulsa') { t.pedidosObra += ev.valor; if (ev.meta?.pedidoId) pMap[ev.meta.pedidoId] = (pMap[ev.meta.pedidoId] ?? 0) + ev.valor }
      }
    }
    return { fcTotals: t, despesaFcMap: dMap, pedidoFcMap: pMap, medicaoFcMap: mMap, mutuoCaptacaoFcMap: mcMap, mutuoDevolucaoFcMap: mdMap }
  }, [fcEvents])

  const pedidosTotal = useMemo(() =>
    pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => {
      const coberto = Number((p as any).valor_coberto_por_realizacao || 0)
      return s + Math.max(0, Number(p.valor_total_real || 0) - coberto)
    }, 0), [pedidos])

  // ─── Mapa check.id → ação inline + nav contextual ─────────────────────────

  const checkConfig: Record<string, {
    inlineAction?: InlineAction
    navRoute?: { label: string; fn: (item: HealthCheckItem) => string }
  }> = {
    'pedidos-sem-parcela': {
      inlineAction: { label: 'Gerar parcelas', icon: Plus, variant: 'primary', onAction: gerarParcelaPedido },
      navRoute: { label: 'Ver', fn: (i) => `/compras?pedido=${i.id}` },
    },
    'itens-sem-pedido': {
      navRoute: { label: 'Ver', fn: (i) => `/compras?item=${i.id}` },
    },
    'estouro-orcamento': {
      navRoute: { label: 'Ver', fn: () => `/compras` },
    },
    'parcelas-vencidas': {
      navRoute: { label: 'Ver', fn: (i) => i.pedidoId ? `/pagamentos?pedido=${i.pedidoId}` : `/pagamentos` },
    },
    'medicoes-sem-dist': {
      navRoute: { label: 'Ver', fn: () => `/cronograma` },
    },
    'etapas-sem-item': {
      navRoute: { label: 'Ver', fn: () => `/cronograma` },
    },
    'mutuos-vencidos': {
      navRoute: { label: 'Ver', fn: () => `/mutuos` },
    },
    'despesas-estouradas': {
      navRoute: { label: 'Ver', fn: (i) => `/custos-indiretos?despesa=${i.id}` },
    },
    'parcela-parcial-atrasada': {
      navRoute: { label: 'Ver', fn: (i) => i.pedidoId ? `/pagamentos?pedido=${i.pedidoId}` : `/pagamentos` },
    },
    'parcelas-vs-pedido': {
      navRoute: { label: 'Ver', fn: (i) => `/pagamentos?pedido=${i.id}` },
    },
    'pago-vs-movs': {
      navRoute: { label: 'Ver', fn: () => `/conciliacao` },
    },
    'parcelas-vs-despesa': {
      navRoute: { label: 'Ver', fn: (i) => `/custos-indiretos?despesa=${i.id}` },
    },
    'despesa-sem-parcela': {
      inlineAction: { label: 'Gerar parcelas', icon: Plus, variant: 'primary', onAction: gerarParcelaDespesa },
      navRoute: { label: 'Ver', fn: (i) => `/custos-indiretos?despesa=${i.id}` },
    },
    'parcelas-orfas': {
      inlineAction: { label: 'Apagar', icon: Trash2, variant: 'danger', onAction: apagarParcela },
    },
    'pedido-cancelado-com-parcela': {
      navRoute: { label: 'Ver', fn: (i) => `/pagamentos?pedido=${i.id}` },
    },
    'parcelas-dessinc': {
      navRoute: { label: 'Ver', fn: (i) => i.pedidoId ? `/pagamentos?pedido=${i.pedidoId}` : `/pagamentos` },
    },
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Painel de Controle"
        description={`Consistência do sistema · ${qtdCasas} casa${qtdCasas !== 1 ? 's' : ''}`}
        icon={Gauge}
      />

      {/* 1. Semáforo */}
      <FaixaSaude critical={healthStats.critical} warn={healthStats.warn} eqComGap={eqComGap} total={healthStats.total} />

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
              <div className="flex items-center gap-3">
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">Adiantamentos com prazo vencido</div>
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

          {/* Checks expansíveis */}
          {acoes.map(c => {
            const cfg = checkConfig[c.id] ?? {}
            return (
              <CheckCard
                key={c.id}
                check={c}
                inlineAction={cfg.inlineAction}
                navRoute={cfg.navRoute}
              />
            )
          })}
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
