import { useState, useMemo } from 'react'
import { Search, Info, CheckCircle2, AlertTriangle, Coins, Square, CheckSquare, ListChecks, Filter } from 'lucide-react'
import { ReconciliationResult } from '@/hooks/useConciliacao'

type BankFilter = 'pendentes' | 'conciliadas' | 'all'

interface BankColumnProps {
  movimentacoes: any[]
  reconcResult: ReconciliationResult | null
  activeMovId: string | null
  linkedMovId: string | null
  onSelect: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAllFiltered: (ids: string[]) => void
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function BankColumn({
  movimentacoes, reconcResult, activeMovId, linkedMovId, onSelect,
  selectedIds, onToggleSelect, onSelectAllFiltered
}: BankColumnProps) {
  const [search, setSearch] = useState('')
  const hasPendentes = movimentacoes.some(m => !m.conciliado)
  const [filter, setFilter] = useState<BankFilter>(hasPendentes ? 'pendentes' : 'all')

  const isFilteredByParcela = !!linkedMovId

  const filteredMovs = useMemo(() => {
    // Quando uma parcela está selecionada, mostra APENAS o extrato vinculado a ela
    if (isFilteredByParcela) {
      return movimentacoes.filter(m => m.id === linkedMovId)
    }

    let m = [...movimentacoes]

    if (filter === 'pendentes') {
      m = m.filter(mov => !mov.conciliado)
    } else if (filter === 'conciliadas') {
      m = m.filter(mov => mov.conciliado)
    }

    if (search.trim()) {
      const s = search.toLowerCase()
      m = m.filter(x =>
        (x.descricao?.toLowerCase().includes(s)) ||
        (x.memo_raw?.toLowerCase().includes(s)) ||
        (x.valor && String(x.valor).includes(s))
      )
    }

    m.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    return m
  }, [movimentacoes, search, filter, linkedMovId, isFilteredByParcela])

  const counts = useMemo(() => ({
    all: movimentacoes.length,
    pendentes: movimentacoes.filter(m => !m.conciliado).length,
    conciliadas: movimentacoes.filter(m => m.conciliado).length,
  }), [movimentacoes])

  const allFilteredSelected = filteredMovs.length > 0 && filteredMovs.every(m => selectedIds.has(m.id))

  return (
    <div className="flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm">
      <div className="border-b bg-muted/30 p-3">
        <h3 className="flex items-center gap-2 font-bold text-sm">
          Extrato Bancário
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            {counts.pendentes} a conciliar
          </span>
          {counts.conciliadas > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">
              {counts.conciliadas} ok
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Transações importadas do banco · Total: {counts.all}
        </p>

        {/* Banner quando filtrado por parcela selecionada */}
        {isFilteredByParcela ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-2 py-1.5">
            <Filter className="h-3 w-3 text-primary flex-shrink-0" />
            <span className="text-[10px] text-primary font-semibold flex-1">
              Filtrado pela parcela selecionada
            </span>
            <span className="text-[9px] text-primary/70">clique na parcela para limpar</span>
          </div>
        ) : (
          <>
            {/* Filter Tabs */}
            <div className="mt-2 flex gap-1 rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => setFilter('pendentes')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filter === 'pendentes' ? 'bg-amber-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pendentes ({counts.pendentes})
              </button>
              <button
                onClick={() => setFilter('conciliadas')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filter === 'conciliadas' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Conciliadas ({counts.conciliadas})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas ({counts.all})
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Buscar no extrato..."
                />
              </div>
              {/* Select all button */}
              <button
                onClick={() => {
                  if (allFilteredSelected) onSelectAllFiltered([])
                  else onSelectAllFiltered(filteredMovs.map(m => m.id))
                }}
                className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted transition-colors"
                title={allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              >
                <ListChecks className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredMovs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Coins className="mx-auto mb-2 h-8 w-8 opacity-20" />
            <p className="text-xs">
              {counts.all === 0
                ? 'Nenhum extrato importado ainda.'
                : `Nenhuma movimentação ${filter === 'pendentes' ? 'pendente' : filter === 'conciliadas' ? 'conciliada' : ''} encontrada.`
              }
            </p>
            {counts.all === 0 && (
              <p className="text-[10px] mt-1 text-muted-foreground/70">
                Importe um arquivo OFX ou JSON acima.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredMovs.map((mov) => {
              const match = reconcResult?.matches.find(m => (m.transaction as any)._movId === mov.id)
              const hasHighMatch = match && match.matchType !== 'none' && match.confidence >= 90
              const isActive = activeMovId === mov.id
              const isLinked = linkedMovId === mov.id
              const isCredit = mov.tipo !== 'saida'
              const isConciliado = mov.conciliado
              const isSelected = selectedIds.has(mov.id)

              return (
                <div
                  key={mov.id}
                  className={`
                    flex cursor-pointer items-start gap-2 p-3 transition-all hover:bg-muted/50 border-l-2
                    ${isActive
                      ? 'border-primary bg-primary/5'
                      : isLinked
                        ? 'border-primary bg-primary/5'
                        : isConciliado
                          ? 'border-emerald-500/30 opacity-70'
                          : isSelected
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                            : 'border-transparent'}
                  `}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(mov.id) }}
                    className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSelected
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : <Square className="h-4 w-4" />
                    }
                  </button>

                  {/* Content — clickable for detail */}
                  <div className="flex-1 min-w-0" onClick={() => onSelect(mov.id)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-medium">{fmtDate(mov.data)}</span>
                          {isConciliado && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1 py-0.5 rounded">
                              <CheckCircle2 className="h-2.5 w-2.5" /> OK
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs font-semibold leading-tight mt-0.5" title={mov.descricao}>
                          {mov.descricao || mov.memo_raw}
                        </p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className={`text-xs font-bold tabular-nums ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isCredit ? '+' : '-'}{fmt(mov.valor)}
                        </span>
                      </div>
                    </div>

                    {/* Match Status */}
                    {!isConciliado && match && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {hasHighMatch ? (
                          <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Sugestão Exata ({match.confidence}%)
                          </span>
                        ) : match.matchType !== 'none' ? (
                          <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> Sugestão ({match.confidence}%)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                            <Info className="h-3 w-3" /> Sem Match
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
