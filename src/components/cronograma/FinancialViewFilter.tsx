export type FinancialViewMode = 'realizado' | 'planejado' | 'pedidos'

const modes: { key: FinancialViewMode; label: string; color: string; desc: string }[] = [
  { key: 'realizado', label: 'Realizado', color: 'emerald', desc: 'Dados confirmados' },
  { key: 'planejado', label: '+ Planejado', color: 'blue', desc: 'Inclui projeções' },
  { key: 'pedidos', label: '+ Pedidos', color: 'amber', desc: 'Inclui saídas firmes' },
]

interface Props {
  value: FinancialViewMode
  onChange: (mode: FinancialViewMode) => void
  size?: 'sm' | 'md'
}

export default function FinancialViewFilter({ value, onChange, size = 'sm' }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5">
      {modes.map(m => {
        const active = value === m.key
        const dotColor = m.color === 'emerald' ? 'bg-emerald-500' : m.color === 'blue' ? 'bg-blue-500' : 'bg-amber-500'
        const activeRing = m.color === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20'
          : m.color === 'blue'
          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/20'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20'
        return (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            title={m.desc}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
              size === 'sm' ? 'text-[10px]' : 'text-xs'
            } font-medium ${
              active ? activeRing : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? dotColor : 'bg-muted-foreground/30'}`} />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
