import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHealthChecks, type HealthCheck, type CheckSeverity } from '@/hooks/useHealthChecks'
import { cn } from '@/lib/utils'
import {
  Activity,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Stethoscope,
} from 'lucide-react'

// ── Severity config ──
const SEV: Record<CheckSeverity, { icon: typeof CheckCircle2; color: string; bg: string; badge: string; label: string }> = {
  ok:       { icon: CheckCircle2,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25', label: 'OK' },
  warn:     { icon: AlertTriangle, color: 'text-amber-500',   bg: 'bg-amber-500/10',   badge: 'bg-amber-500/15 text-amber-600 border-amber-500/25',     label: 'Atenção' },
  critical: { icon: XCircle,       color: 'text-red-500',     bg: 'bg-red-500/10',     badge: 'bg-red-500/15 text-red-500 border-red-500/25',           label: 'Crítico' },
}

// ── FAB Button (sticky on right edge) ──
export function HealthCheckFAB() {
  const { stats } = useHealthChecks()
  const [open, setOpen] = useState(false)

  const hasBadge = stats.critical > 0 || stats.warn > 0
  const badgeColor = stats.critical > 0 ? 'bg-red-500' : 'bg-amber-500'

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40',
          'flex items-center gap-1.5 rounded-l-xl border border-r-0 px-2.5 py-3',
          'bg-card shadow-lg hover:shadow-xl transition-all duration-200',
          'hover:px-3.5 group',
        )}
        title="Conferências rápidas"
      >
        <Stethoscope className="h-4.5 w-4.5 text-primary group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-semibold text-muted-foreground hidden group-hover:inline transition-all">
          Check
        </span>
        {hasBadge && (
          <span className={cn(
            'absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white',
            badgeColor,
          )}>
            {stats.critical + stats.warn}
          </span>
        )}
      </button>

      {/* Panel */}
      <HealthCheckPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}

// ── Slide-in Panel ──
function HealthCheckPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { checks, stats, isLoading } = useHealthChecks()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterSev, setFilterSev] = useState<CheckSeverity | 'all'>('all')
  const navigate = useNavigate()

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const filtered = filterSev === 'all' ? checks : checks.filter(c => c.severity === filterSev)

  // Sort: critical first, then warn, then ok
  const sevOrder: Record<CheckSeverity, number> = { critical: 0, warn: 1, ok: 2 }
  const sorted = [...filtered].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  const handleNavigate = (route: string) => {
    navigate(route)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col',
          'bg-background border-l shadow-2xl',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Conferências</h2>
              <p className="text-[10px] text-muted-foreground">Diagnóstico rápido do projeto</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Score bar */}
        <div className="border-b px-5 py-3">
          <div className="flex items-center gap-3 mb-2.5">
            <ScorePill severity="ok" count={stats.ok} active={filterSev === 'ok'} onClick={() => setFilterSev(filterSev === 'ok' ? 'all' : 'ok')} />
            <ScorePill severity="warn" count={stats.warn} active={filterSev === 'warn'} onClick={() => setFilterSev(filterSev === 'warn' ? 'all' : 'warn')} />
            <ScorePill severity="critical" count={stats.critical} active={filterSev === 'critical'} onClick={() => setFilterSev(filterSev === 'critical' ? 'all' : 'critical')} />
            <div className="flex-1" />
            <span className="text-[10px] text-muted-foreground">
              {stats.totalItems > 0 ? `${stats.totalItems} item(ns) a resolver` : 'Tudo em dia ✨'}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            {stats.ok > 0 && (
              <div className="bg-emerald-500 transition-all" style={{ width: `${(stats.ok / stats.total) * 100}%` }} />
            )}
            {stats.warn > 0 && (
              <div className="bg-amber-500 transition-all" style={{ width: `${(stats.warn / stats.total) * 100}%` }} />
            )}
            {stats.critical > 0 && (
              <div className="bg-red-500 transition-all" style={{ width: `${(stats.critical / stats.total) * 100}%` }} />
            )}
          </div>
        </div>

        {/* Checks list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scroll-visible">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-sm font-medium">Nenhuma pendência!</p>
              <p className="text-xs text-muted-foreground mt-1">Todos os checks passaram com sucesso.</p>
            </div>
          ) : (
            sorted.map(check => (
              <CheckCard
                key={check.id}
                check={check}
                expanded={expandedId === check.id}
                onToggle={() => setExpandedId(expandedId === check.id ? null : check.id)}
                onNavigate={handleNavigate}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            {stats.total} verificações • Atualização em tempo real
          </span>
          <button
            onClick={() => setFilterSev('all')}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Mostrar todos
          </button>
        </div>
      </div>
    </>
  )
}

// ── Score Pill ──
function ScorePill({
  severity,
  count,
  active,
  onClick,
}: {
  severity: CheckSeverity
  count: number
  active: boolean
  onClick: () => void
}) {
  const cfg = SEV[severity]
  const Icon = cfg.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-all',
        active ? cfg.badge : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      <Icon className={cn('h-3 w-3', active ? '' : cfg.color)} />
      {count} {cfg.label}
    </button>
  )
}

// ── Check Card ──
function CheckCard({
  check,
  expanded,
  onToggle,
  onNavigate,
}: {
  check: HealthCheck
  expanded: boolean
  onToggle: () => void
  onNavigate: (route: string) => void
}) {
  const cfg = SEV[check.severity]
  const Icon = cfg.icon

  return (
    <div className={cn(
      'rounded-xl border transition-all',
      check.severity === 'ok'
        ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
        : check.severity === 'warn'
          ? 'border-amber-500/20 bg-amber-500/[0.03]'
          : 'border-red-500/20 bg-red-500/[0.03]',
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg shrink-0', cfg.bg)}>
          <Icon className={cn('h-4 w-4', cfg.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{check.title}</p>
          <p className="text-[10px] text-muted-foreground truncate">{check.summary}</p>
        </div>

        {check.items.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium shrink-0">
            {check.items.length}
          </span>
        )}

        {check.items.length > 0
          ? expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        }
      </button>

      {/* Expanded items */}
      {expanded && check.items.length > 0 && (
        <div className="border-t px-4 py-3 space-y-1.5">
          {check.items.map(item => (
            <div key={item.id} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{item.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
              </div>
            </div>
          ))}

          {/* Action button */}
          {check.route && (
            <button
              onClick={() => onNavigate(check.route!)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {check.routeLabel || 'Corrigir'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
