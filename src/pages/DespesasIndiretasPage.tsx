import { useState, useMemo } from 'react'
import { Plus, Search, Calendar, RefreshCcw, Building2, Edit2, Trash2, LayoutGrid, List, ChevronDown, ChevronRight, FileText, Eye, X, CheckSquare, Square, Tags } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useDespesasIndiretas, DespesaIndireta } from '@/hooks/useDespesasIndiretas'
import { DespesaIndiretaModal } from '@/components/despesas-indiretas/DespesaIndiretaModal'

function formatCurrency(v: number | string | null | undefined): string {
  if (v == null || isNaN(Number(v))) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

const tableHeader = 'text-[10px] font-semibold tracking-wider text-muted-foreground uppercase py-3 px-3 text-left border-b bg-muted/30'
const tableCell = 'px-3 py-2.5 align-middle text-sm border-b'
const INPUT = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'

type ViewMode = 'grouped' | 'flat'

export default function DespesasIndiretasPage() {
  const { despesas, isLoading, deleteDespesa, bulkUpdateFields, bulkDelete } = useDespesasIndiretas()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDespesa, setEditingDespesa] = useState<DespesaIndireta | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [filterCategoria, setFilterCategoria] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [detailDespesa, setDetailDespesa] = useState<DespesaIndireta | null>(null)

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchAction, setBatchAction] = useState<'categoria' | 'delete' | null>(null)
  const [batchCategoria, setBatchCategoria] = useState('')
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)

  const categorias = useMemo(() => {
    const cats = new Set(despesas.map(d => d.categoria))
    return Array.from(cats).sort()
  }, [despesas])

  const filteredDespesas = useMemo(() => {
    let result = despesas
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.descricao.toLowerCase().includes(q) ||
        d.categoria.toLowerCase().includes(q) ||
        d.fornecedor_nome?.toLowerCase().includes(q) ||
        d.observacoes?.toLowerCase().includes(q)
      )
    }
    if (filterCategoria) {
      result = result.filter(d => d.categoria === filterCategoria)
    }
    if (filterStatus === 'positivo') {
      result = result.filter(d => Number(d.valor_saldo) > 0)
    } else if (filterStatus === 'negativo') {
      result = result.filter(d => Number(d.valor_saldo) < 0)
    } else if (filterStatus === 'consumido') {
      result = result.filter(d => Number(d.valor_consumido) > 0)
    }
    return result
  }, [despesas, search, filterCategoria, filterStatus])

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredDespesas>()
    filteredDespesas.forEach(d => {
      const g = groups.get(d.categoria) || []
      g.push(d)
      groups.set(d.categoria, g)
    })
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDespesas])

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (cat: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const toggleRowExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDespesas.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDespesas.map(d => d.id)))
    }
  }

  const selectGroupItems = (items: DespesaIndireta[]) => {
    const ids = items.map(d => d.id)
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleEdit = (d: DespesaIndireta) => {
    setEditingDespesa(d)
    setModalOpen(true)
  }

  const handleDelete = async (d: DespesaIndireta) => {
    if (confirm(`Excluir "${d.descricao}"?`)) {
      await deleteDespesa(d.id)
    }
  }

  // Batch handlers
  const handleBatchCategoria = async () => {
    if (!batchCategoria.trim()) return
    setIsBatchProcessing(true)
    try {
      await bulkUpdateFields(Array.from(selectedIds), { categoria: batchCategoria.trim() })
      setSelectedIds(new Set())
      setBatchAction(null)
      setBatchCategoria('')
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const handleBatchDelete = async () => {
    setIsBatchProcessing(true)
    try {
      await bulkDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
      setBatchAction(null)
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const hasActiveFilters = filterCategoria || filterStatus
  const hasSelection = selectedIds.size > 0

  // KPIs
  const totalOrcado = filteredDespesas.reduce((s, d) => s + Number(d.valor_orcado), 0)
  const totalConsumido = filteredDespesas.reduce((s, d) => s + Number(d.valor_consumido), 0)
  const saldo = totalOrcado - totalConsumido
  const categoriasCount = new Set(filteredDespesas.map(d => d.categoria)).size
  const recorrentes = filteredDespesas.filter(d => d.recorrente).length
  const comFornecedor = filteredDespesas.filter(d => d.fornecedor_nome).length

  // Selection KPIs
  const selectedDespesas = filteredDespesas.filter(d => selectedIds.has(d.id))
  const selOrcado = selectedDespesas.reduce((s, d) => s + Number(d.valor_orcado), 0)
  const selConsumido = selectedDespesas.reduce((s, d) => s + Number(d.valor_consumido), 0)

  // Checkbox component
  const Checkbox = ({ checked, onChange, className = '' }: { checked: boolean; onChange: () => void; className?: string }) => (
    <button onClick={(e) => { e.stopPropagation(); onChange() }} className={`shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground ${className}`}>
      {checked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
    </button>
  )

  // Row renderer
  const renderRow = (d: DespesaIndireta, showCategoria = false) => {
    const isExpanded = expandedRows.has(d.id)
    const isSelected = selectedIds.has(d.id)
    const saldoRow = Number(d.valor_saldo)
    return (
      <tr key={d.id} className={`hover:bg-muted/10 transition-colors group ${isSelected ? 'bg-primary/5' : ''}`}>
        <td className={`${tableCell} w-10`}>
          <Checkbox checked={isSelected} onChange={() => toggleSelect(d.id)} />
        </td>
        {showCategoria && (
          <td className={`${tableCell} text-xs`}>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {d.categoria}
            </span>
          </td>
        )}
        <td className={tableCell}>
          <div className="flex items-start gap-2">
            <button onClick={() => toggleRowExpand(d.id)} className="mt-0.5 shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate max-w-[280px]">{d.descricao}</div>
              {d.fornecedor_nome && <div className="text-xs text-muted-foreground mt-0.5">{d.fornecedor_nome}</div>}
              {isExpanded && d.observacoes && (
                <div className="mt-2 rounded-md border bg-muted/20 p-2.5 text-xs text-muted-foreground max-w-sm">
                  <p className="font-semibold text-foreground text-[10px] uppercase mb-1">Observações</p>
                  {d.observacoes.split(' | ').map((part, i) => (
                    <div key={i} className="py-0.5">{part}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className={tableCell}>
          <div className="flex flex-col gap-1">
            {d.recorrente ? (
              <span className="inline-flex w-fit items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-300">
                <RefreshCcw className="h-3 w-3" />
                {d.frequencia}
              </span>
            ) : (
              <span className="inline-flex w-fit items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400">
                Pontual
              </span>
            )}
            {d.data_inicio && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(parseISO(d.data_inicio), 'dd/MM/yy', { locale: ptBR })}
              </div>
            )}
          </div>
        </td>
        <td className={`${tableCell} w-[220px]`}>
          {d.observacoes ? (
             <div className="max-w-[220px] max-h-16 overflow-y-auto text-xs text-muted-foreground pr-1 shrink-scrollbar">
                {d.observacoes.split(' | ').map((part, i) => (
                  <div key={i} className="py-0.5 leading-tight truncate" title={part}>{part}</div>
                ))}
             </div>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className={`${tableCell} tabular-nums font-medium text-right`}>{formatCurrency(d.valor_orcado)}</td>
        <td className={`${tableCell} tabular-nums text-right`}>{formatCurrency(d.valor_consumido)}</td>
        <td className={`${tableCell} tabular-nums font-medium text-right ${saldoRow < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(d.valor_saldo)}</td>
        <td className={tableCell}>
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {d.observacoes && (
              <button onClick={() => setDetailDespesa(d)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Ver detalhes">
                <Eye className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => handleEdit(d)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Editar">
              <Edit2 className="h-4 w-4" />
            </button>
            <button onClick={() => handleDelete(d)} className="p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-500" title="Excluir">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 lg:px-8 bg-background/50 backdrop-blur-sm z-10 sticky top-0">
        <h1 className="text-lg font-semibold tracking-tight">Custos Indiretos</h1>
        <button
          onClick={() => { setEditingDespesa(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Despesa</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* ─── BATCH ACTIONS TOOLBAR ─── */}
          {hasSelection && (
            <div className="sticky top-0 z-20 flex items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{selectedIds.size} selecionados</span>
                <span className="text-xs text-muted-foreground">
                  (Orçado: {formatCurrency(selOrcado)} · Consumido: {formatCurrency(selConsumido)})
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setBatchAction('categoria')}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Tags className="h-3.5 w-3.5" /> Alterar Categoria
                </button>
                <button
                  onClick={() => setBatchAction('delete')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                  title="Limpar seleção"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Toolbar: Search + Filters + View */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por descrição, categoria, fornecedor ou observação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-input pl-9 pr-4 text-sm bg-background shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>

            <select
              value={filterCategoria}
              onChange={e => setFilterCategoria(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Todas categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Todos status</option>
              <option value="positivo">Saldo positivo</option>
              <option value="negativo">Saldo negativo</option>
              <option value="consumido">Com consumo</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={() => { setFilterCategoria(''); setFilterStatus('') }}
                className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}

            <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
              <button
                onClick={() => setViewMode('grouped')}
                className={`rounded p-1.5 text-xs transition-colors ${viewMode === 'grouped' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="Agrupado por categoria"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('flat')}
                className={`rounded p-1.5 text-xs transition-colors ${viewMode === 'flat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="Lista plana"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* KPI Summary */}
          {filteredDespesas.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
                <p className="mt-1 text-lg font-bold">{filteredDespesas.length}</p>
                <p className="text-[10px] text-muted-foreground">{categoriasCount} categorias</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orçado Total</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(totalOrcado)}</p>
              </div>
              <div className="rounded-xl border bg-amber-50/50 dark:bg-amber-950/10 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Consumido</p>
                <p className="mt-1 text-lg font-bold text-amber-700">{formatCurrency(totalConsumido)}</p>
                <p className="text-[10px] text-muted-foreground">{totalOrcado > 0 ? Math.round((totalConsumido / totalOrcado) * 100) : 0}% do orçado</p>
              </div>
              <div className={`rounded-xl border p-3 ${saldo >= 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : 'bg-red-50/50 dark:bg-red-950/10'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Saldo</p>
                <p className={`mt-1 text-lg font-bold ${saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(saldo)}</p>
              </div>
              <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/10 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Recorrentes</p>
                <p className="mt-1 text-lg font-bold text-blue-700">{recorrentes}</p>
                <p className="text-[10px] text-muted-foreground">{filteredDespesas.length - recorrentes} pontuais</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">C/ Fornecedor</p>
                <p className="mt-1 text-lg font-bold">{comFornecedor}</p>
                <p className="text-[10px] text-muted-foreground">{filteredDespesas.length - comFornecedor} sem vínculo</p>
              </div>
            </div>
          )}

          {/* Table content */}
          {!isLoading && filteredDespesas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center text-muted-foreground bg-muted/10">
              <Building2 className="mb-4 h-8 w-8 opacity-20" />
              <p className="mb-1 text-sm font-medium text-foreground">Nenhuma despesa encontrada</p>
              <p className="text-xs">
                {hasActiveFilters ? 'Tente ajustar os filtros.' : 'Clique no botão acima para adicionar um custo indireto.'}
              </p>
            </div>
          ) : viewMode === 'flat' ? (
            /* ─── FLAT VIEW ─── */
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="tbl-bf w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className={`${tableHeader} w-10`}>
                        <Checkbox
                          checked={filteredDespesas.length > 0 && selectedIds.size === filteredDespesas.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className={tableHeader}>Categoria</th>
                      <th className={tableHeader}>Descrição</th>
                      <th className={tableHeader}>Período</th>
                      <th className={tableHeader}>Observações</th>
                      <th className={`${tableHeader} text-right`}>Orçado</th>
                      <th className={`${tableHeader} text-right`}>Consumido</th>
                      <th className={`${tableHeader} text-right`}>Saldo</th>
                      <th className={`${tableHeader} w-24`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDespesas.map(d => renderRow(d, true))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ─── GROUPED VIEW ─── */
            <div className="space-y-4">
              {grouped.map(([categoria, items]) => {
                const orcadoGrp = items.reduce((s, i) => s + Number(i.valor_orcado), 0)
                const consumGrp = items.reduce((s, i) => s + Number(i.valor_consumido), 0)
                const saldoGrp = orcadoGrp - consumGrp
                const isCollapsed = collapsedGroups.has(categoria)
                const allGroupSelected = items.every(d => selectedIds.has(d.id))

                return (
                  <div key={categoria} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Checkbox checked={allGroupSelected} onChange={() => selectGroupItems(items)} />
                        <button onClick={() => toggleGroup(categoria)} className="flex items-center gap-2">
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <span className="w-2 h-2 rounded-full bg-primary/60"></span>
                          {categoria}
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ml-1">
                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                          </span>
                        </button>
                      </h3>
                      <div className="flex gap-6 text-xs" onClick={() => toggleGroup(categoria)}>
                        <span className="text-muted-foreground">Orçado: <span className="font-medium text-foreground">{formatCurrency(orcadoGrp)}</span></span>
                        <span className="text-muted-foreground">Consumido: <span className="font-medium text-foreground">{formatCurrency(consumGrp)}</span></span>
                        <span className={`font-medium ${saldoGrp < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          Saldo: {formatCurrency(saldoGrp)}
                        </span>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="tbl-bf w-full text-left border-collapse">
                          <thead>
                            <tr>
                              <th className={`${tableHeader} w-10`}>
                                <Checkbox checked={allGroupSelected} onChange={() => selectGroupItems(items)} />
                              </th>
                              <th className={tableHeader}>Descrição</th>
                              <th className={tableHeader}>Período</th>
                              <th className={tableHeader}>Observações</th>
                              <th className={`${tableHeader} text-right`}>Orçado</th>
                              <th className={`${tableHeader} text-right`}>Consumido</th>
                              <th className={`${tableHeader} text-right`}>Saldo</th>
                              <th className={`${tableHeader} w-24`}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(d => renderRow(d, false))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── BATCH ACTION DIALOGS ─── */}
      {batchAction === 'categoria' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Tags className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Alterar Categoria em Lote</h3>
                <p className="text-xs text-muted-foreground">{selectedIds.size} itens selecionados</p>
              </div>
            </div>
            <div className="mb-5 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nova Categoria</label>
                <input
                  type="text"
                  list="batch-cat-list"
                  autoFocus
                  value={batchCategoria}
                  onChange={e => setBatchCategoria(e.target.value)}
                  className={INPUT}
                  placeholder="Ex: Capital de Giro"
                />
                <datalist id="batch-cat-list">
                  {categorias.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Itens que serão alterados:</p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {selectedDespesas.map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span className="truncate max-w-[250px]">{d.descricao}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{d.categoria}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setBatchAction(null); setBatchCategoria('') }}
                disabled={isBatchProcessing}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleBatchCategoria}
                disabled={isBatchProcessing || !batchCategoria.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isBatchProcessing ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Atualizando...</>
                ) : (
                  <><Tags className="h-4 w-4" /> Aplicar a {selectedIds.size} itens</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchAction === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Excluir em Lote</h3>
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-destructive mb-1">{selectedIds.size} itens serão excluídos:</p>
              <div className="max-h-40 overflow-y-auto space-y-0.5 mt-2">
                {selectedDespesas.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-0.5">
                    <span className="truncate max-w-[250px]">{d.descricao}</span>
                    <span className="text-[10px] shrink-0 ml-2 tabular-nums">{formatCurrency(d.valor_orcado)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-medium text-destructive">
                Total orçado: {formatCurrency(selOrcado)}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBatchAction(null)}
                disabled={isBatchProcessing}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={isBatchProcessing}
                className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isBatchProcessing ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Excluindo...</>
                ) : (
                  <><Trash2 className="h-4 w-4" /> Confirmar Exclusão</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detailDespesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDetailDespesa(null)} />
          <div className="relative w-full max-w-lg h-full bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">Detalhes do Custo Indireto</h2>
                <p className="text-xs text-muted-foreground">{detailDespesa.categoria}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { handleEdit(detailDespesa); setDetailDespesa(null) }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => setDetailDespesa(null)} className="rounded-md p-2 hover:bg-muted text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              <div>
                <h3 className="text-lg font-semibold">{detailDespesa.descricao}</h3>
                {detailDespesa.fornecedor_nome && (
                  <p className="text-sm text-muted-foreground mt-0.5">{detailDespesa.fornecedor_nome}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-muted/10 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Orçado</p>
                  <p className="mt-1 text-base font-bold">{formatCurrency(detailDespesa.valor_orcado)}</p>
                </div>
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-amber-600">Consumido</p>
                  <p className="mt-1 text-base font-bold text-amber-700">{formatCurrency(detailDespesa.valor_consumido)}</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${Number(detailDespesa.valor_saldo) < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : 'bg-emerald-50/50 dark:bg-emerald-950/10'}`}>
                  <p className={`text-[10px] font-semibold uppercase ${Number(detailDespesa.valor_saldo) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>Saldo</p>
                  <p className={`mt-1 text-base font-bold ${Number(detailDespesa.valor_saldo) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(detailDespesa.valor_saldo)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">
                    {detailDespesa.recorrente ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <RefreshCcw className="h-3 w-3" /> {detailDespesa.frequencia}
                      </span>
                    ) : 'Pontual'}
                  </span>
                </div>
                {detailDespesa.data_inicio && (
                  <div className="flex items-center justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Período</span>
                    <span className="font-medium flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(parseISO(detailDespesa.data_inicio), 'dd/MMM/yyyy', { locale: ptBR })}
                      {detailDespesa.data_fim && ` até ${format(parseISO(detailDespesa.data_fim), 'dd/MMM/yyyy', { locale: ptBR })}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span className="font-medium">{new Date(detailDespesa.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              {detailDespesa.observacoes && (
                <div className="rounded-lg border bg-muted/10 p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Observações / Dados da Importação
                  </h4>
                  <div className="space-y-2">
                    {detailDespesa.observacoes.split(' | ').map((part, i) => {
                      const [key, ...valParts] = part.split(': ')
                      const val = valParts.join(': ')
                      if (val) {
                        return (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground whitespace-nowrap font-medium text-xs min-w-[70px]">{key}:</span>
                            <span className="text-foreground">{val}</span>
                          </div>
                        )
                      }
                      return <p key={i} className="text-sm text-foreground">{part}</p>
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <DespesaIndiretaModal
          onClose={() => setModalOpen(false)}
          initialData={editingDespesa}
        />
      )}
    </div>
  )
}
