/**
 * HealthTrendSparkline — Mini grafico de tendencia (problemas criticos/dia).
 *
 * Usa snapshots persistidos pelo useHealthSnapshots. Renderiza barras
 * pequenas inline no header da tabela de inconsistencias.
 */
import { useMemo } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useHealthSnapshots } from '@/hooks/useHealthSnapshots'
import { cn } from '@/lib/utils'

const fmtDay = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function HealthTrendSparkline() {
  const { snapshots, trend, isLoading } = useHealthSnapshots()

  const view = useMemo(() => snapshots.slice(-30), [snapshots])
  const max = useMemo(() => Math.max(1, ...view.map(s => s.total_items)), [view])

  if (isLoading || view.length < 2) {
    // Sem 2 dias de dados ainda nao da pra mostrar tendencia
    return null
  }

  const dt = trend.deltaItems
  const TrendIcon = dt < 0 ? TrendingDown : dt > 0 ? TrendingUp : Minus
  const trendColor = dt < 0 ? 'text-emerald-600' : dt > 0 ? 'text-red-600' : 'text-muted-foreground'
  const trendLabel = dt === 0 ? 'estável' : dt > 0 ? `+${dt}` : `${dt}`

  return (
    <div className="flex items-center gap-3 border-b bg-muted/10 px-4 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tendência (30d)</span>

      {/* Barras */}
      <div className="flex items-end gap-0.5 h-7" title={`${view.length} snapshots`}>
        {view.map(s => {
          const height = Math.max(2, Math.round((s.total_items / max) * 26))
          const danger = s.critical_count > 0
          return (
            <div
              key={s.id}
              className={cn(
                'w-1 rounded-t transition-all',
                danger ? 'bg-red-500/70' : s.warn_count > 0 ? 'bg-amber-500/70' : 'bg-emerald-500/70',
              )}
              style={{ height: `${height}px` }}
              title={`${fmtDay(s.snapshot_date)}: ${s.total_items} problema(s) (${s.critical_count} crít.)`}
            />
          )
        })}
      </div>

      {/* Trend pill */}
      <div className={cn('inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold border', trendColor)}>
        <TrendIcon className="h-3 w-3" />
        {trendLabel} vs {trend.previous ? fmtDay(trend.previous.snapshot_date) : 'ontem'}
      </div>

      {trend.current && (
        <span className="text-[10px] text-muted-foreground">
          Hoje: <strong className="tabular-nums">{trend.current.total_items}</strong> · Crít: <strong className="tabular-nums">{trend.current.critical_count}</strong>
        </span>
      )}
    </div>
  )
}
