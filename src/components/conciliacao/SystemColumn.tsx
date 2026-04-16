import { useState, useMemo } from 'react'
import { Search, Box, CheckCircle2, Clock, AlertTriangle, Square, CheckSquare, Filter } from 'lucide-react'
import { Parcela } from '@/hooks/useFinanceiro'

type FilterMode = 'all' | 'pagas' | 'pendentes'

interface SystemColumnProps {
  parcelas: Parcela[]
  linkedParcelaIds: string[]
  confirmedParcelaIds: Set<string>
  filterMode: FilterMode
  onFilterChange: (mode: FilterMode) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  activeParcelaId: string | null
  onSelectParcela: (id: string) => void
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function SystemColumn({
  parcelas, linkedParcelaIds, confirmedParcelaIds, filterMode, onFilterChange,
  selectedIds, onToggleSelect, activeParcelaId, onSelectParcela
}: SystemColumnProps) {
  const [search, setSearch] = useState('')

  const isFilteredByExtrato = linkedParcelaIds.length > 0

  const filteredParcelas = useMemo(() => {
    // Quando um extrato está selecionado, mostra APENAS as parcelas vinculadas a ele
    if (isFilteredByExtrato) {
      return parcelas.filter(p => !p.deleted_at && linkedParcelaIds.includes(p.id))
    }

    let p = parcelas.filter(parc => !parc.deleted_at)

    if (filterMode === 'pagas') {
      // Pagas que ainda NÃO foram conciliadas (precisam de atenção)
      p = p.filter(parc =>
        (parc.status === 'paga' || !!parc.data_pagamento_real) &&
        !confirmedParcelaIds.has(parc.id)
      )
    } else if (filterMode === 'pendentes') {
      p = p.filter(parc => parc.status !== 'paga' && !parc.data_pagamento_real)
    }
    // 'all' mostra tudo, inclusive conciliadas

    if (search.trim()) {
      const s = search.toLowerCase()
      p = p.filter(x =>
        (x.descricao?.toLowerCase().includes(s)) ||
        (x.pedido_item?.toLowerCase().includes(s)) ||
        (x.valor && String(x.valor).includes(s))
      )
    }

    p.sort((a, b) => {
      if (a.data_pagamento_real && b.data_pagamento_real) {
        return b.data_pagamento_real.localeCompare(a.data_pagamento_real)
      }
      if (a.data_pagamento_real) return -1
      if (b.data_pagamento_real) return 1
      return a.data_vencimento.localeCompare(b.data_vencimento)
    })

    return p
  }, [parcelas, search, filterMode, linkedParcelaIds, isFilteredByExtrato, confirmedParcelaIds])

  const counts = useMemo(() => {
    const all = parcelas.filter(p => !p.deleted_at)
    return {
      all: all.length,
      pagas: all.filter(p =>
        (p.status === 'paga' || !!p.data_pagamento_real) && !confirmedParcelaIds.has(p.id)
      ).length,
      pendentes: all.filter(p => p.status !== 'paga' && !p.data_pagamento_real).length,
      conciliadas: confirmedParcelaIds.size,
    }
  }, [parcelas, confirmedParcelaIds])

  return (
    <div className="flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm">
      <div className="border-b bg-muted/30 p-3">
        <h3 className="flex items-center gap-2 font-bold text-sm">
          Parcelas do Sistema
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            {filteredParcelas.length} itens
          </span>
          {counts.conciliadas > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">
              {counts.conciliadas} conciliadas
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Pagamentos realizados e pendentes para conciliar com extrato.
        </p>

        {/* Banner quando filtrado por extrato selecionado */}
        {isFilteredByExtrato ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
            <Filter className="h-3 w-3 text-amber-600 flex-shrink-0" />
            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold flex-1">
              Filtrado pelo extrato selecionado · {filteredParcelas.length} vinculada{filteredParcelas.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[9px] text-amber-600/70">clique no extrato para limpar</span>
          </div>
        ) : (
          <>
            {/* Filter Tabs */}
            <div className="mt-2 flex gap-1 rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => onFilterChange('pagas')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filterMode === 'pagas' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CheckCircle2 className="inline h-3 w-3 mr-0.5 -mt-px" />
                A Conciliar ({counts.pagas})
              </button>
              <button
                onClick={() => onFilterChange('pendentes')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filterMode === 'pendentes' ? 'bg-amber-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />
                Pendentes ({counts.pendentes})
              </button>
              <button
                onClick={() => onFilterChange('all')}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  filterMode === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas ({counts.all})
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Buscar parcela..."
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredParcelas.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Box className="mx-auto mb-2 h-8 w-8 opacity-20" />
            <p className="text-xs">Nenhuma parcela encontrada com o filtro atual.</p>
            {filterMode === 'pagas' && counts.conciliadas > 0 && (
              <p className="text-[10px] mt-1 text-muted-foreground/70">
                {counts.conciliadas} parcela{counts.conciliadas !== 1 ? 's' : ''} já conciliada{counts.conciliadas !== 1 ? 's' : ''} · use "Todas" para ver
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredParcelas.map((parc) => {
              const isPaid = parc.status === 'paga' || !!parc.data_pagamento_real
              const isReceivable = parc.id.startsWith('med-')
              const isLinked = linkedParcelaIds.includes(parc.id)
              const isActive = activeParcelaId === parc.id
              const isConciliated = confirmedParcelaIds.has(parc.id)
              const isOverdue = !isPaid && parc.data_vencimento < new Date().toISOString().split('T')[0]!
              const isSelected = selectedIds.has(parc.id)

              return (
                <div
                  key={parc.id}
                  onClick={() => onSelectParcela(parc.id)}
                  className={`
                    flex cursor-pointer items-start gap-2 p-3 transition-all border-l-2
                    ${isActive
                      ? 'bg-primary/5 border-primary'
                      : isLinked
                        ? 'bg-amber-500/10 border-amber-500'
                        : isSelected
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500'
                          : 'border-transparent hover:bg-muted/30'}
                  `}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(parc.id) }}
                    className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSelected
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : <Square className="h-4 w-4" />
                    }
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isConciliated ? (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-blue-600">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Conciliada
                            </span>
                          ) : isPaid ? (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Pago
                            </span>
                          ) : isOverdue ? (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-red-500/10 text-red-600">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Vencida
                            </span>
                          ) : (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${isReceivable ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'}`}>
                              {isReceivable ? 'Receber' : 'A Pagar'}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {isPaid && parc.data_pagamento_real
                              ? `Pago ${fmtDate(parc.data_pagamento_real)}`
                              : `Venc. ${fmtDate(parc.data_vencimento)}`
                            }
                          </span>
                        </div>
                        <p className="truncate text-xs font-semibold leading-tight text-foreground" title={parc.descricao || ''}>
                          {parc.descricao || '—'}
                        </p>
                        {parc.pedido_item && (
                          <p className="truncate text-[10px] text-muted-foreground mt-0.5">{parc.pedido_item}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className={`text-xs font-bold tabular-nums ${isPaid ? 'text-emerald-600' : ''}`}>
                          {fmt(isPaid ? Number(parc.valor_pago || parc.valor) : Number(parc.valor))}
                        </span>
                        {isPaid && Number(parc.valor_pago) !== Number(parc.valor) && (
                          <span className="text-[9px] text-muted-foreground">
                            de {fmt(Number(parc.valor))}
                          </span>
                        )}
                      </div>
                    </div>
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
