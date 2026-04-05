import { X } from 'lucide-react'

interface BulkActionBarProps {
  count: number
  onClear: () => void
  children: React.ReactNode
}

export default function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <span className="text-sm font-semibold text-primary">
          {count} selecionado{count > 1 ? 's' : ''}
        </span>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          {children}
        </div>
        <div className="h-5 w-px bg-border" />
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
      </div>
    </div>
  )
}

/** Styled action button for BulkActionBar */
export function BulkButton({
  icon: Icon, label, onClick, variant = 'default',
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}) {
  const base = 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors'
  const cls = variant === 'danger'
    ? `${base} text-red-500 hover:bg-red-500/10`
    : `${base} text-foreground hover:bg-accent`

  return (
    <button onClick={onClick} className={cls}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
