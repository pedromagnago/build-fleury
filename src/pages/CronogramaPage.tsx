import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseComposicaoMedicoes, importComposicaoToEtapas } from '@/lib/composicaoParser'
import { useProject } from '@/contexts/ProjectContext'
import { useEtapas, useUpdateEtapa, useDeleteEtapa, type Etapa } from '@/hooks/useEtapas'
import { useItensCompra, usePedidos, useUpdateItemCompra, type ItemCompra, type Pedido } from '@/hooks/useCompras'
import { useDistribuicao, useCreateDistribuicao, useUpdateDistribuicao, useDeleteDistribuicao, type Distribuicao } from '@/hooks/useOperacional'
import { useParcelas, type Parcela } from '@/hooks/useFinanceiro'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { toast } from 'sonner'
import EtapaModal from '@/components/EtapaModal'
import BulkActionBar from '@/components/BulkActionBar'
import CronogramaBulkActions from '@/components/CronogramaBulkActions'
import { useSelection } from '@/hooks/useSelection'
import {
  CalendarRange, ChevronDown, ChevronRight, Clock, PlayCircle, CheckCircle2,
  AlertTriangle, Filter, Pencil, Plus, Trash2, X, Search, List, Columns3,
  GanttChartSquare, Save, Package, DollarSign, Calendar, Upload, FileSpreadsheet
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// Types
type ViewMode = 'gantt' | 'lista' | 'kanban'
type StatusKey = 'futuro' | 'em_andamento' | 'concluido' | 'atrasado'

const STATUS_CFG: Record<StatusKey, { label: string; icon: typeof Clock; bg: string; text: string; bar: string }> = {
  futuro: { label: 'Futuro', icon: Clock, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500', bar: 'bg-slate-400' },
  em_andamento: { label: 'Em Andamento', icon: PlayCircle, bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600', bar: 'bg-blue-500' },
  concluido: { label: 'Concluído', icon: CheckCircle2, bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-600', bar: 'bg-emerald-500' },
  atrasado: { label: 'Atrasado', icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-600', bar: 'bg-amber-500' },
}
const STATUSES: StatusKey[] = ['futuro', 'em_andamento', 'atrasado', 'concluido']

// Date helpers
const DAY_MS = 86400000
const today = new Date()
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * DAY_MS) }
function diffDays(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / DAY_MS) }
function startOfWeek(d: Date) { const c = new Date(d); c.setDate(c.getDate() - c.getDay() + 1); return c }
function fmtShort(d: Date) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

// Medicao type local
interface MedicaoLocal { id: string; numero: number; data_prevista: string | null; status: string }

function useLocalMedicoes() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['medicoes', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase.from('medicoes').select('id, numero, data_prevista, status').eq('company_id', currentCompany.id).order('numero')
      if (error) throw error
      return (data ?? []) as MedicaoLocal[]
    },
    enabled: !!currentCompany,
  })
}

