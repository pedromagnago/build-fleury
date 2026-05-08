import { useState, useMemo } from 'react'
import { Search, Box, CheckCircle2, Clock, AlertTriangle, Square, CheckSquare, Filter, ChevronDown, ChevronRight, Building2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { Parcela } from '@/hooks/useFinanceiro'

type FilterMode = 'all' | 'pagas' | 'pendentes'
type CategoriaFilter = 'todas' | 'pedido' | 'despesa' | 'avulsa'

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

function norm(s: string | null | undefined): string {
  return (s ?? '').toString().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function SystemColumn({
  parcelas, linkedParcelaIds, confirmedParcelaIds, filterMode, onFilterChange,
  selectedIds, onToggleSelect, activeParcelaId, onSelectParcela
}: SystemColumnProps) {
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState<CategoriaFilter>('todas')
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())
  const [todosColapsados, setTodosColapsados] = useState(false)

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

    if (categoria !== 'todas') {
      p = p.filter(parc => {
        if (categoria === 'pedido') return !!parc.pedido_id
        if (categoria === 'despesa') return !!parc.despesa_indireta_id
        if (categoria === 'avulsa') return !parc.pedido_id && !parc.despesa_indireta_id
        return true
      })
    }

    const q = norm(search)
    if (q) {
      // Multi-token AND, sem acento — casa "dione 13/04", "#42 P3", "1500".
      // Cobre descricao, item, fornecedor, etapa, dataBR (venc + pgto), pedido#, parcela#, valor.
      const tokens = q.split(/\s+/).filter(Boolean)
      p = p.filter(x => {
        const venc = fmtDate(x.data_vencimento)
        const vencDdMm = venc.length >= 5 ? venc.slice(0, 5) : ''
        const pgto = x.data_pagamento_real ? fmtDate(x.data_pagamento_real) : ''
        const pgtoDdMm = pgto.length >= 5 ? pgto.slice(0, 5) : ''
        const pedidoNum = (x as any).pedido_numero
        const pedidoTag = pedidoNum != null ? `#${pedidoNum}` : ''
        const parcelaTag = `P${x.numero_parcela}`
        const hay = norm([
          x.descricao,
          x.pedido_item,
          x.fornecedor_nome,
          (x as any).etapa_nome,
          (x as any).pedido_cond_pagamento,
          x.valor,
          venc, vencDdMm, x.data_vencimento,
          pgto, pgtoDdMm, x.data_pagamento_real,
          pedidoTag, parcelaTag,
        ].filter(Boolean).join(' '))
        return tokens.every(t => hay.includes(t))
      })
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
  }, [parcelas, search, filterMode, linkedParcelaIds, isFilteredByExtrato, confirmedParcelaIds, categoria])

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

  // Totalizadores de fluxo de caixa do que está visível e selecionado.
  // 'med-' = recebíveis (entrada); demais = pagáveis (saída).
  const cashTotals = useMemo(() => {
    const acc = {
      entrPend: 0, entrReal: 0, saiPend: 0, saiReal: 0,
      selCount: 0, selEntr: 0, selSai: 0,
    }
    for (const p of filteredParcelas) {
      const isPaid = p.status === 'paga' || !!p.data_pagamento_real
      const isReceivable = p.id.startsWith('med-')
      const v = isPaid ? Number(p.valor_pago || p.valor) : Number(p.valor)
      if (isReceivable) {
        if (isPaid) acc.entrReal += v
        else acc.entrPend += v
      } else {
        if (isPaid) acc.saiReal += v
        else acc.saiPend += v
      }
      if (selectedIds.has(p.id)) {
        acc.selCount++
        if (isReceivable) acc.selEntr += v
        else acc.selSai += v
      }
    }
    return acc
  }, [filteredParcelas, selectedIds])

  const entradasTot = cashTotals.entrPend + cashTotals.entrReal
  const saidasTot = cashTotals.saiPend + cashTotals.saiReal
  const saldoTot = entradasTot - saidasTot
  const selSaldo = cashTotals.selEntr - cashTotals.selSai

  // Agrupa por fornecedor; ordena parcelas por vencimento asc; grupos pelo
  // menor vencimento (mais próximo primeiro). No modo "filtrado por extrato"
  // mantém flat — já é foco em poucos itens.
  const gruposFornecedor = useMemo(() => {
    if (isFilteredByExtrato) return null
    const map = new Map<string, { fornecedor: string; parcelas: Parcela[]; saldoTotal: number; vencMin: number; idsValidos: string[] }>()
    for (const parc of filteredParcelas) {
      const forn = parc.fornecedor_nome ?? '— Sem fornecedor —'
      let g = map.get(forn)
      if (!g) {
        g = { fornecedor: forn, parcelas: [], saldoTotal: 0, vencMin: Number.POSITIVE_INFINITY, idsValidos: [] }
        map.set(forn, g)
      }
      g.parcelas.push(parc)
      const isPaid = parc.status === 'paga' || !!parc.data_pagamento_real
      const saldo = Number(parc.valor) - (isPaid ? Number(parc.valor_pago || parc.valor) : Number(parc.valor_pago || 0))
      g.saldoTotal += saldo > 0 ? saldo : 0
      const dt = new Date(parc.data_vencimento).getTime() || Number.POSITIVE_INFINITY
      if (dt < g.vencMin) g.vencMin = dt
      g.idsValidos.push(parc.id)
    }
    for (const g of map.values()) {
      g.parcelas.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.fornecedor.startsWith('—') && !b.fornecedor.startsWith('—')) return 1
      if (b.fornecedor.startsWith('—') && !a.fornecedor.startsWith('—')) return -1
      return a.vencMin - b.vencMin
    })
  }, [filteredParcelas, isFilteredByExtrato])

  const toggleGrupo = (forn: string) => {
    setColapsados(prev => {
      const next = new Set(prev)
      if (next.has(forn)) next.delete(forn)
      else next.add(forn)
      return next
    })
  }

  const toggleSelecionarGrupo = (ids: string[]) => {
    const todosSelecionados = ids.every(id => selectedIds.has(id))
    if (todosSelecionados) ids.forEach(id => { if (selectedIds.has(id)) onToggleSelect(id) })
    else ids.forEach(id => { if (!selectedIds.has(id)) onToggleSelect(id) })
  }

  const toggleColapsarTodos = () => {
    if (!gruposFornecedor) return
    if (todosColapsados) {
      setColapsados(new Set())
      setTodosColapsados(false)
    } else {
      setColapsados(new Set(gruposFornecedor.map(g => g.fornecedor)))
      setTodosColapsados(true)
    }
  }

  const renderParcela = (parc: Parcela) => {
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
          flex cursor-pointer items-start gap-2 p-3 transition-all duration-150 border-l-2
          ${isActive
            ? 'bg-primary/5 border-primary shadow-sm'
            : isLinked
              ? 'bg-amber-500/10 border-amber-500'
              : isSelected
                ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500'
                : 'border-transparent hover:bg-muted/30'}
        `}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(parc.id) }}
          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSelected
            ? <CheckSquare className="h-4 w-4 text-blue-600" />
            : <Square className="h-4 w-4" />
          }
        </button>

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
  }

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

            {/* Chips de categoria — mesmo padrão do painel de vínculo */}
            <div className="mt-2 flex flex-wrap gap-1">
              {([
                ['todas', 'Todas'],
                ['pedido', 'Pedido'],
                ['despesa', 'Despesa'],
                ['avulsa', 'Avulsa'],
              ] as Array<[CategoriaFilter, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoria(key)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors border ${
                    categoria === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Buscar (fornecedor, item, etapa, #pedido, data, valor)…"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Atalho de UI: colapsar todos os grupos de fornecedor */}
      {gruposFornecedor && gruposFornecedor.length > 1 && (
        <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1">
          <span className="text-[10px] text-muted-foreground">
            {gruposFornecedor.length} fornecedor{gruposFornecedor.length !== 1 ? 'es' : ''} · venc. ↑
          </span>
          <button
            onClick={toggleColapsarTodos}
            className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            {todosColapsados ? 'Expandir todos' : 'Colapsar todos'}
          </button>
        </div>
      )}

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
        ) : gruposFornecedor ? (
          <div>
            {gruposFornecedor.map((g) => {
              const isCollapsed = colapsados.has(g.fornecedor)
              const todosSelecionados = g.idsValidos.length > 0 && g.idsValidos.every(id => selectedIds.has(id))
              const algunsSelecionados = !todosSelecionados && g.idsValidos.some(id => selectedIds.has(id))
              const proxVenc = g.parcelas[0]?.data_vencimento

              return (
                <div key={g.fornecedor} className="border-b last:border-b-0">
                  <div
                    className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/40 backdrop-blur px-3 py-1.5 cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => toggleGrupo(g.fornecedor)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelecionarGrupo(g.idsValidos) }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title={todosSelecionados ? 'Desmarcar grupo' : 'Selecionar grupo'}
                    >
                      {todosSelecionados ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                        : algunsSelecionados ? <CheckSquare className="h-3.5 w-3.5 text-blue-600/40" />
                        : <Square className="h-3.5 w-3.5" />}
                    </button>
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate text-[11px] font-bold text-foreground" title={g.fornecedor}>
                      {g.fornecedor}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {g.parcelas.length} parc.
                    </span>
                    {proxVenc && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        · {fmtDate(proxVenc)}
                      </span>
                    )}
                    {g.saldoTotal > 0.01 && (
                      <span className="text-[10px] font-bold tabular-nums text-amber-600">
                        {fmt(g.saldoTotal)}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y">
                      {g.parcelas.map(renderParcela)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="divide-y">
            {filteredParcelas.map(renderParcela)}
          </div>
        )}
      </div>

      {/* Rodapé: totalizadores de fluxo de caixa */}
      {filteredParcelas.length > 0 && (
        <div className="border-t bg-muted/30 px-3 py-2 text-[10px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">
              Visível · {filteredParcelas.length}
            </span>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="flex items-center gap-0.5 text-emerald-600 font-semibold" title={`A receber pendente ${fmt(cashTotals.entrPend)} + recebido ${fmt(cashTotals.entrReal)}`}>
                <ArrowDownCircle className="h-3 w-3" />{fmt(entradasTot)}
              </span>
              <span className="flex items-center gap-0.5 text-red-600 font-semibold" title={`A pagar pendente ${fmt(cashTotals.saiPend)} + pago ${fmt(cashTotals.saiReal)}`}>
                <ArrowUpCircle className="h-3 w-3" />{fmt(saidasTot)}
              </span>
              <span className={`font-bold ${saldoTot >= 0 ? 'text-emerald-600' : 'text-red-600'}`} title="Saldo (entradas − saídas)">
                = {fmt(saldoTot)}
              </span>
            </div>
          </div>
          {(cashTotals.entrPend > 0 || cashTotals.saiPend > 0) && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Pendente</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span title="A receber pendente">↓ {fmt(cashTotals.entrPend)}</span>
                <span title="A pagar pendente">↑ {fmt(cashTotals.saiPend)}</span>
              </div>
            </div>
          )}
          {cashTotals.selCount > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-dashed pt-1">
              <span className="font-bold uppercase tracking-wider text-blue-600">
                Selecionado · {cashTotals.selCount}
              </span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                  <ArrowDownCircle className="h-3 w-3" />{fmt(cashTotals.selEntr)}
                </span>
                <span className="flex items-center gap-0.5 text-red-600 font-semibold">
                  <ArrowUpCircle className="h-3 w-3" />{fmt(cashTotals.selSai)}
                </span>
                <span className={`font-bold ${selSaldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  = {fmt(selSaldo)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
