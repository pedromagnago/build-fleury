/**
 * AuditoriaContabilCard — 3 equações que devem fechar.
 *
 * Cada equação mostra:
 *   - Esquerdo = Direito ?  (com gap explícito)
 *   - Decomposição em buckets quando não fecha
 *   - Drill-down: clicar num bucket revela os itens individuais
 *
 * Esta é a leitura primária do Painel de Controle. As regras heurísticas
 * (parcelas vencidas, atrasos, etc.) ficam abaixo, na InconsistenciasTable.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useEquacoesContabeis, type Equacao, type EquacaoBucket, type BucketItem } from '@/hooks/useEquacoesContabeis'
import { useProject } from '@/contexts/ProjectContext'
import { regenerarParcelasDoPedido } from '@/lib/regenerarParcelasDoPedido'
import { formatCurrency, cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Scale, RefreshCw, Loader2, ExternalLink } from 'lucide-react'

/** Buckets onde a ação "regenerar parcelas" faz sentido. Os IDs vêm de useEquacoesContabeis. */
const BUCKETS_REGENERAVEIS = new Set(['pedido-sem-parcela', 'pedido-parcial'])

/** Buckets meramente categóricos — não somam no gap, só explicam. */
const BUCKETS_INFORMATIVOS = new Set([
  'transf-interna',
  'd-saida-parcela',
  'd-saida-mut-parc',
  'd-saida-medicao',
])

/**
 * Mapeia cada bucket pra uma ação inline navegável (rota + termo de busca).
 * O termo é extraído do label do item para pré-filtrar a página de destino.
 */