// ============================================================
// MAIN
// ============================================================
export default function CronogramaPage() {
  const { restartTour } = useTour('cronograma', pageTours.cronograma)

  const { currentCompany } = useProject()
  const { data: etapas = [], isLoading } = useEtapas()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: itensCompra = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useLocalMedicoes()
  const updateEtapa = useUpdateEtapa()
  const deleteEtapa = useDeleteEtapa()
  const navigate = useNavigate()
  const selection = useSelection()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentCompany) return
    try {
      setIsImporting(true)
      const buffer = await file.arrayBuffer()
      const parsed = parseComposicaoMedicoes(buffer)
      if (medicoes.length > 0 && !window.confirm(`Atenção: Já existem ${medicoes.length} medições carregadas. A reimportação só deve ser feita se as medições não tiverem parcelas/avanços associados já faturados. Deseja substituir as distribuições e valores bancários?`)) {
        return
      }
      const result = await importComposicaoToEtapas(parsed, currentCompany.id, medicoes.length > 0)
      toast.success(`Planilha carregada. Etapas atualizadas: ${result.etapasAtualizadas}, Criadas: ${result.etapasCriadas}. Medições: ${result.medicoes}`)
      queryClient.invalidateQueries({ queryKey: ['etapas'] })
      queryClient.invalidateQueries({ queryKey: ['medicoes'] })
      queryClient.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
    } catch (err: any) {
      toast.error('Erro ao importar: ' + err.message)
    } finally {
      setIsImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const [viewMode, setViewMode] = useState<ViewMode>('lista')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [editingEtapa, setEditingEtapa] = useState<Etapa | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(new Set(STATUSES))
  const [showFilters, setShowFilters] = useState(false)

  const toggleStatus = (s: StatusKey) => setStatusFilters(p => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleExpand = useCallback((id: string) => setExpandedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const toggleItem = useCallback((id: string) => setExpandedItems(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }), [])

  // Filtered
  const filtered = useMemo(() => {
    return etapas.filter(e => {
      if (!statusFilters.has(e.status)) return false
      if (search && !e.nome.toLowerCase().includes(search.toLowerCase()) && !e.codigo.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [etapas, statusFilters, search])

  // Grouped data
  const itemsByEtapa = useMemo(() => {
    const m = new Map<string, ItemCompra[]>()
    itensCompra.forEach(i => { if (!m.has(i.etapa_id)) m.set(i.etapa_id, []); m.get(i.etapa_id)!.push(i) })
    return m
  }, [itensCompra])

  const distByEtapa = useMemo(() => {
    const m = new Map<string, Distribuicao[]>()
    distribuicoes.forEach(d => { if (!m.has(d.etapa_id)) m.set(d.etapa_id, []); m.get(d.etapa_id)!.push(d) })
    return m
  }, [distribuicoes])

  const pedidosByItem = useMemo(() => {
    const m = new Map<string, Pedido[]>()
    pedidos.forEach(p => { if (!m.has(p.item_compra_id)) m.set(p.item_compra_id, []); m.get(p.item_compra_id)!.push(p) })
    return m
  }, [pedidos])

  const parcelasByPedido = useMemo(() => {
    const m = new Map<string, Parcela[]>()
    parcelas.forEach(p => { if (p.pedido_id && !m.has(p.pedido_id)) m.set(p.pedido_id, []); if (p.pedido_id) m.get(p.pedido_id)!.push(p) })
    return m
  }, [parcelas])

  // Totals
  const totals = useMemo(() => {
    const orc = etapas.reduce((s, e) => s + (e.valor_total_orcado ?? 0), 0)
    const con = pedidos.filter(p => !!p.item_compra_id).reduce((s, p) => s + (p.valor_total_real || 0), 0)
    const pago = parcelas.filter(p => !!p.item_compra_id).reduce((s, p) => s + (p.valor_pago || 0), 0)
    return { etapas: etapas.length, orc, con, pago, saldo: orc - con, pct: orc > 0 ? (con / orc) * 100 : 0 }
  }, [etapas, pedidos, parcelas])

  const activeFilterCount = (4 - statusFilters.size) + (search ? 1 : 0)

  return (
    <div>
      <PageHeader title="Cronograma" description="Gestão de etapas, distribuição e custos do projeto" icon={CalendarRange} onHelp={restartTour} />

      {/* Summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <MiniCard label="Etapas" value={String(totals.etapas)} />
        <MiniCard label="Orçado" value={formatCurrency(totals.orc)} />
        <MiniCard label="Consumido" value={formatCurrency(totals.con)} accent="amber" />
        <MiniCard label="Pago" value={formatCurrency(totals.pago)} accent="blue" />
        <MiniCard label="Saldo" value={formatCurrency(totals.saldo)} accent={totals.saldo >= 0 ? 'emerald' : 'red'} />
        <MiniCard label="Execução" value={`${totals.pct.toFixed(1)}%`} />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* View switch */}
        <div id="tour-crono-views" className="flex rounded-lg border bg-card">
          {([['gantt', GanttChartSquare, 'Gantt'], ['lista', List, 'WBS'], ['kanban', Columns3, 'Kanban']] as [ViewMode, typeof List, string][]).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setViewMode(v)} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'} ${v === 'gantt' ? 'rounded-l-lg' : v === 'kanban' ? 'rounded-r-lg' : ''}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div id="tour-crono-filters" className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etapa..." className="h-8 w-48 rounded-lg border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {/* Filter toggle */}
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${showFilters ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
          <Filter className="h-3.5 w-3.5" /> Filtros {activeFilterCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-white">{activeFilterCount}</span>}
        </button>

        <input type="file" accept=".xlsx" className="hidden" ref={fileRef} onChange={handleFileUpload} />
        <button id="tour-crono-import" onClick={() => fileRef.current?.click()} disabled={isImporting} className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">
          {isImporting ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <Upload className="h-3.5 w-3.5" />}
          Importar CEF
        </button>

        <button id="tour-crono-new" onClick={() => { setEditingEtapa(null); setShowModal(true) }} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Nova etapa
        </button>

        <span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} etapa(s)</span>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border bg-card p-3">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Status:</span>
          {STATUSES.map(s => {
            const cfg = STATUS_CFG[s]
            return (
              <button key={s} onClick={() => toggleStatus(s)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${statusFilters.has(s) ? `${cfg.bg} ${cfg.text} ring-1 ring-current/20` : 'bg-muted/50 text-muted-foreground/40 line-through'}`}>
                <cfg.icon className="h-3 w-3" /> {cfg.label}
              </button>
            )
          })}
          {activeFilterCount > 0 && <button onClick={() => { setStatusFilters(new Set(STATUSES)); setSearch('') }} className="ml-auto text-[10px] underline text-muted-foreground">Limpar filtros</button>}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed">
          <div className="text-center">
            <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma etapa encontrada</p>
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'lista' && <WBSView etapas={filtered} itemsByEtapa={itemsByEtapa} distByEtapa={distByEtapa} pedidosByItem={pedidosByItem} parcelasByPedido={parcelasByPedido} expandedIds={expandedIds} toggleExpand={toggleExpand} expandedItems={expandedItems} toggleItem={toggleItem} selection={selection} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} onDelete={id => { if (window.confirm('Excluir etapa e todos os itens?')) deleteEtapa.mutate(id) }} />}
          {viewMode === 'kanban' && <KanbanView etapas={filtered} itemsByEtapa={itemsByEtapa} itensCompra={itensCompra} updateEtapa={updateEtapa} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} />}
          {viewMode === 'gantt' && <GanttView etapas={filtered} distribuicoes={distribuicoes} distByEtapa={distByEtapa} medicoes={medicoes} expandedIds={expandedIds} toggleExpand={toggleExpand} itemsByEtapa={itemsByEtapa} selection={selection} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} onDelete={id => { if (window.confirm('Excluir etapa?')) deleteEtapa.mutate(id) }} updateEtapa={updateEtapa} navigate={navigate} />}
        </>
      )}

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <CronogramaBulkActions etapas={etapas} selectedIds={selection.selected} onDone={selection.clear} />
      </BulkActionBar>

      {showModal && <EtapaModal etapa={editingEtapa} allEtapas={etapas} onClose={() => { setShowModal(false); setEditingEtapa(null) }} />}
    </div>
  )
}

// ============================================================
// MINI CARD
// ============================================================
function MiniCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : ''
  return <div className="rounded-xl border bg-card p-3"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-bold ${c}`}>{value}</p></div>
}

// ============================================================
// WBS VIEW (Lista hierárquica)
// ============================================================
function WBSView({ etapas, itemsByEtapa, distByEtapa, pedidosByItem, parcelasByPedido, expandedIds, toggleExpand, expandedItems, toggleItem, selection: _selection, onEdit, onDelete }: {
  etapas: Etapa[]; itemsByEtapa: Map<string, ItemCompra[]>; distByEtapa: Map<string, Distribuicao[]>; pedidosByItem: Map<string, Pedido[]>; parcelasByPedido: Map<string, Parcela[]>
  expandedIds: Set<string>; toggleExpand: (id: string) => void; expandedItems: Set<string>; toggleItem: (id: string) => void
  selection: ReturnType<typeof useSelection>; onEdit: (e: Etapa) => void; onDelete: (id: string) => void
}) {
  const updateItem = useUpdateItemCompra()
  const createDist = useCreateDistribuicao()
  const updateDist = useUpdateDistribuicao()
  const deleteDist = useDeleteDistribuicao()

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[40px_60px_1fr_90px_60px_100px_100px_100px_60px_60px] border-b bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="p-2" />
        <div className="p-2">Cód</div>
        <div className="p-2">Nome</div>
        <div className="p-2 text-center">Status</div>
        <div className="p-2 text-center">Casas</div>
        <div className="p-2 text-right">Orçado</div>
        <div className="p-2 text-right">Consumido</div>
        <div className="p-2 text-right">Pago</div>
        <div className="p-2 text-right">Saldo</div>
        <div className="p-2 text-center">%</div>
        <div className="p-2 text-center">Ações</div>
      </div>

      {etapas.map(etapa => {
        const exp = expandedIds.has(etapa.id)
        const cfg = STATUS_CFG[etapa.status]
        const items = itemsByEtapa.get(etapa.id) ?? []
        const dists = distByEtapa.get(etapa.id) ?? []
        const orc = items.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
        let con = 0
        let pago = 0
        items.forEach(i => {
          const peds = pedidosByItem.get(i.id) ?? []
          peds.forEach(p => {
            con += (p.valor_total_real || 0)
            const parcs = parcelasByPedido.get(p.id) ?? []
            parcs.forEach(parc => pago += (parc.valor_pago || 0))
          })
        })
        const saldo = orc - con
        const pct = orc > 0 ? (con / orc) * 100 : 0

        return (
          <div key={etapa.id}>
            {/* Etapa row */}
            <div className="grid grid-cols-[40px_60px_1fr_90px_60px_100px_100px_100px_100px_60px_60px] border-b hover:bg-muted/20 group cursor-pointer" onClick={() => toggleExpand(etapa.id)}>
              <div className="p-2 flex items-center justify-center">
                {exp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="p-2 flex items-center"><span className="font-mono text-[10px] text-muted-foreground">{etapa.codigo}</span></div>
              <div className="p-2 flex items-center"><span className="text-xs font-semibold truncate">{etapa.nome}</span></div>
              <div className="p-2 flex items-center justify-center">
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
                  <cfg.icon className="h-2.5 w-2.5" /> {cfg.label}
                </span>
              </div>
              <div className="p-2 flex items-center justify-center text-xs">{etapa.casas_total}</div>
              <div className="p-2 flex items-center justify-end text-xs font-medium">{formatCurrency(orc)}</div>
              <div className="p-2 flex items-center justify-end text-xs font-medium text-amber-600">{formatCurrency(con)}</div>
              <div className="p-2 flex items-center justify-end text-xs font-medium text-blue-600">{formatCurrency(pago)}</div>
              <div className={`p-2 flex items-center justify-end text-xs font-medium ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(saldo)}</div>
              <div className="p-2 flex items-center justify-center">
                <div className="w-8 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              </div>
              <div className="p-2 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(etapa)} className="rounded p-0.5 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                <button onClick={() => onDelete(etapa.id)} className="rounded p-0.5 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
              </div>
            </div>

            {/* EXPANDED: Tabs */}
            {exp && (
              <ExpandedEtapaRow
                etapa={etapa}
                dists={dists}
                items={items}
                pedidosByItem={pedidosByItem}
                parcelasByPedido={parcelasByPedido}
                expandedItems={expandedItems}
                toggleItem={toggleItem}
                updateItem={updateItem}
                createDist={createDist}
                updateDist={updateDist}
                deleteDist={deleteDist}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// EXPANDED ETAPA ROW (TABS)
// ============================================================
function ExpandedEtapaRow({ etapa, dists, items, pedidosByItem, parcelasByPedido, expandedItems, toggleItem, updateItem, createDist, updateDist, deleteDist, updateEtapa }: any) {
  const [tab, setTab] = useState<'faturamento' | 'compras' | 'distribuicao'>('faturamento')
  
  return (
    <div className="border-b bg-muted/5 relative">
      <div className="flex items-center gap-1 border-b px-4 mt-2">
        <button onClick={() => setTab('faturamento')} className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${tab === 'faturamento' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <DollarSign className="h-3.5 w-3.5" /> Faturamento Integrado
        </button>
        <button onClick={() => setTab('distribuicao')} className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${tab === 'distribuicao' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Calendar className="h-3.5 w-3.5" /> Cronograma Físico
        </button>
        <button onClick={() => setTab('compras')} className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${tab === 'compras' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Package className="h-3.5 w-3.5" /> Itens de Compra ({items.length})
        </button>
      </div>

      <div className="py-3">
        {tab === 'faturamento' && <FaturamentoSection etapa={etapa} dists={dists} updateEtapa={updateEtapa} />}
        {tab === 'distribuicao' && <DistribuicaoSection etapaId={etapa.id} dists={dists} casasTotal={etapa.casas_total} createDist={createDist} updateDist={updateDist} deleteDist={deleteDist} />}
        {tab === 'compras' && (
          <div className="px-4">
            {items.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 italic pl-2">Nenhum item cadastrado nesta etapa</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/30">
                    <tr className="text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium w-6" />
                      <th className="px-2 py-1.5 text-left font-medium">Descrição</th>
                      <th className="px-2 py-1.5 text-center font-medium">Tipo</th>
                      <th className="px-2 py-1.5 text-right font-medium">Orçado</th>
                      <th className="px-2 py-1.5 text-right font-medium">Consumido</th>
                      <th className="px-2 py-1.5 text-right font-medium">Pago</th>
                      <th className="px-2 py-1.5 text-right font-medium">Saldo</th>
                      <th className="px-2 py-1.5 text-center font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => {
                      const iExp = expandedItems.has(item.id)
                      const iPeds = pedidosByItem.get(item.id) ?? []
                      let iCon = 0
                      let iPago = 0
                      iPeds.forEach((p: any) => {
                        iCon += (p.valor_total_real || 0)
                        const parcs = parcelasByPedido.get(p.id) ?? []
                        parcs.forEach((parc: any) => iPago += (parc.valor_pago || 0))
                      })
                      const iSaldo = (item.valor_total_orcado ?? 0) - iCon
                      const iPct = item.valor_total_orcado > 0 ? (iCon / item.valor_total_orcado) * 100 : 0
                      return (
                        <ItemRow key={item.id} item={item} expanded={iExp} toggle={() => toggleItem(item.id)} pedidos={iPeds} parcelasByPedido={parcelasByPedido} consumido={iCon} saldo={iSaldo} pct={iPct} pago={iPago} updateItem={updateItem} />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FaturamentoSection({ etapa, dists, updateEtapa }: any) {
  const totFat = dists.reduce((s: number, d: any) => s + (d.valor_liberado_faturamento || 0), 0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    preco: etapa.faturamento_preco_unitario || 0,
    total: etapa.faturamento_valor_total || 0
  })

  const handleEdit = () => {
    setForm({
      preco: etapa.faturamento_preco_unitario || 0,
      total: etapa.faturamento_valor_total || 0
    })
    setEditing(true)
  }

  const handleSave = async () => {
    if (updateEtapa) {
      await updateEtapa.mutateAsync({
        id: etapa.id,
        faturamento_preco_unitario: form.preco,
        faturamento_valor_total: form.total
      })
    }
    setEditing(false)
  }
  
  if (!etapa.faturamento_valor_total && !editing) {
    return (
      <div className="px-6 flex flex-col items-center justify-center py-6">
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs font-semibold text-muted-foreground">Sem dados de faturamento CEF</p>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1 max-w-[300px] mb-3">
          Para visualizar os valores, importe a planilha de Composição e garanta que o nome desta etapa corresponde a um serviço listado lá.
        </p>
        <button onClick={handleEdit} className="text-[10px] bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-medium hover:bg-primary/20 transition-colors">
          Personalizar Manualmente
        </button>
      </div>
    )
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-2 mt-1">
         <h4 className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" /> Resumo do Faturamento CEF</h4>
         {!editing ? (
           <button onClick={handleEdit} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground">
             <Pencil className="h-3 w-3" /> Configurar CEF
           </button>
         ) : (
           <div className="flex items-center gap-1">
             <button onClick={() => setEditing(false)} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
               <X className="h-3 w-3" /> Cancelar
             </button>
             <button onClick={handleSave} className="text-[10px] flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90">
               <Save className="h-3 w-3" /> Salvar
             </button>
           </div>
         )}
      </div>

      <div className="grid grid-cols-4 gap-3 bg-muted/20 p-3 rounded-lg border border-dashed mb-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Preço Unitário</p>
          {editing ? (
            <input type="number" step="0.01" value={form.preco} onChange={e => setForm(p => ({ ...p, preco: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-foreground mt-0.5">{formatCurrency(etapa.faturamento_preco_unitario || 0)}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Qtd. Unidades</p>
          <p className="text-xs font-bold text-foreground mt-0.5">{etapa.casas_total} UND</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total Esperado</p>
           {editing ? (
            <input type="number" step="0.01" value={form.total} onChange={e => setForm(p => ({ ...p, total: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold text-blue-600 mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-blue-600 mt-0.5">{formatCurrency(etapa.faturamento_valor_total || 0)}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total Distribuído</p>
          <p className={`text-xs font-bold mt-0.5 ${Math.abs(totFat - (etapa.faturamento_valor_total || 0)) < 1 ? 'text-emerald-600' : 'text-amber-500'}`}>{formatCurrency(totFat)}</p>
        </div>
      </div>
      
      {dists.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-center font-medium w-12">Med.</th>
                <th className="px-2 py-1.5 text-left font-medium">Período Previsto</th>
                <th className="px-2 py-1.5 text-center font-medium">Progresso Físico</th>
                <th className="px-2 py-1.5 text-right font-medium">Liberação Financeira (R$)</th>
              </tr>
            </thead>
            <tbody>
              {dists.sort((a: any, b: any) => a.medicao_numero - b.medicao_numero).map((d: any) => (
                <tr key={d.id} className="border-t hover:bg-muted/10">
                  <td className="px-2 py-1.5 text-center font-medium">M{d.medicao_numero}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {d.data_inicio ? localDate(d.data_inicio).toLocaleDateString('pt-BR') : '--'} até {d.data_fim ? localDate(d.data_fim).toLocaleDateString('pt-BR') : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="font-semibold text-blue-600">{d.casas_planejadas}</span>  <span className="text-[9px] text-muted-foreground/60 mx-1">/</span> <span className="font-medium">{etapa.casas_total}</span> UND
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-emerald-600">
                    {formatCurrency(d.valor_liberado_faturamento || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// DISTRIBUIÇÃO SECTION (CRUD inline)
// ============================================================
function DistribuicaoSection({ etapaId, dists, casasTotal, createDist, updateDist, deleteDist }: {
  etapaId: string; dists: Distribuicao[]; casasTotal: number
  createDist: ReturnType<typeof useCreateDistribuicao>; updateDist: ReturnType<typeof useUpdateDistribuicao>; deleteDist: ReturnType<typeof useDeleteDistribuicao>
}) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })

  const totalPlan = dists.reduce((s, d) => s + d.casas_planejadas, 0)
  // totalReal could be used for progress display in future

  const save = async () => {
    if (editId) {
      await updateDist.mutateAsync({ id: editId, ...form })
      setEditId(null)
    } else {
      await createDist.mutateAsync({ etapa_id: etapaId, ...form, casas_realizadas: 0 })
      setAdding(false)
    }
    setForm({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })
  }

  const startEdit = (d: Distribuicao) => {
    setEditId(d.id)
    setForm({ medicao_numero: d.medicao_numero, casas_planejadas: d.casas_planejadas, data_inicio: d.data_inicio || '', data_fim: d.data_fim || '', valor_liberado_faturamento: d.valor_liberado_faturamento || 0 })
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Distribuição ({totalPlan}/{casasTotal} casas)
          {totalPlan !== casasTotal && <span className="text-amber-500 ml-1">⚠</span>}
        </p>
        {!adding && !editId && <button onClick={() => { setAdding(true); setForm({ medicao_numero: (dists.length > 0 ? Math.max(...dists.map(d => d.medicao_numero)) + 1 : 1), casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 }) }} className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" /> Nova</button>}
      </div>
      {dists.length === 0 && !adding ? (
        <p className="text-[10px] text-muted-foreground/50 italic pl-4">Nenhuma distribuição cadastrada</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-center font-medium">Med.</th>
                <th className="px-2 py-1 text-center font-medium">Casas Plan.</th>
                <th className="px-2 py-1 text-center font-medium">Casas Real.</th>
                <th className="px-2 py-1 text-center font-medium">Início</th>
                <th className="px-2 py-1 text-center font-medium">Fim</th>
                <th className="px-2 py-1 text-right font-medium">Receita a Liberar</th>
                <th className="px-2 py-1 text-center font-medium w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dists.map(d => editId === d.id ? (
                <tr key={d.id} className="bg-primary/5">
                  <td className="px-1 py-1"><input type="number" value={form.medicao_numero} onChange={e => setForm(p => ({ ...p, medicao_numero: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="number" value={form.casas_planejadas} onChange={e => setForm(p => ({ ...p, casas_planejadas: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
                  <td className="px-1 py-1 text-center text-muted-foreground">{d.casas_realizadas}</td>
                  <td className="px-1 py-1"><input type="date" value={form.data_inicio} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="date" value={form.data_fim} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="number" step="0.01" value={form.valor_liberado_faturamento} onChange={e => setForm(p => ({ ...p, valor_liberado_faturamento: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-right text-[11px] bg-background text-amber-600" /></td>
                  <td className="px-1 py-1 flex gap-0.5 justify-center">
                    <button onClick={save} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
                    <button onClick={() => { setEditId(null) }} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                  </td>
                </tr>
              ) : (
                <tr key={d.id} className="border-t hover:bg-muted/20 group">
                  <td className="px-2 py-1 text-center font-medium">{d.medicao_numero}</td>
                  <td className="px-2 py-1 text-center">{d.casas_planejadas}</td>
                  <td className={`px-2 py-1 text-center ${d.casas_realizadas >= d.casas_planejadas ? 'text-emerald-600 font-semibold' : ''}`}>{d.casas_realizadas}</td>
                  <td className="px-2 py-1 text-center">{d.data_inicio ? localDate(d.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-center">{d.data_fim ? localDate(d.data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-right font-medium">{formatCurrency(d.valor_liberado_faturamento || 0)}</td>
                  <td className="px-2 py-1 flex gap-0.5 justify-center opacity-0 group-hover:opacity-100">
                    <button onClick={() => startEdit(d)} className="rounded p-0.5 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                    <button onClick={() => deleteDist.mutate(d.id)} className="rounded p-0.5 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
                  </td>
                </tr>
              ))}
              {adding && (
                <tr className="bg-primary/5 border-t">
                  <td className="px-1 py-1"><input type="number" value={form.medicao_numero} onChange={e => setForm(p => ({ ...p, medicao_numero: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="number" value={form.casas_planejadas} onChange={e => setForm(p => ({ ...p, casas_planejadas: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
                  <td className="px-1 py-1 text-center text-muted-foreground">0</td>
                  <td className="px-1 py-1"><input type="date" value={form.data_inicio} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="date" value={form.data_fim} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
                  <td className="px-1 py-1"><input type="number" step="0.01" value={form.valor_liberado_faturamento} onChange={e => setForm(p => ({ ...p, valor_liberado_faturamento: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-right text-[11px] bg-background text-amber-600" /></td>
                  <td className="px-1 py-1 flex gap-0.5 justify-center">
                    <button onClick={save} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
                    <button onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
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

// ============================================================
// ITEM ROW (with inline edit + pedido expand)
// ============================================================
function ItemRow({ item, expanded, toggle, pedidos, parcelasByPedido, consumido, saldo, pct, pago, updateItem }: {
  item: ItemCompra; expanded: boolean; toggle: () => void; pedidos: Pedido[]; parcelasByPedido: Map<string, Parcela[]>; consumido: number; saldo: number; pct: number; pago: number;
  updateItem: ReturnType<typeof useUpdateItemCompra>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ descricao: item.descricao, valor_total_orcado: item.valor_total_orcado, cond_pagamento: item.cond_pagamento || '' })

  const saveItem = () => {
    updateItem.mutate({ id: item.id, descricao: form.descricao, valor_total_orcado: form.valor_total_orcado, cond_pagamento: form.cond_pagamento || null })
    setEditing(false)
  }

  const tipoLabel = item.tipo === 'MATERIAL' ? 'Material' : item.tipo === 'MAO_DE_OBRA' ? 'M. Obra' : 'Equip.'
  const tipoColor = item.tipo === 'MATERIAL' ? 'text-blue-600 bg-blue-50' : item.tipo === 'MAO_DE_OBRA' ? 'text-purple-600 bg-purple-50' : 'text-orange-600 bg-orange-50'

  return (
    <>
      <tr className="border-t hover:bg-muted/20 group cursor-pointer" onClick={toggle}>
        <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
          {pedidos.length > 0 && (expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
        </td>
        {editing ? (
          <>
            <td className="px-1 py-1" colSpan={2} onClick={e => e.stopPropagation()}>
              <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className="w-full border rounded px-1.5 py-0.5 text-[11px] bg-background" />
            </td>
            <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
              <input type="number" value={form.valor_total_orcado} onChange={e => setForm(p => ({ ...p, valor_total_orcado: +e.target.value }))} className="w-full border rounded px-1.5 py-0.5 text-[11px] bg-background text-right" />
            </td>
            <td className="px-2 py-1.5 text-right text-amber-600">{formatCurrency(consumido)}</td>
            <td className="px-2 py-1.5 text-right text-blue-600">{formatCurrency(pago)}</td>
            <td className="px-2 py-1.5 text-right">{formatCurrency(saldo)}</td>
            <td className="px-1 py-1 flex gap-0.5 justify-center" onClick={e => e.stopPropagation()}>
              <button onClick={saveItem} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
              <button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
            </td>
          </>
        ) : (
          <>
            <td className="px-2 py-1.5 font-medium truncate max-w-[200px]" title={item.descricao}>{item.descricao}</td>
            <td className="px-2 py-1.5 text-center"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${tipoColor}`}>{tipoLabel}</span></td>
            <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(item.valor_total_orcado)}</td>
            <td className="px-2 py-1.5 text-right text-amber-600">{formatCurrency(consumido)}</td>
            <td className="px-2 py-1.5 text-right text-blue-600">{formatCurrency(pago)}</td>
            <td className={`px-2 py-1.5 text-right ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(saldo)}</td>
            <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-1 justify-center">
                <span className="text-[9px]">{pct.toFixed(0)}%</span>
                <button onClick={() => { setForm({ descricao: item.descricao, valor_total_orcado: item.valor_total_orcado, cond_pagamento: item.cond_pagamento || '' }); setEditing(true) }} className="rounded p-0.5 hover:bg-accent opacity-0 group-hover:opacity-100"><Pencil className="h-2.5 w-2.5 text-muted-foreground" /></button>
              </div>
            </td>
          </>
        )}
      </tr>
      {/* Pedidos expand */}
      {expanded && pedidos.map(ped => {
        const parcs = parcelasByPedido.get(ped.id) ?? []
        const stColor = ped.status === 'entregue' ? 'text-emerald-600' : ped.status === 'confirmado' ? 'text-blue-600' : ped.status === 'cancelado' ? 'text-red-400' : 'text-muted-foreground'
        return (
          <tr key={ped.id} className="bg-muted/10 border-t text-[10px]">
            <td />
            <td colSpan={2} className="px-2 py-1 pl-6">
              <span className="font-medium">Pedido #{ped.numero_pedido}</span> — <span className="text-muted-foreground">{ped.fornecedor_nome || 'S/ Forn.'}</span>
              <span className={`ml-2 ${stColor} font-semibold`}>{ped.status}</span>
            </td>
            <td className="px-2 py-1 text-right font-medium">{formatCurrency(ped.valor_total_real ?? 0)}</td>
            <td colSpan={3} className="px-2 py-1">
              <div className="flex gap-2 flex-wrap">
                {parcs.map(p => (
                  <span key={p.id} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] ${p.status === 'paga' ? 'bg-emerald-50 text-emerald-700' : p.status === 'vencida' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    P{p.numero_parcela}: {formatCurrency(p.valor)}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ============================================================
// KANBAN VIEW
// ============================================================
function KanbanView({ etapas, itemsByEtapa, itensCompra: _itensCompra, updateEtapa, onEdit }: {
  etapas: Etapa[]; itemsByEtapa: Map<string, ItemCompra[]>; itensCompra: ItemCompra[]
  updateEtapa: ReturnType<typeof useUpdateEtapa>; onEdit: (e: Etapa) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  const handleDrop = (status: StatusKey) => {
    if (dragId) {
      updateEtapa.mutate({ id: dragId, status })
      setDragId(null)
    }
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {STATUSES.map(status => {
        const cfg = STATUS_CFG[status]
        const cols = etapas.filter(e => e.status === status)
        return (
          <div key={status} className="rounded-xl border bg-card min-h-[400px]"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary/50') }}
            onDragLeave={e => e.currentTarget.classList.remove('ring-2', 'ring-primary/50')}
            onDrop={e => { e.currentTarget.classList.remove('ring-2', 'ring-primary/50'); handleDrop(status) }}
          >
            <div className={`px-3 py-2 border-b rounded-t-xl ${cfg.bg}`}>
              <div className="flex items-center gap-1.5">
                <cfg.icon className={`h-3.5 w-3.5 ${cfg.text}`} />
                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{cols.length}</span>
              </div>
            </div>
            <div className="p-2 space-y-2">
              {cols.map(e => {
                const items = itemsByEtapa.get(e.id) ?? []
                const orc = items.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
                const con = items.reduce((s, i) => s + (i.valor_consumido ?? 0), 0)
                const pct = orc > 0 ? (con / orc) * 100 : 0
                return (
                  <div key={e.id} draggable onDragStart={() => setDragId(e.id)}
                    className="rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    onClick={() => onEdit(e)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-mono text-[9px] text-muted-foreground">{e.codigo}</span>
                      <span className="text-xs font-semibold truncate">{e.nome}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                      <span>{e.casas_total} casas</span>
                      <span className="ml-auto">{formatCurrency(orc)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">{pct.toFixed(0)}% executado</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// GANTT VIEW (simplified, kept from original)
// ============================================================
function GanttView({ etapas, distribuicoes, distByEtapa, medicoes: _medicoes, expandedIds, toggleExpand, itemsByEtapa: _itemsByEtapa, selection: _selection, onEdit, onDelete, updateEtapa: _updateEtapa, navigate: _navigate }: {
  etapas: Etapa[]; distribuicoes: Distribuicao[]; distByEtapa: Map<string, Distribuicao[]>; medicoes: MedicaoLocal[]
  expandedIds: Set<string>; toggleExpand: (id: string) => void; itemsByEtapa: Map<string, ItemCompra[]>
  selection: ReturnType<typeof useSelection>; onEdit: (e: Etapa) => void; onDelete: (id: string) => void
  updateEtapa: ReturnType<typeof useUpdateEtapa>; navigate: (p: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const ROW_H = 48, SIDE_W = 280

  const { getX, columns, gridW, todayX } = useMemo(() => {
    const allDates: Date[] = []
    etapas.forEach(e => { if (e.data_inicio_plan) allDates.push(localDate(e.data_inicio_plan)); if (e.data_fim_plan) allDates.push(localDate(e.data_fim_plan)) })
    distribuicoes.forEach(d => { if (d.data_inicio) allDates.push(localDate(d.data_inicio)); if (d.data_fim) allDates.push(localDate(d.data_fim)) })
    if (allDates.length === 0) { allDates.push(addDays(today, -30), addDays(today, 120)) }
    const mn = new Date(Math.min(...allDates.map(d => d.getTime())))
    const mx = new Date(Math.max(...allDates.map(d => d.getTime())))
    const start = addDays(mn, -14), end = addDays(mx, 21)
    const totalDays = diffDays(end, start)
    const cw = 100
    const firstMon = startOfWeek(start)
    const wks = Math.ceil(totalDays / 7) + 1
    const cols = Array.from({ length: wks }, (_, i) => { const d = addDays(firstMon, i * 7); return { date: d, label: fmtShort(d), width: cw } })
    const gw = cols.reduce((s, c) => s + c.width, 0)
    const gx = (d: Date | string) => { const dt = typeof d === 'string' ? localDate(d) : d; return (diffDays(dt, start) / totalDays) * gw }
    return { getX: gx, columns: cols, gridW: gw, todayX: gx(today) }
  }, [etapas, distribuicoes])

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex border-b">
        <div className="flex shrink-0 items-center gap-2 border-r bg-muted/30 px-3 py-2" style={{ width: SIDE_W }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="overflow-x-auto" style={{ scrollBehavior: 'smooth' }}>
            <div className="relative flex" style={{ width: gridW, minHeight: 32 }}>
              {columns.map((c, i) => <div key={i} className="shrink-0 border-r border-dashed border-border/40 py-2 text-center text-[10px] font-medium text-muted-foreground" style={{ width: c.width }}>{c.label}</div>)}
            </div>
          </div>
        </div>
      </div>
      <div className="relative">
        {etapas.map(etapa => {
          const cfg = STATUS_CFG[etapa.status]
          const Icon = cfg.icon
          const dists = distByEtapa.get(etapa.id) ?? []
          return (
            <div key={etapa.id}>
              <div className="group flex border-b hover:bg-muted/20">
                <div className="flex shrink-0 items-center gap-1 border-r px-2" style={{ width: SIDE_W, minHeight: ROW_H }}>
                  <button onClick={() => toggleExpand(etapa.id)} className="rounded p-0.5 text-muted-foreground hover:bg-accent">
                    {expandedIds.has(etapa.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="font-mono text-[10px] text-muted-foreground">{etapa.codigo}</span><span className="truncate text-xs font-medium">{etapa.nome}</span></div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{etapa.casas_total} casas</span>
                      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}><Icon className="h-2.5 w-2.5" />{cfg.label}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEdit(etapa)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                    <button onClick={() => onDelete(etapa.id)} className="rounded p-1 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="relative" style={{ width: gridW, height: ROW_H }}>
                    {columns.map((c, i) => <div key={i} className="absolute top-0 h-full border-r border-dashed border-border/20" style={{ left: getX(c.date) }} />)}
                    <div className="absolute top-0 h-full w-0.5 bg-red-500/60" style={{ left: todayX }} />
                    {etapa.data_inicio_plan && etapa.data_fim_plan && (
                      <div className="absolute rounded-sm" style={{ left: getX(etapa.data_inicio_plan), width: Math.max(8, getX(etapa.data_fim_plan) - getX(etapa.data_inicio_plan)), top: 10, height: 12, backgroundColor: 'hsl(var(--primary) / 0.15)' }}>
                        {dists.length > 0 ? dists.map(d => {
                          if (!d.data_inicio) return null
                          const bx = getX(d.data_inicio) - getX(etapa.data_inicio_plan!)
                          const bw = d.data_fim ? Math.max(6, getX(d.data_fim) - getX(d.data_inicio)) : 6
                          const done = d.casas_realizadas >= d.casas_planejadas
                          return <div key={d.id} className="absolute top-0 rounded-[2px] flex items-center justify-center" style={{ left: Math.max(0, bx), width: bw, height: 12, backgroundColor: done ? 'rgb(34 197 94 / 0.7)' : 'rgb(59 130 246 / 0.5)' }} title={`M${d.medicao_numero}: ${d.casas_planejadas} casas`}><span className="text-[7px] font-bold text-white">{d.casas_planejadas}</span></div>
                        }) : <div className="absolute inset-0 rounded-sm" style={{ backgroundColor: 'rgb(148 163 184 / 0.35)' }}><span className="flex h-full items-center px-1 text-[8px] font-semibold text-white/80">{etapa.casas_total} casas</span></div>}
                      </div>
                    )}
                    {etapa.data_inicio_real && <div className={`absolute rounded-sm ${cfg.bar}`} style={{ left: getX(etapa.data_inicio_real), width: Math.max(4, getX(etapa.data_fim_real ?? today.toISOString().split('T')[0]!) - getX(etapa.data_inicio_real)), top: 28, height: 6, opacity: 0.8 }} />}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
