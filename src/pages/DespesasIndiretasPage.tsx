/**
 * Build Fleury — Gestão de Custos Indiretos
 *
 * Despesas recorrentes e pontuais que compõem os custos indiretos do projeto.
 * Tabs: Todos | Recorrentes | Pontuais | Por Categoria
 */
import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Building2, Plus, Search, Calendar, RefreshCcw,
  ChevronDown, ChevronRight, FileText, Eye,
  X, Tags, Trash2, Pencil, AlertTriangle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useDespesasIndiretas, DespesaIndireta } from '@/hooks/useDespesasIndiretas'
import { DespesaIndiretaModal } from '@/components/despesas-indiretas/DespesaIndiretaModal'
import { useParcelas } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { useSelection } from '@/hooks/useSelection'
import BulkActionBar from '@/components/BulkActionBar'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'todos' | 'recorrentes' | 'pontuais' | 'por_categoria'
type StatusFilter = 'todos' | 'positivo' | 'negativo' | 'consumido' | 'sem_parcela' | 'ultrapassado'

const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DespesasIndiretasPage() {
  const { despesas, isLoading, deleteDespesa, bulkUpdateFields, bulkDelete } = useDespesasIndiretas()
  const { data: parcelas = [] } = useParcelas()

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('todos')

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filterCategoria, setFilterCategoria] = useState('')

  // ── Modal / Drawer ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDespesa, setEditingDespesa] = useState<DespesaIndireta | null>(null)
  const [detailDespesa, setDetailDespesa] = useState<DespesaIndireta | null>(null)

  // ── Group collapse ───────────────────────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // ── Batch state ──────────────────────────────────────────────────────────────
  const [batchAction, setBatchAction] = useState<'categoria' | 'delete' | null>(null)
  const [batchCategoria, setBatchCategoria] = useState('')
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)

  // ── Selection ────────────────────────────────────────────────────────────────
  const selection = useSelection()

  // ── Pago por despesa (valor_pago real das parcelas) ──────────────────────────
  const pagoPorDespesa = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.despesa_indireta_id) continue
      map.set(p.despesa_indireta_id, (map.get(p.despesa_indireta_id) ?? 0) + Number(p.valor_pago || 0))
    }
    return map
  }, [parcelas])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const categorias = useMemo(() => {
    const cats = new Set(despesas.map(d => d.categoria))
    return Array.from(cats).sort()
  }, [despesas])

  const filteredDespesas = useMemo(() => {
    let result = despesas

    // Tab filter
    if (tab === 'recorrentes') result = result.filter(d => d.recorrente === true)
    else if (tab === 'pontuais') result = result.filter(d => d.recorrente === false)
    // 'por_categoria' uses all filtered results (same as 'todos')

    // Text search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.descricao.toLowerCase().includes(q) ||
        d.categoria.toLowerCase().includes(q) ||
        d.fornecedor_nome?.toLowerCase().includes(q) ||
        d.observacoes?.toLowerCase().includes(q),
      )
    }

    // Advanced: categoria
    if (filterCategoria) result = result.filter(d => d.categoria === filterCategoria)

    // Quick status filter
    if (statusFilter === 'positivo') result = result.filter(d => Number(d.valor_saldo) > 0)
    else if (statusFilter === 'negativo') result = result.filter(d => Number(d.valor_saldo) < 0)
    else if (statusFilter === 'consumido') result = result.filter(d => Number(d.valor_consumido) > 0)
    else if (statusFilter === 'sem_parcela') result = result.filter(d => !parcelas.some(p => p.despesa_indireta_id === d.id))
    else if (statusFilter === 'ultrapassado') result = result.filter(d => (pagoPorDespesa.get(d.id) ?? 0) > Number(d.valor_orcado) + 0.5)

    return result
  }, [despesas, parcelas, tab, search, filterCategoria, statusFilter])

  const grouped = useMemo(() => {
    const groups = new Map<string, DespesaIndireta[]>()
    filteredDespesas.forEach(d => {
      const g = groups.get(d.categoria) ?? []
      g.push(d)
      groups.set(d.categoria, g)
    })
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredDespesas])

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalOrcado = filteredDespesas.reduce((s, d) => s + Number(d.valor_orcado), 0)
  const totalConsumido = filteredDespesas.reduce((s, d) => s + Number(d.valor_consumido), 0)
  const totalPago = filteredDespesas.reduce((s, d) => s + (pagoPorDespesa.get(d.id) ?? 0), 0)
  const totalUltrapassado = filteredDespesas.reduce((s, d) => {
    const pago = pagoPorDespesa.get(d.id) ?? 0
    return s + Math.max(0, pago - Number(d.valor_orcado))
  }, 0)
  const saldo = totalOrcado - totalConsumido
  const categoriasCount = new Set(filteredDespesas.map(d => d.categoria)).size
  const recorrentesCount = filteredDespesas.filter(d => d.recorrente).length
  const pontuaisCount = filteredDespesas.length - recorrentesCount
  const pctConsumido = totalOrcado > 0 ? Math.round((totalConsumido / totalOrcado) * 100) : 0

  // ── Selection KPIs ───────────────────────────────────────────────────────────
  const selectedDespesas = filteredDespesas.filter(d => selection.selected.has(d.id))
  const selOrcado = selectedDespesas.reduce((s, d) => s + Number(d.valor_orcado), 0)
  const selConsumido = selectedDespesas.reduce((s, d) => s + Number(d.valor_consumido), 0)

  // ── Advanced filter count ─────────────────────────────────────────────────────
  const advancedActiveCount = [filterCategoria].filter(Boolean).length

  const clearAdvanced = () => { setFilterCategoria('') }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const toggleGroup = (cat: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
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

  const handleBatchCategoria = async () => {
    if (!batchCategoria.trim()) return
    setIsBatchProcessing(true)
    try {
      await bulkUpdateFields(Array.from(selection.selected), { categoria: batchCategoria.trim() })
      selection.clear()
      setBatchAction(null)
      setBatchCategoria('')
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const handleBatchDelete = async () => {
    setIsBatchProcessing(true)
    try {
      await bulkDelete(Array.from(selection.selected))
      selection.clear()
      setBatchAction(null)
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'todos', label: 'Todos', count: despesas.length },
    { key: 'recorrentes', label: 'Recorrentes', count: despesas.filter(d => d.recorrente).length },
    { key: 'pontuais', label: 'Pontuais', count: despesas.filter(d => !d.recorrente).length },
    { key: 'por_categoria', label: 'Por Categoria' },
  ]

  return (
    <div>
      <PageHeader
        title="Custos Indiretos"
        description="Despesas recorrentes e pontuais do projeto"
        icon={Building2}
      >
        <button
          onClick={() => { setEditingDespesa(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Nova Despesa
        </button>
      </PageHeader>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Itens</p>
          <p className="mt-1 text-lg font-bold">{filteredDespesas.length}</p>
          <p className="text-[10px] text-muted-foreground">{categoriasCount} categorias</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Orçado Total</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatCurrency(totalOrcado)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Consumido</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">{formatCurrency(totalConsumido)}</p>
          <p className="text-[10px] text-muted-foreground">{pctConsumido}% do orçado</p>
        </div>
        <div className={`rounded-xl border p-3 ${saldo >= 0 ? 'bg-card' : 'bg-card'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Saldo</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(saldo)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Recorrentes</p>
          <p className="mt-1 text-lg font-bold text-blue-700">{recorrentesCount}</p>
          <p className="text-[10px] text-muted-foreground">{pontuaisCount} pontuais</p>
        </div>
        <div className={`rounded-xl border p-3 col-span-2 md:col-span-1 ${totalUltrapassado > 0.5 ? 'border-red-400/40 bg-red-500/5' : 'bg-card'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${totalUltrapassado > 0.5 ? 'text-red-600' : 'text-muted-foreground'}`}>Pago no banco</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${totalUltrapassado > 0.5 ? 'text-red-700' : ''}`}>{formatCurrency(totalPago)}</p>
          {totalUltrapassado > 0.5 && (
            <p className="text-[10px] text-red-600 font-semibold">+{formatCurrency(totalUltrapassado)} acima do orçado</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[9px] font-bold ${
                tab === t.key ? 'bg-primary-foreground/20' : 'bg-muted'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar descrição, categoria, fornecedor..."
            className="w-full rounded-lg border bg-background pl-10 pr-3 py-2 text-sm"
          />
        </div>

        {/* Quick status pills */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {([
            ['todos', 'Todos'],
            ['positivo', 'Positivo'],
            ['negativo', 'Negativo'],
            ['consumido', 'Consumido'],
            ['sem_parcela', '⚠ Sem Parcela'],
            ['ultrapassado', '🔴 Ultrapassado'],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                statusFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              } ${k === 'negativo' && statusFilter === k ? 'text-red-600' : ''} ${k === 'positivo' && statusFilter === k ? 'text-emerald-600' : ''} ${k === 'sem_parcela' && statusFilter === k ? 'text-amber-600' : ''}`}
            >{label}</button>
          ))}
        </div>

        {/* ml-auto actions */}
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
              showAdvanced || advancedActiveCount > 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Filtros avançados
            {advancedActiveCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {advancedActiveCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold">Filtros avançados</span>
            {advancedActiveCount > 0 && (
              <button onClick={clearAdvanced}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-3 w-3" />Limpar filtros ({advancedActiveCount})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <label className={LABEL}>Categoria</label>
              <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className={INPUT}>
                <option value="">Todas</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {advancedActiveCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {filterCategoria && (
                <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  Categoria: {filterCategoria}
                  <button type="button" onClick={() => setFilterCategoria('')} className="rounded-full hover:bg-primary/20 p-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredDespesas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center text-muted-foreground bg-muted/10">
          <Building2 className="mb-4 h-8 w-8 opacity-20" />
          <p className="mb-1 text-sm font-medium text-foreground">Nenhuma despesa encontrada</p>
          <p className="text-xs">
            {search || filterCategoria || statusFilter !== 'todos'
              ? 'Ajuste os filtros para ver mais itens.'
              : 'Clique em "Nova Despesa" para adicionar um custo indireto.'}
          </p>
        </div>
      ) : tab === 'por_categoria' ? (
        /* ─── POR CATEGORIA TAB ─── */
        <div className="space-y-3">
          {grouped.map(([categoria, items]) => {
            const orcadoGrp = items.reduce((s, i) => s + Number(i.valor_orcado), 0)
            const consumGrp = items.reduce((s, i) => s + Number(i.valor_consumido), 0)
            const saldoGrp = orcadoGrp - consumGrp
            const isCollapsed = collapsedGroups.has(categoria)

            return (
              <div key={categoria} className="rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(categoria)}
                  className="w-full flex items-center justify-between border-b bg-muted/30 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-semibold">{categoria}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {items.length} {items.length === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  <div className="flex gap-6 text-xs text-right" onClick={e => e.stopPropagation()}>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">Orçado</div>
                      <div className="font-bold tabular-nums">{formatCurrency(orcadoGrp)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">Consumido</div>
                      <div className="font-semibold tabular-nums text-amber-600">{formatCurrency(consumGrp)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">Saldo</div>
                      <div className={`font-semibold tabular-nums ${saldoGrp < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(saldoGrp)}</div>
                    </div>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-auto">
                    <table className="tbl-bf w-full text-xs">
                      <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
                        <tr>
                          <th className="px-2 py-2.5 text-center">
                            <input type="checkbox"
                              checked={items.length > 0 && items.every(d => selection.isSelected(d.id))}
                              onChange={() => {
                                const ids = items.map(d => d.id)
                                const allSel = ids.every(id => selection.isSelected(id))
                                if (allSel) ids.forEach(id => selection.toggle(id))
                                else ids.filter(id => !selection.isSelected(id)).forEach(id => selection.toggle(id))
                              }}
                              className="h-3.5 w-3.5 rounded accent-primary"
                            />
                          </th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                          <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Período</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orçado</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Consumido</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-red-500">Pago (banco)</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map(d => (
                          <DespesaRow
                            key={d.id}
                            d={d}
                            totalPago={pagoPorDespesa.get(d.id) ?? 0}
                            isSelected={selection.isSelected(d.id)}
                            onToggle={() => selection.toggle(d.id)}
                            hasParcela={parcelas.some(p => p.despesa_indireta_id === d.id)}
                            onDetail={() => setDetailDespesa(d)}
                            onEdit={() => handleEdit(d)}
                            onDelete={() => handleDelete(d)}
                          />
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 font-bold">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right text-xs">
                            SUBTOTAL ({items.length} itens)
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(orcadoGrp)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-600">{formatCurrency(consumGrp)}</td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums ${saldoGrp < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(saldoGrp)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ─── FLAT VIEW (todos / recorrentes / pontuais) ─── */
        <div className="overflow-auto rounded-xl border bg-card max-h-[calc(100vh-380px)]">
          <table className="tbl-bf w-full text-xs">
            <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <th className="px-2 py-2.5 text-center">
                  <input type="checkbox"
                    checked={selection.count === filteredDespesas.length && filteredDespesas.length > 0}
                    onChange={() => selection.toggleAll(filteredDespesas.map(d => d.id))}
                    className="h-3.5 w-3.5 rounded accent-primary"
                  />
                </th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categoria</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Período</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orçado</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Consumido</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-red-500">Pago (banco)</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDespesas.map(d => (
                <DespesaRow
                  key={d.id}
                  d={d}
                  showCategoria
                  totalPago={pagoPorDespesa.get(d.id) ?? 0}
                  isSelected={selection.isSelected(d.id)}
                  onToggle={() => selection.toggle(d.id)}
                  hasParcela={parcelas.some(p => p.despesa_indireta_id === d.id)}
                  onDetail={() => setDetailDespesa(d)}
                  onEdit={() => handleEdit(d)}
                  onDelete={() => handleDelete(d)}
                />
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-bold">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-xs">
                  TOTAL FILTRADO ({filteredDespesas.length} itens)
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatCurrency(totalOrcado)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-600">
                  {formatCurrency(totalConsumido)}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${totalUltrapassado > 0.5 ? 'text-red-600' : ''}`}>
                  {formatCurrency(totalPago)}
                  {totalUltrapassado > 0.5 && (
                    <div className="text-[9px] text-red-500">+{formatCurrency(totalUltrapassado)}</div>
                  )}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${saldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(saldo)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* BulkActionBar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={
          selection.count > 0
            ? [
                { label: 'Orçado', value: formatCurrency(selOrcado), tone: 'primary' as const },
                { label: 'Consumido', value: formatCurrency(selConsumido), tone: 'amber' as const },
              ]
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBatchAction('categoria')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Tags className="h-3.5 w-3.5" /> Alterar Categoria
          </button>
          <button
            onClick={() => setBatchAction('delete')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        </div>
      </BulkActionBar>

      {/* ─── Batch: Alterar Categoria ─── */}
      {batchAction === 'categoria' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Tags className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Alterar Categoria em Lote</h3>
                <p className="text-xs text-muted-foreground">{selection.count} itens selecionados</p>
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
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Atualizando...</>
                ) : (
                  <><Tags className="h-4 w-4" />Aplicar a {selection.count} itens</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Batch: Excluir ─── */}
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
              <p className="font-medium text-destructive mb-1">{selection.count} itens serão excluídos:</p>
              <div className="max-h-40 overflow-y-auto space-y-0.5 mt-2">
                {selectedDespesas.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-0.5">
                    <span className="truncate max-w-[250px]">{d.descricao}</span>
                    <span className="text-[10px] shrink-0 ml-2 tabular-nums">{formatCurrency(d.valor_orcado)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-medium text-destructive">Total orçado: {formatCurrency(selOrcado)}</p>
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
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Excluindo...</>
                ) : (
                  <><Trash2 className="h-4 w-4" />Confirmar Exclusão</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail Drawer ─── */}
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
                  <Pencil className="h-3.5 w-3.5" /> Editar
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
                  <p className="mt-1 text-base font-bold tabular-nums">{formatCurrency(detailDespesa.valor_orcado)}</p>
                </div>
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase text-amber-600">Consumido</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-amber-700">{formatCurrency(detailDespesa.valor_consumido)}</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${Number(detailDespesa.valor_saldo) < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : 'bg-emerald-50/50 dark:bg-emerald-950/10'}`}>
                  <p className={`text-[10px] font-semibold uppercase ${Number(detailDespesa.valor_saldo) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>Saldo</p>
                  <p className={`mt-1 text-base font-bold tabular-nums ${Number(detailDespesa.valor_saldo) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(detailDespesa.valor_saldo)}</p>
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

      {/* Modal */}
      {modalOpen && (
        <DespesaIndiretaModal
          onClose={() => { setModalOpen(false); setEditingDespesa(null) }}
          initialData={editingDespesa}
        />
      )}
    </div>
  )
}

// ─── DespesaRow ───────────────────────────────────────────────────────────────

function DespesaRow({
  d, showCategoria = false, totalPago = 0, isSelected, onToggle, hasParcela, onDetail, onEdit, onDelete,
}: {
  d: DespesaIndireta
  showCategoria?: boolean
  totalPago?: number
  isSelected: boolean
  onToggle: () => void
  hasParcela: boolean
  onDetail: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const saldoRow = Number(d.valor_saldo)
  const semParcela = !hasParcela
  const ultrapassado = totalPago - Number(d.valor_orcado)

  return (
    <tr className={`group transition-colors hover:bg-muted/20 ${isSelected ? 'bg-primary/5' : ''}`}>
      <td className="px-2 py-2.5 text-center">
        <input type="checkbox" checked={isSelected} onChange={onToggle}
          className="h-3.5 w-3.5 rounded accent-primary" />
      </td>
      {/* Status */}
      <td className="px-3 py-2.5 text-center">
        {semParcela ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-600">
            <AlertTriangle className="h-3 w-3" />Sem Parcela
          </span>
        ) : saldoRow < 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-600">
            Extrapolado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
            Saldo OK
          </span>
        )}
      </td>
      {/* Tipo */}
      <td className="px-3 py-2.5 text-center">
        {d.recorrente ? (
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-600">
            <RefreshCcw className="h-3 w-3" />Recorrente
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-slate-500/10 text-slate-600">
            Pontual
          </span>
        )}
      </td>
      {/* Categoria (flat view only) */}
      {showCategoria && (
        <td className="px-3 py-2.5">
          <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            {d.categoria}
          </span>
        </td>
      )}
      {/* Descrição + Fornecedor */}
      <td className="px-3 py-2.5 max-w-[240px]">
        <div className="font-medium truncate" title={d.descricao}>{d.descricao}</div>
        {d.fornecedor_nome && (
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{d.fornecedor_nome}</div>
        )}
      </td>
      {/* Período */}
      <td className="px-3 py-2.5 text-center">
        {d.data_inicio ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-[10px] tabular-nums">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              {format(parseISO(d.data_inicio), 'dd/MM/yy', { locale: ptBR })}
            </div>
            {d.recorrente && d.frequencia && (
              <span className="text-[9px] text-muted-foreground">{d.frequencia}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
      {/* Orçado */}
      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
        {formatCurrency(d.valor_orcado)}
      </td>
      {/* Consumido */}
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-600">
        {formatCurrency(d.valor_consumido)}
      </td>
      {/* Pago (banco) */}
      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${ultrapassado > 0.5 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
        {totalPago > 0 ? formatCurrency(totalPago) : '—'}
        {ultrapassado > 0.5 && (
          <div className="text-[9px] font-normal">+{formatCurrency(ultrapassado)}</div>
        )}
      </td>
      {/* Saldo */}
      <td className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${saldoRow < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {formatCurrency(d.valor_saldo)}
      </td>
      {/* Ações */}
      <td className="px-3 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {d.observacoes && (
            <button onClick={onDetail}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
              title="Ver detalhes">
              <Eye className="h-3 w-3" />
            </button>
          )}
          <button onClick={onEdit}
            className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors"
            title="Editar">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Excluir">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}
