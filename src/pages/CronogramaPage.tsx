import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useEtapas, useUpdateEtapa, useDeleteEtapa, type Etapa } from '@/hooks/useEtapas'
import { useItensCompra, usePedidos, type ItemCompra, type Pedido } from '@/hooks/useCompras'
import { useDistribuicao, type Distribuicao } from '@/hooks/useOperacional'
import { useParcelas, type Parcela } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { toast } from 'sonner'
import EtapaModal from '@/components/EtapaModal'
import BulkActionBar from '@/components/BulkActionBar'
import CronogramaBulkActions from '@/components/CronogramaBulkActions'
import WBSDashboardCards from '@/components/cronograma/WBSDashboardCards'
import WBSTable from '@/components/cronograma/WBSTable'
import SimuladorPanel from '@/components/cronograma/SimuladorPanel'
import CashFlowChart from '@/components/cronograma/CashFlowChart'
import UnitCostPanel from '@/components/cronograma/UnitCostPanel'
import MedicoesPanel from '@/components/cronograma/MedicoesPanel'
import { type FinancialViewMode } from '@/components/cronograma/FinancialViewFilter'
import { useSelection } from '@/hooks/useSelection'
import { exportWBSToExcel } from '@/lib/wbsExport'
import {
  CalendarRange, ChevronDown, ChevronRight, Clock, PlayCircle, CheckCircle2,
  AlertTriangle, Filter, Plus, Search, List, Columns3,
  GanttChartSquare, Download, Pencil, Trash2,
  FlaskConical, LayoutGrid, Calculator, ClipboardCheck,
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// Types
type TabMode = 'wbs' | 'custos' | 'medicoes' | 'simulador' | 'gantt' | 'kanban'
type StatusKey = 'futuro' | 'em_andamento' | 'concluido' | 'atrasado'

const STATUS_CFG: Record<StatusKey, { label: string; icon: typeof Clock; bg: string; text: string; bar: string }> = {
  futuro: { label: 'Futuro', icon: Clock, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500', bar: 'bg-slate-400' },
  em_andamento: { label: 'Em Andamento', icon: PlayCircle, bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600', bar: 'bg-blue-500' },
  concluido: { label: 'Concluído', icon: CheckCircle2, bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-600', bar: 'bg-emerald-500' },
  atrasado: { label: 'Atrasado', icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-600', bar: 'bg-amber-500' },
}
const STATUSES: StatusKey[] = ['futuro', 'em_andamento', 'atrasado', 'concluido']

const TAB_CONFIG: { key: TabMode; label: string; icon: typeof List }[] = [
  { key: 'wbs', label: 'WBS', icon: List },
  { key: 'custos', label: 'Custos', icon: Calculator },
  { key: 'medicoes', label: 'Medições', icon: ClipboardCheck },
  { key: 'simulador', label: 'Simulador', icon: FlaskConical },
  { key: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { key: 'kanban', label: 'Kanban', icon: Columns3 },
]

// Date helpers
const DAY_MS = 86400000
const today = new Date()
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * DAY_MS) }
function diffDays(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / DAY_MS) }
function startOfWeek(d: Date) { const c = new Date(d); c.setDate(c.getDate() - c.getDay() + 1); return c }
function fmtShort(d: Date) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

// Medicao type local
interface MedicaoLocal { id: string; numero: number; data_prevista: string | null; data_liberacao: string | null; status: string; valor_planejado: number }

function useLocalMedicoes() {
  const { currentCompany } = useProject()
  return useQuery({
    queryKey: ['medicoes', currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany) return []
      const { data, error } = await supabase.from('medicoes').select('id, numero, data_prevista, data_liberacao, status, valor_planejado').eq('company_id', currentCompany.id).order('numero')
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

  useProject()
  const { data: etapas = [], isLoading } = useEtapas()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: itensCompra = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: medicoes = [] } = useLocalMedicoes()
  const updateEtapa = useUpdateEtapa()
  const deleteEtapa = useDeleteEtapa()
  const navigate = useNavigate()
  const selection = useSelection()

  const [viewMode, setViewMode] = useState<FinancialViewMode>('planejado')

  const [activeTab, setActiveTab] = useState<TabMode>('wbs')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [editingEtapa, setEditingEtapa] = useState<Etapa | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Filters (for WBS / Gantt / Kanban)
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

  // Dashboard totals
  const dashTotals = useMemo(() => {
    let custoOrc = 0, custoCon = 0, custoPago = 0, receitaCEF = 0
    let custoIndOrc = 0, custoIndCon = 0, custoIndPago = 0

    etapas.forEach(e => {
      const dists = distByEtapa.get(e.id) ?? []
      const distReceita = dists.reduce((sum, d) => sum + (d.valor_liberado_faturamento || 0), 0)
      receitaCEF += (e.faturamento_valor_total || distReceita)
      const items = itemsByEtapa.get(e.id) ?? []
      items.forEach(i => {
        custoOrc += (i.valor_total_orcado ?? 0)
        const peds = pedidosByItem.get(i.id) ?? []
        peds.forEach(p => {
          custoCon += (p.valor_total_real || 0)
          const parcs = parcelasByPedido.get(p.id) ?? []
          parcs.forEach(parc => custoPago += (parc.valor_pago || 0))
        })
      })
    })

    despesas.forEach(d => {
      custoIndOrc += Number(d.valor_orcado || 0)
      custoIndCon += Number(d.valor_consumido || 0)
    })

    parcelas.forEach(p => {
      if (p.despesa_indireta_id) {
        custoIndPago += Number(p.valor_pago || 0)
      }
    })

    const totalOrc = custoOrc + custoIndOrc
    const totalCon = custoCon + custoIndCon
    const saldo = totalOrc - totalCon
    const margemRS = receitaCEF - totalOrc
    const margemPct = receitaCEF > 0 ? ((receitaCEF - totalOrc) / receitaCEF) * 100 : 0
    const execPct = totalOrc > 0 ? (totalCon / totalOrc) * 100 : 0
    
    return { 
      etapasCount: etapas.length, 
      receitaCEF, 
      custoOrcado: custoOrc, 
      custoIndiretoOrcado: custoIndOrc,
      custoConsumido: custoCon, 
      custoIndiretoConsumido: custoIndCon,
      custoPago, 
      custoIndiretoPago: custoIndPago,
      saldo, 
      execucaoPct: execPct, 
      margemRS, 
      margemPct 
    }
  }, [etapas, itemsByEtapa, pedidosByItem, parcelasByPedido, despesas, parcelas])

  const activeFilterCount = (4 - statusFilters.size) + (search ? 1 : 0)

  const handleExport = () => {
    try {
      exportWBSToExcel(etapas, itensCompra, distribuicoes)
      toast.success('Excel exportado com sucesso!')
    } catch (err: any) {
      console.error('Erro na exportação:', err)
      toast.error('Erro ao exportar: ' + (err?.message || 'desconhecido'))
    }
  }

  const showWbsToolbar = activeTab === 'wbs' || activeTab === 'gantt' || activeTab === 'kanban'

  return (
    <div>
      <PageHeader title="Painel de Bordo" description="Gestão centralizada do projeto — planejamento, medições e simulação" icon={LayoutGrid} onHelp={restartTour} />

      {/* Dashboard KPIs */}
      <WBSDashboardCards {...dashTotals} />

      {/* Cash Flow Chart */}
      <CashFlowChart
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Tab Navigation */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-lg border bg-card">
          {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              } ${key === TAB_CONFIG[0]!.key ? 'rounded-l-lg' : ''} ${key === TAB_CONFIG[TAB_CONFIG.length - 1]!.key ? 'rounded-r-lg' : ''}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* WBS-specific toolbar */}
        {showWbsToolbar && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etapa..." className="h-8 w-48 rounded-lg border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${showFilters ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
              <Filter className="h-3.5 w-3.5" /> Filtros {activeFilterCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[9px] font-bold text-white">{activeFilterCount}</span>}
            </button>

            <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Exportar
            </button>

            <button onClick={() => { setEditingEtapa(null); setShowModal(true) }} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Nova etapa
            </button>

            <span className="ml-auto text-[10px] text-muted-foreground">{filtered.length} etapa(s)</span>
          </>
        )}
      </div>

      {/* Filter bar */}
      {showFilters && showWbsToolbar && (
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
      {activeTab === 'custos' ? (
        <UnitCostPanel />
      ) : activeTab === 'medicoes' ? (
        <MedicoesPanel />
      ) : activeTab === 'simulador' ? (
        <SimuladorPanel viewMode={viewMode} onViewModeChange={setViewMode} />
      ) : isLoading ? (
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
          {activeTab === 'wbs' && <WBSTable etapas={filtered} itemsByEtapa={itemsByEtapa} distByEtapa={distByEtapa} pedidosByItem={pedidosByItem} parcelasByPedido={parcelasByPedido} expandedIds={expandedIds} toggleExpand={toggleExpand} expandedItems={expandedItems} toggleItem={toggleItem} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} onDelete={id => { if (window.confirm('Excluir etapa e todos os itens?')) deleteEtapa.mutate(id) }} selection={selection} />}
          {activeTab === 'kanban' && <KanbanView etapas={filtered} itemsByEtapa={itemsByEtapa} itensCompra={itensCompra} updateEtapa={updateEtapa} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} />}
          {activeTab === 'gantt' && <GanttView etapas={filtered} distribuicoes={distribuicoes} distByEtapa={distByEtapa} medicoes={medicoes} expandedIds={expandedIds} toggleExpand={toggleExpand} itemsByEtapa={itemsByEtapa} selection={selection} onEdit={e => { setEditingEtapa(e); setShowModal(true) }} onDelete={id => { if (window.confirm('Excluir etapa?')) deleteEtapa.mutate(id) }} updateEtapa={updateEtapa} navigate={navigate} />}
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
// KANBAN VIEW (kept inline — simple component)
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
// GANTT VIEW (kept inline — complex but self-contained)
// ============================================================
function GanttView({ etapas, distribuicoes, distByEtapa, medicoes: _medicoes, expandedIds, toggleExpand, itemsByEtapa: _itemsByEtapa, selection, onEdit, onDelete, updateEtapa: _updateEtapa, navigate: _navigate }: {
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
              <div className={`group flex border-b hover:bg-muted/20 ${selection.isSelected(etapa.id) ? 'bg-primary/5' : ''}`}>
                <div className="flex shrink-0 items-center gap-1 border-r px-2" style={{ width: SIDE_W, minHeight: ROW_H }}>
                  <input type="checkbox" checked={selection.isSelected(etapa.id)} onChange={() => selection.toggle(etapa.id)} className="h-3 w-3 rounded accent-primary cursor-pointer shrink-0" />
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
