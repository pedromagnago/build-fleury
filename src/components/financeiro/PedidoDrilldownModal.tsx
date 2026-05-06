/**
 * PedidoDrilldownModal — Auditoria visual de um pedido
 *
 * Mostra parcelas (contratuais e adiantamentos) lado a lado com as movs
 * bancarias vinculadas. Destaca em vermelho:
 *   - saldo aberto invisivel no fluxo (regra A)
 *   - divergencia baixa vs extrato (regra C)
 *   - status dessincronizado (regra D)
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, ExternalLink, Calendar, Banknote, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { formatCurrency, cn } from '@/lib/utils'

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

interface Props {
  pedidoId: string
  onClose: () => void
}

export function PedidoDrilldownModal({ pedidoId, onClose }: Props) {
  const navigate = useNavigate()
  const { currentCompany } = useProject()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { data: movs = [] } = useMovimentacoes()

  const pedido = pedidos.find(p => p.id === pedidoId)
  const parcelasPedido = useMemo(
    () => parcelas
      .filter(p => p.pedido_id === pedidoId)
      .sort((a, b) => {
        // contratuais primeiro, depois por numero
        const t = (a.tipo === 'adiantamento' ? 1 : 0) - (b.tipo === 'adiantamento' ? 1 : 0)
        if (t !== 0) return t
        return a.numero_parcela - b.numero_parcela
      }),
    [parcelas, pedidoId]
  )

  // Carrega conciliacoes ligadas as parcelas deste pedido (mesmo padrao do useCashFlowEvents)
  const parcelaIds = parcelasPedido.map(p => p.id)
  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ['drilldown-links', currentCompany?.id, pedidoId],
    queryFn: async () => {
      if (!currentCompany || parcelaIds.length === 0) return [] as any[]
      const { data, error } = await supabase
        .from('conciliacoes')
        .select('id, movimentacao_id, status, conciliacao_parcelas(parcela_id)')
        .eq('company_id', currentCompany.id)
        .neq('status', 'rejeitado')
      if (error) throw error
      return data ?? []
    },
    enabled: !!currentCompany && parcelaIds.length > 0,
  })

  // Mapa parcela_id → movs (com data + valor)
  const movsByParcela = useMemo(() => {
    const map = new Map<string, Array<{ id: string; data: string; descricao: string; valor: number }>>()
    const movById = new Map(movs.map((m: any) => [m.id, m]))
    for (const c of (links as any[])) {
      for (const l of (c.conciliacao_parcelas || [])) {
        if (!l.parcela_id) continue
        const mv = movById.get(c.movimentacao_id)
        if (!mv) continue
        const arr = map.get(l.parcela_id) ?? []
        arr.push({
          id: mv.id,
          data: mv.data,
          descricao: mv.descricao || '—',
          valor: Math.abs(Number(mv.valor || 0)),
        })
        map.set(l.parcela_id, arr)
      }
    }
    // ordena cronologicamente
    for (const arr of map.values()) arr.sort((a, b) => a.data.localeCompare(b.data))
    return map
  }, [links, movs])

  const totais = useMemo(() => {
    let totalParcelas = 0
    let totalPagoBaixa = 0
    let totalPagoMovs = 0
    let totalSaldoOculto = 0
    for (const p of parcelasPedido) {
      const v = Number(p.valor || 0)
      const vp = Number(p.valor_pago || 0)
      totalParcelas += v
      totalPagoBaixa += vp
      const movsParc = movsByParcela.get(p.id) ?? []
      const somaMov = movsParc.reduce((s, m) => s + m.valor, 0)
      totalPagoMovs += somaMov
      const saldo = v - vp
      const isPaga = p.status === 'paga' || vp >= v - 0.005
      if (!isPaga && saldo > 0.01 && movsParc.length > 0) {
        totalSaldoOculto += saldo
      }
    }
    return { totalParcelas, totalPagoBaixa, totalPagoMovs, totalSaldoOculto }
  }, [parcelasPedido, movsByParcela])

  if (!pedido) {
    return (
      <ModalShell onClose={onClose}>
        <div className="p-8 text-center text-sm text-muted-foreground">Pedido não encontrado.</div>
      </ModalShell>
    )
  }

  const valorTotalPedido = Number(pedido.valor_total_real ?? 0)
  const difCobertura = totais.totalParcelas - valorTotalPedido

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between border-b px-6 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">
              Pedido #{pedido.numero_pedido ?? '?'}
            </h2>
            <StatusBadge status={pedido.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">
            {pedido.fornecedor_nome || 'Sem fornecedor'} · {pedido.item_descricao || pedido.item_codigo || 'Item'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-accent transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3 border-b bg-muted/20 px-6 py-3 text-xs">
        <Stat label="Valor pedido" value={formatCurrency(valorTotalPedido)} />
        <Stat
          label="Σ parcelas"
          value={formatCurrency(totais.totalParcelas)}
          sub={Math.abs(difCobertura) > 0.5 ? `dif ${difCobertura > 0 ? '+' : ''}${formatCurrency(difCobertura)}` : undefined}
          subTone={Math.abs(difCobertura) > 0.5 ? 'danger' : undefined}
        />
        <Stat
          label="Pago (baixa)"
          value={formatCurrency(totais.totalPagoBaixa)}
          sub={Math.abs(totais.totalPagoMovs - totais.totalPagoBaixa) > 0.5 ? `mov ${formatCurrency(totais.totalPagoMovs)}` : undefined}
          subTone={Math.abs(totais.totalPagoMovs - totais.totalPagoBaixa) > 0.5 ? 'warn' : undefined}
        />
        <Stat
          label="Saldo oculto no fluxo"
          value={formatCurrency(totais.totalSaldoOculto)}
          tone={totais.totalSaldoOculto > 0.5 ? 'danger' : 'ok'}
        />
      </div>

      {/* Parcelas */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scroll-visible">
        {linksLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Carregando movimentações…</div>
        ) : parcelasPedido.length === 0 ? (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium">Pedido sem parcelas</p>
            <p className="mt-1 text-xs text-muted-foreground">Este pedido ainda não foi parcelado — o fluxo não tem previsão de saída.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {parcelasPedido.map(p => (
              <ParcelaRow key={p.id} parcela={p} movs={movsByParcela.get(p.id) ?? []} />
            ))}
          </ul>
        )}
      </div>

      {/* Footer com ações */}
      <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-6 py-3 text-xs">
        <span className="text-muted-foreground">
          {parcelasPedido.length} parcela(s) · {Array.from(movsByParcela.values()).flat().length} mov(s) vinculada(s)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { navigate('/conciliacao'); onClose() }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-[11px] font-semibold hover:bg-accent transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Conciliação
          </button>
          <button
            onClick={() => { navigate('/pagamentos'); onClose() }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-[11px] font-semibold hover:bg-accent transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Pagamentos
          </button>
          <button
            onClick={() => { navigate('/compras'); onClose() }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Editar pedido
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function Stat({
  label, value, sub, tone, subTone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'danger' | 'warn' | 'ok'
  subTone?: 'danger' | 'warn'
}) {
  const valueColor = tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : ''
  const subColor = subTone === 'danger' ? 'text-red-600' : subTone === 'warn' ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-sm font-bold tabular-nums', valueColor)}>{value}</div>
      {sub && <div className={cn('text-[10px] tabular-nums', subColor)}>{sub}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'pago' ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' :
    status === 'parcialmente_pago' ? 'bg-amber-500/15 text-amber-700 border-amber-500/30' :
    status === 'cancelado' ? 'bg-muted text-muted-foreground border-border' :
    'bg-blue-500/15 text-blue-700 border-blue-500/30'
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide', cls)}>
      {status}
    </span>
  )
}

function ParcelaRow({
  parcela: p,
  movs,
}: {
  parcela: any
  movs: Array<{ id: string; data: string; descricao: string; valor: number }>
}) {
  const v = Number(p.valor || 0)
  const vp = Number(p.valor_pago || 0)
  const saldo = v - vp
  const isPaga = p.status === 'paga' || vp >= v - 0.005
  const somaMovs = movs.reduce((s, m) => s + m.valor, 0)

  // Diagnostico
  const saldoOculto = !isPaga && saldo > 0.01 && movs.length > 0
  const divPagoMovs = movs.length > 0 && Math.abs(somaMovs - vp) > 0.5
  const statusDessinc = (p.status === 'paga' && vp < v - 0.5) || vp > v + 0.5

  const tone = saldoOculto || statusDessinc || divPagoMovs ? 'critical' : isPaga ? 'ok' : 'pending'
  const borderCls =
    tone === 'critical' ? 'border-l-red-500' :
    tone === 'ok' ? 'border-l-emerald-500' :
    'border-l-blue-400'

  return (
    <li className={cn('rounded-lg border border-l-4 bg-card', borderCls)}>
      {/* Cabeçalho da parcela */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-[11px] font-bold">
          {p.tipo === 'adiantamento' ? 'ADI' : `P${p.numero_parcela}`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>
              {p.tipo === 'adiantamento' ? 'Adiantamento' : `Parcela contratual ${p.numero_parcela}`}
            </span>
            <span className="text-muted-foreground font-normal">·</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {fmtDate(p.data_vencimento)}
            </span>
            <span className="text-muted-foreground font-normal">·</span>
            <span className="text-[10px] text-muted-foreground">{p.status}</span>
          </div>
          {p.descricao && <div className="text-[10px] text-muted-foreground truncate">{p.descricao}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-bold tabular-nums">{formatCurrency(v)}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            pago {formatCurrency(vp)}
          </div>
        </div>
      </div>

      {/* Movs vinculadas */}
      {movs.length > 0 && (
        <div className="border-t bg-muted/20 px-4 py-2 space-y-1">
          {movs.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[10px]">
              <Banknote className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums shrink-0 w-20">{fmtDate(m.data)}</span>
              <span className="flex-1 truncate" title={m.descricao}>{m.descricao}</span>
              <span className="font-semibold tabular-nums shrink-0">{formatCurrency(m.valor)}</span>
            </div>
          ))}
          {divPagoMovs && (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
              <ArrowRight className="h-3 w-3" />
              Σ movs ({formatCurrency(somaMovs)}) ≠ valor_pago ({formatCurrency(vp)})
            </div>
          )}
        </div>
      )}

      {/* Diagnóstico */}
      {(saldoOculto || statusDessinc || (!isPaga && movs.length === 0 && saldo > 0)) && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-[10px]">
          {saldoOculto && (
            <div className="flex items-center gap-1.5 font-semibold text-red-600">
              <AlertTriangle className="h-3 w-3" />
              Saldo aberto de {formatCurrency(saldo)} oculto do fluxo (parcela já tem mov vinculada)
            </div>
          )}
          {statusDessinc && (
            <div className="flex items-center gap-1.5 font-semibold text-red-600">
              <AlertTriangle className="h-3 w-3" />
              Status &quot;{p.status}&quot; não bate com valor_pago {formatCurrency(vp)} / valor {formatCurrency(v)}
            </div>
          )}
          {!isPaga && movs.length === 0 && saldo > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Previsão de saída no fluxo: {formatCurrency(saldo)}
            </div>
          )}
        </div>
      )}

      {isPaga && !statusDessinc && !divPagoMovs && (
        <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-4 py-1 text-[10px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Quitada · sem divergência
        </div>
      )}
    </li>
  )
}