function actionForBucket(bucketId: string, item: BucketItem): { label: string; route: string } | null {
  // Extrai número de pedido do label "Pedido #534 — FORN..." se houver
  const numMatch = item.label.match(/#(\d+)/)
  const num = numMatch?.[1] ?? ''
  const desc = encodeURIComponent(item.label.split('—')[0]?.trim() ?? '')
  switch (bucketId) {
    case 'pedido-sem-parcela':
    case 'pedido-parcial':
    case 'pedido-excesso':
      return { label: 'Abrir pedido', route: num ? `/compras?search=${num}` : '/compras' }
    case 'despesa-gap':
      return { label: 'Editar despesa', route: '/custos-indiretos' }
    case 'adiantamento-orfao':
      return { label: 'Ver pagamentos', route: `/pagamentos?search=${desc}` }
    case 'parcela-orfa-contratual':
      return { label: 'Vincular ao pedido', route: '__orfas__' }  // tratado pelo onOrfasClick
    case 'b-pago-sem-mov':
      return { label: 'Conciliar', route: '/conciliacao' }
    case 'b-mov-sem-pago':
    case 'b-mov-dif-pago':
      return { label: 'Reconciliar', route: '/conciliacao' }
    case 'possivel-adiant':
    case 'd-saida-orfa':
      return { label: 'Criar parcela', route: '/conciliacao' }
    case 'mov-entrada-orfa':
      return { label: 'Vincular a mútuo', route: '/conciliacao' }
    case 'd-saida-mut-avulso':
      return { label: 'Revisar mútuo', route: '/mutuos' }
    case 'd-saida-parcela':
    case 'd-saida-mut-parc':
    case 'd-saida-medicao':
    case 'transf-interna':
      return { label: 'Ver mov', route: '/conciliacao' }
    default:
      return null
  }
}

const STATUS_CFG = {
  ok:    { icon: CheckCircle2,   pill: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400', card: 'border-emerald-500/30 bg-emerald-500/5',  label: 'OK' },
  warn:  { icon: AlertTriangle,  pill: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',         card: 'border-amber-500/40 bg-amber-500/5',     label: 'Atenção' },
  error: { icon: XCircle,        pill: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400',                card: 'border-red-500/40 bg-red-500/5',         label: 'Erro' },
} as const

export function AuditoriaContabilCard({ onOrfasClick }: { onOrfasClick?: () => void } = {}) {
  const { equacoes, isLoading } = useEquacoesContabeis()
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [expandedEq, setExpandedEq] = useState<string | null>(null)
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null)
  const [bulkRegen, setBulkRegen] = useState<{ bucketId: string; done: number; total: number } | null>(null)

  /** Roda regenerarParcelasDoPedido em sequência sobre todos os pedidos do bucket. */
  const handleBulkRegenerar = async (bucket: EquacaoBucket) => {
    if (!currentCompany || bulkRegen) return
    const ok = window.confirm(
      `Regenerar parcelas de ${bucket.qtd} pedido(s)?\n\n` +
      `• Parcelas pagas/parcialmente pagas serão preservadas.\n` +
      `• Parcelas pendentes/vencidas serão recriadas com base em cond_pagamento.\n\n` +
      `Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setBulkRegen({ bucketId: bucket.id, done: 0, total: bucket.qtd })
    let sucesso = 0
    let falha = 0
    for (let i = 0; i < bucket.items.length; i++) {
      const it = bucket.items[i]
      if (!it) continue
      try {
        await regenerarParcelasDoPedido(it.id, currentCompany.id)
        sucesso++
      } catch (err) {
        console.error(`Falha ao regenerar pedido ${it.label}:`, err)
        falha++
      }
      setBulkRegen({ bucketId: bucket.id, done: i + 1, total: bucket.items.length })
    }
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    qc.invalidateQueries({ queryKey: ['equacoes-links'] })
    setBulkRegen(null)
    if (falha === 0) toast.success(`${sucesso} pedido(s) regenerado(s).`)
    else toast.warning(`${sucesso} ok • ${falha} falharam (ver console).`)
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Calculando equações…</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold tracking-tight">Auditoria contábil</h2>
          <span className="text-[11px] text-muted-foreground">3 equações que devem fechar em zero</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {equacoes.map(eq => (
          <EquacaoCard
            key={eq.id}
            eq={eq}
            isOpen={expandedEq === eq.id}
            onToggle={() => {
              setExpandedEq(expandedEq === eq.id ? null : eq.id)
              setExpandedBucket(null)
            }}
            expandedBucket={expandedBucket}
            onToggleBucket={(id) => setExpandedBucket(expandedBucket === id ? null : id)}
            onBulkRegenerar={handleBulkRegenerar}
            bulkRegen={bulkRegen}
          />
        ))}
      </div>
    </div>
  )
}

function EquacaoCard({
  eq, isOpen, onToggle, expandedBucket, onToggleBucket, onBulkRegenerar, bulkRegen,
}: {
  eq: Equacao
  isOpen: boolean
  onToggle: () => void
  expandedBucket: string | null
  onToggleBucket: (id: string) => void
  onBulkRegenerar: (bucket: EquacaoBucket) => void
  bulkRegen: { bucketId: string; done: number; total: number } | null
}) {
  const cfg = STATUS_CFG[eq.status]
  const Icon = cfg.icon
  const hasDrill = eq.buckets.length > 0

  return (
    <div className={cn('rounded-xl border overflow-hidden', cfg.card)}>
      {/* Header */}
      <button
        onClick={hasDrill ? onToggle : undefined}
        disabled={!hasDrill}
        className={cn(
          'w-full px-4 py-3 text-left flex items-start gap-3 transition-colors',
          hasDrill && 'hover:bg-background/40 cursor-pointer',
        )}
      >
        <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', {
          'text-emerald-600': eq.status === 'ok',
          'text-amber-600':   eq.status === 'warn',
          'text-red-600':     eq.status === 'error',
        })} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{eq.title}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', cfg.pill)}>
              {cfg.label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground italic truncate" title={eq.formula}>
            {eq.formula}
          </div>

          {/* Lado esquerdo = direito */}
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="text-muted-foreground">{eq.esquerdo.label}</div>
              <div className="font-semibold tabular-nums">{formatCurrency(eq.esquerdo.value)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{eq.direito.label}</div>
              <div className="font-semibold tabular-nums">{formatCurrency(eq.direito.value)}</div>
            </div>
          </div>

          {/* Gap */}
          <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gap</span>
              <span className={cn('text-base font-bold tabular-nums', {
                'text-emerald-600': eq.status === 'ok',
                'text-amber-600':   eq.status === 'warn',
                'text-red-600':     eq.status === 'error',
              })}>
                {eq.gap > 0 ? '+' : ''}{formatCurrency(eq.gap)}
              </span>
            </div>
          </div>
        </div>
        {hasDrill && (
          isOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5" />
        )}
      </button>

      {/* Drill-down: buckets */}
      {isOpen && hasDrill && (
        <div className="border-t bg-background/40 px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Decomposição
          </div>
          <div className="space-y-1">
            {eq.buckets.map(b => (
              <BucketRow
                key={b.id}
                bucket={b}
                isOpen={expandedBucket === b.id}
                onToggle={() => onToggleBucket(b.id)}
                canRegen={BUCKETS_REGENERAVEIS.has(b.id)}
                onBulkRegenerar={() => onBulkRegenerar(b)}
                bulkRegen={bulkRegen?.bucketId === b.id ? bulkRegen : null}
                onOrfasClick={onOrfasClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BucketRow({
  bucket, isOpen, onToggle, canRegen, onBulkRegenerar, bulkRegen, onOrfasClick,
}: {
  bucket: EquacaoBucket
  isOpen: boolean
  onToggle: () => void
  canRegen: boolean
  onBulkRegenerar: () => void
  bulkRegen: { bucketId: string; done: number; total: number } | null
  onOrfasClick?: () => void
}) {
  const navigate = useNavigate()
  const running = !!bulkRegen
  const isInfo = BUCKETS_INFORMATIVOS.has(bucket.id)
  return (
    <div className={cn(
      'rounded-md border overflow-hidden',
      isInfo ? 'border-border/30 bg-muted/30' : 'border-border/50 bg-background',
    )}>
      <div className="w-full px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-accent/30 transition-colors">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          {isOpen
            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <span className="flex-1 truncate font-medium">{bucket.label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{bucket.qtd}</span>
          <span className={cn('text-xs font-bold tabular-nums shrink-0', bucket.valor < 0 ? 'text-red-600' : 'text-amber-600')}>
            {bucket.valor > 0 ? '+' : ''}{formatCurrency(bucket.valor)}
          </span>
        </button>
        {canRegen && bucket.qtd > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onBulkRegenerar() }}
            disabled={running}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            title="Regenerar parcelas dos pedidos deste bucket. Pagas são preservadas."
          >
            {running
              ? <><Loader2 className="h-3 w-3 animate-spin" />{bulkRegen.done}/{bulkRegen.total}</>
              : <><RefreshCw className="h-3 w-3" />Regenerar</>}
          </button>
        )}
      </div>
      {isOpen && bucket.items.length > 0 && (
        <div className="border-t border-border/50 max-h-64 overflow-y-auto scroll-visible">
          <table className="w-full text-[11px]">
            <tbody className="divide-y divide-border/30">
              {bucket.items.slice(0, 100).map((it) => {
                const action = actionForBucket(bucket.id, it)
                return (
                  <tr key={it.id} className="group hover:bg-accent/30">
                    <td className="px-3 py-1 truncate max-w-[260px]" title={it.label}>
                      {it.label}
                    </td>
                    <td className="px-3 py-1 text-muted-foreground truncate max-w-[260px]" title={it.description}>
                      {it.description}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums font-semibold whitespace-nowrap">
                      {it.value > 0 ? '+' : ''}{formatCurrency(it.value)}
                    </td>
                    <td className="px-3 py-1 w-20">
                      {action && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (action.route === '__orfas__') { onOrfasClick?.(); return }
                            navigate(action.route)
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 opacity-0 group-hover:opacity-100 transition-all"
                          title={action.label}
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {action.label}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {bucket.items.length > 100 && (
                <tr>
                  <td colSpan={4} className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">
                    +{bucket.items.length - 100} item(ns) adicionais
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
