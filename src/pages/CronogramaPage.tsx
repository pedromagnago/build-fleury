import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useEtapas, useUpdateEtapa, useDeleteEtapa, type Etapa } from '@/hooks/useEtapas'
import { useItensCompra, type ItemCompra } from '@/hooks/useCompras'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { toast } from 'sonner'
import EtapaModal from '@/components/EtapaModal'
import BulkActionBar from '@/components/BulkActionBar'
import CronogramaBulkActions from '@/components/CronogramaBulkActions'
import { useSelection } from '@/hooks/useSelection'
import {
  CalendarRange, ChevronDown, ChevronRight, Eye, Clock,
  PlayCircle, CheckCircle2, AlertTriangle, Crosshair,
  Filter, Pencil, ExternalLink, Plus, GripVertical, Trash2
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Distribuicao {
  id: string
  company_id: string
  etapa_id: string
  medicao_numero: number
  casas_planejadas: number
  data_inicio: string | null
  data_fim: string | null
  casas_realizadas: number
}

interface Medicao {
  id: string
  numero: number
  data_prevista: string | null
  status: string
}

type ZoomLevel = 'dia' | 'semana' | 'mes'
type StatusFilter = 'todas' | 'em_andamento' | 'atrasado'

const STATUS_CFG = {
  futuro: { label: 'Futuro', icon: Clock, bg: 'bg-slate-500/10', text: 'text-slate-400', bar: 'bg-slate-400' },
  em_andamento: { label: 'Em Andamento', icon: PlayCircle, bg: 'bg-blue-500/10', text: 'text-blue-500', bar: 'bg-blue-500' },
  concluido: { label: 'Concluído', icon: CheckCircle2, bg: 'bg-emerald-500/10', text: 'text-emerald-500', bar: 'bg-emerald-500' },
  atrasado: { label: 'Atrasado', icon: AlertTriangle, bg: 'bg-amber-500/10', text: 'text-amber-500', bar: 'bg-amber-500' },
} as const

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useDistribuicao() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id
  return useQuery({
    queryKey: ['cronograma_distribuicao', cid],
    queryFn: async () => {
      if (!cid) return []
      const { data, error } = await supabase
        .from('cronograma_distribuicao')
        .select('*')
        .eq('company_id', cid)
        .order('medicao_numero')
      if (error) throw error
      return (data ?? []) as Distribuicao[]
    },
    enabled: !!cid,
  })
}

function useMedicoes() {
  const { currentCompany } = useProject()
  const cid = currentCompany?.id
  return useQuery({
    queryKey: ['medicoes', cid],
    queryFn: async () => {
      if (!cid) return []
      const { data, error } = await supabase
        .from('medicoes')
        .select('id, numero, data_prevista, status')
        .eq('company_id', cid)
        .order('numero')
      if (error) throw error
      return (data ?? []) as Medicao[]
    },
    enabled: !!cid,
  })
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86400000
const today = new Date()
const todayStr = today.toISOString().split('T')[0]!

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}
function startOfWeek(d: Date): Date {
  const clone = new Date(d)
  clone.setDate(clone.getDate() - clone.getDay() + 1) // Monday
  return clone
}
function formatShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CronogramaPage() {
  useProject() // ensure context is available
  const { data: etapas = [], isLoading: loadingEtapas } = useEtapas()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: itensCompra = [] } = useItensCompra()
  const { data: medicoes = [] } = useMedicoes()
  const updateEtapa = useUpdateEtapa()
  const deleteEtapa = useDeleteEtapa()
  const navigate = useNavigate()

  const [zoom, setZoom] = useState<ZoomLevel>('semana')
  const [filter, setFilter] = useState<StatusFilter>('todas')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingEtapa, setEditingEtapa] = useState<Etapa | null>(null)
  const [showModal, setShowModal] = useState(false) // for create and edit
  const [dragId, setDragId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const selection = useSelection()

  // -- Filter etapas
  const filteredEtapas = useMemo(() => {
    if (filter === 'todas') return etapas
    return etapas.filter((e) => e.status === filter)
  }, [etapas, filter])

  // -- Build item groups by etapa and type
  const itemsByEtapa = useMemo(() => {
    const map = new Map<string, { MATERIAL: ItemCompra[]; MAO_DE_OBRA: ItemCompra[]; EQUIPAMENTO: ItemCompra[] }>()
    itensCompra.forEach((item) => {
      if (!map.has(item.etapa_id)) {
        map.set(item.etapa_id, { MATERIAL: [], MAO_DE_OBRA: [], EQUIPAMENTO: [] })
      }
      map.get(item.etapa_id)![item.tipo].push(item)
    })
    return map
  }, [itensCompra])

  // -- Distribution grouped by etapa
  const distByEtapa = useMemo(() => {
    const map = new Map<string, Distribuicao[]>()
    distribuicoes.forEach((d) => {
      if (!map.has(d.etapa_id)) map.set(d.etapa_id, [])
      map.get(d.etapa_id)!.push(d)
    })
    return map
  }, [distribuicoes])

  // -- Timeline range
  const { getX, columns } = useMemo(() => {
    // Find min/max dates from etapas + distribuicoes
    const allDates: Date[] = []
    etapas.forEach((e) => {
      if (e.data_inicio_plan) allDates.push(localDate(e.data_inicio_plan))
      if (e.data_fim_plan) allDates.push(localDate(e.data_fim_plan))
      if (e.data_inicio_real) allDates.push(localDate(e.data_inicio_real))
      if (e.data_fim_real) allDates.push(localDate(e.data_fim_real))
    })
    distribuicoes.forEach((d) => {
      if (d.data_inicio) allDates.push(localDate(d.data_inicio))
      if (d.data_fim) allDates.push(localDate(d.data_fim))
    })

    if (allDates.length === 0) {
      const s = addDays(today, -30)
      const e = addDays(today, 120)
      allDates.push(s, e)
    }

    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))

    // Add buffer
    const start = addDays(minDate, -14)
    const end = addDays(maxDate, 21)

    const totalDays = diffDays(end, start)

    let cw: number
    let cols: Array<{ date: Date; label: string; width: number }>

    if (zoom === 'dia') {
      cw = 32
      cols = Array.from({ length: totalDays }, (_, i) => {
        const d = addDays(start, i)
        return { date: d, label: formatShort(d), width: cw }
      })
    } else if (zoom === 'semana') {
      cw = 100
      const firstMonday = startOfWeek(start)
      const weeks = Math.ceil(totalDays / 7) + 1
      cols = Array.from({ length: weeks }, (_, i) => {
        const d = addDays(firstMonday, i * 7)
        return { date: d, label: formatShort(d), width: cw }
      })
    } else {
      cw = 140
      const months: Array<{ date: Date; label: string; width: number }> = []
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cursor <= end) {
        months.push({ date: new Date(cursor), label: formatMonthYear(cursor), width: cw })
        cursor.setMonth(cursor.getMonth() + 1)
      }
      cols = months
    }

    const totalWidth = cols.reduce((s, c) => s + c.width, 0)

    const getXPos = (d: Date | string): number => {
      const date = typeof d === 'string' ? localDate(d) : d
      const dayOffset = diffDays(date, start)
      const ratio = dayOffset / totalDays
      return ratio * totalWidth
    }

    return {
      timelineStart: start,
      timelineEnd: end,
      columnCount: cols.length,
      colWidth: cw,
      getX: getXPos,
      columns: cols,
    }
  }, [etapas, distribuicoes, zoom])

  // -- Totals
  const totals = useMemo(() => {
    const orcado = etapas.reduce((s, e) => s + (e.valor_total_orcado ?? 0), 0)
    const consumido = itensCompra.reduce((s, i) => s + (i.valor_consumido ?? 0), 0)
    return {
      etapas: etapas.length,
      orcado,
      consumido,
      saldo: orcado - consumido,
      pct: orcado > 0 ? (consumido / orcado) * 100 : 0,
    }
  }, [etapas, itensCompra])

  // -- Toggle expand
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // -- Scroll to today
  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return
    const x = getX(today)
    scrollRef.current.scrollLeft = Math.max(0, x - scrollRef.current.clientWidth / 2)
  }, [getX])

  // -- Today line X
  const todayX = getX(today)
  const gridTotalWidth = columns.reduce((s, c) => s + c.width, 0)
  const ROW_HEIGHT = 48
  const SIDEBAR_W = 280

  const isLoading = loadingEtapas

  return (
    <div>
      <PageHeader title="Cronograma" description="Gantt interativo por casas" icon={CalendarRange} />

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="Etapas" value={String(totals.etapas)} />
        <SummaryCard label="Orçado" value={formatCurrency(totals.orcado)} />
        <SummaryCard label="Consumido" value={formatCurrency(totals.consumido)} accent="amber" />
        <SummaryCard label="Saldo" value={formatCurrency(totals.saldo)} accent={totals.saldo >= 0 ? 'emerald' : 'red'} />
        <SummaryCard label="Execução" value={`${totals.pct.toFixed(1)}%`} />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Zoom */}
        <div className="flex rounded-lg border bg-card">
          {(['dia', 'semana', 'mes'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                zoom === z ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              } ${z === 'dia' ? 'rounded-l-lg' : z === 'mes' ? 'rounded-r-lg' : ''}`}
            >
              {z === 'mes' ? 'Mês' : z === 'dia' ? 'Dia' : 'Semana'}
            </button>
          ))}
        </div>

        <button onClick={scrollToToday} className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
          <Crosshair className="h-3.5 w-3.5" /> Hoje
        </button>

        {/* Filter */}
        <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            className="bg-transparent text-xs font-medium text-muted-foreground outline-none"
          >
            <option value="todas">Todas</option>
            <option value="em_andamento">Em andamento</option>
            <option value="atrasado">Atrasadas</option>
          </select>
        </div>

        <button
          onClick={() => { setEditingEtapa(null); setShowModal(true) }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Nova etapa
        </button>

        <div className="ml-auto text-[10px] text-muted-foreground">
          {filteredEtapas.length} etapa(s)
        </div>
      </div>

      {/* Gantt Container */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredEtapas.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed">
          <div className="text-center">
            <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma etapa cadastrada</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Vá para Importação para começar</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Header row */}
          <div className="flex border-b">
            {/* Sidebar header */}
            <div className="flex shrink-0 items-center gap-2 border-r bg-muted/30 px-3 py-2" style={{ width: SIDEBAR_W }}>
              <input
                type="checkbox"
                checked={selection.count === filteredEtapas.length && filteredEtapas.length > 0}
                onChange={() => selection.toggleAll(filteredEtapas.map(e => e.id))}
                className="h-3.5 w-3.5 rounded border-muted-foreground/30 accent-primary"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa</span>
            </div>
            {/* Timeline header */}
            <div className="flex-1 overflow-hidden">
              <div ref={scrollRef} className="overflow-x-auto" style={{ scrollBehavior: 'smooth' }}>
                <div className="relative flex" style={{ width: gridTotalWidth, minHeight: 32 }}>
                  {columns.map((col, i) => (
                    <div
                      key={i}
                      className="shrink-0 border-r border-dashed border-border/40 py-2 text-center text-[10px] font-medium text-muted-foreground"
                      style={{ width: col.width }}
                    >
                      {col.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {filteredEtapas.map((etapa) => {
              const expanded = expandedIds.has(etapa.id)
              const cfg = STATUS_CFG[etapa.status]
              const StatusIcon = cfg.icon
              const dists = distByEtapa.get(etapa.id) ?? []
              const items = itemsByEtapa.get(etapa.id)

              return (
                <div key={etapa.id}>
                  {/* Main row */}
                  <div
                    className="group flex border-b hover:bg-muted/20"
                    draggable
                    onDragStart={() => setDragId(etapa.id)}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5') }}
                    onDragLeave={(e) => e.currentTarget.classList.remove('bg-primary/5')}
                    onDrop={async (e) => {
                      e.currentTarget.classList.remove('bg-primary/5')
                      if (dragId && dragId !== etapa.id) {
                        const sourceEtapa = etapas.find(et => et.id === dragId)
                        if (sourceEtapa) {
                          await updateEtapa.mutateAsync({ id: dragId, ordem: etapa.ordem })
                          await updateEtapa.mutateAsync({ id: etapa.id, ordem: sourceEtapa.ordem })
                          toast.success('Ordem atualizada')
                        }
                      }
                      setDragId(null)
                    }}
                  >
                    {/* Sidebar */}
                    <div
                      className="flex shrink-0 items-center gap-1 border-r px-2"
                      style={{ width: SIDEBAR_W, minHeight: ROW_HEIGHT }}
                    >
                      <input
                        type="checkbox"
                        checked={selection.isSelected(etapa.id)}
                        onChange={() => selection.toggle(etapa.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-muted-foreground/30 accent-primary"
                        onClick={e => e.stopPropagation()}
                      />
                      <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing" />

                      <button
                        onClick={() => toggleExpand(etapa.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                      >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">{etapa.codigo}</span>
                          <span className="truncate text-xs font-medium">{etapa.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{etapa.casas_total} casas</span>
                          <span>{formatCurrency(etapa.valor_total_orcado ?? 0)}</span>
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      {/* Quick actions */}
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => { setEditingEtapa(etapa); setShowModal(true) }} className="rounded p-1 hover:bg-accent" title="Editar">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => { if (window.confirm(`Excluir etapa "${etapa.nome}" e todos os seus itens associados?`)) deleteEtapa.mutate(etapa.id) }} className="rounded p-1 hover:bg-red-500/10 text-red-500" title="Excluir">
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <button onClick={() => navigate(`/compras?etapa=${etapa.id}`)} className="rounded p-1 hover:bg-accent" title="Ver compras">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {/* Timeline bar area */}
                    <div className="flex-1 overflow-hidden">
                      <div
                        className="relative"
                        style={{ width: gridTotalWidth, height: ROW_HEIGHT }}
                      >
                        {/* Grid lines */}
                        {columns.map((col, i) => (
                          <div
                            key={i}
                            className="absolute top-0 h-full border-r border-dashed border-border/20"
                            style={{ left: getX(col.date), width: 0 }}
                          />
                        ))}

                        {/* Today line */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-red-500/60"
                          style={{ left: todayX }}
                        />

                        {/* Medicao markers */}
                        {medicoes.map((m) => m.data_prevista && (
                          <div
                            key={m.id}
                            className="absolute top-0 h-full border-l border-dashed border-emerald-500/40"
                            style={{ left: getX(m.data_prevista) }}
                          >
                            <span className="absolute -top-0 left-0.5 text-[8px] font-bold text-emerald-600">M{m.numero}</span>
                          </div>
                        ))}

                        {/* Planned bar */}
                        {etapa.data_inicio_plan && etapa.data_fim_plan && (
                          <GanttBar
                            startX={getX(etapa.data_inicio_plan)}
                            endX={getX(etapa.data_fim_plan)}
                            color={`${cfg.bar}/30`}
                            height={12}
                            top={10}
                            dists={dists}
                            getX={getX}
                            etapa={etapa}
                          />
                        )}

                        {/* Real progress bar */}
                        {etapa.data_inicio_real && (
                          <div
                            className={`absolute rounded-sm ${cfg.bar}`}
                            style={{
                              left: getX(etapa.data_inicio_real),
                              width: Math.max(4, getX(etapa.data_fim_real ?? todayStr) - getX(etapa.data_inicio_real)),
                              top: 28,
                              height: 6,
                              opacity: 0.8,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded sub-rows */}
                  {expanded && items && (
                    <ExpandedSubRows
                      items={items}
                      etapa={etapa}
                      getX={getX}
                      gridWidth={gridTotalWidth}
                      sidebarW={SIDEBAR_W}
                      todayX={todayX}
                      navigate={navigate}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <CronogramaBulkActions
          etapas={etapas}
          selectedIds={selection.selected}
          onDone={selection.clear}
        />
      </BulkActionBar>

      {/* Etapa Modal (create + edit) */}
      {showModal && (
        <EtapaModal
          etapa={editingEtapa}
          allEtapas={etapas}
          onClose={() => { setShowModal(false); setEditingEtapa(null) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : ''
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gantt Bar with house blocks
// ---------------------------------------------------------------------------

function GanttBar({
  startX, endX, color, height, top, dists, getX, etapa,
}: {
  startX: number; endX: number; color: string; height: number; top: number
  dists: Distribuicao[]; getX: (d: string | Date) => number; etapa: Etapa
}) {
  const barWidth = Math.max(8, endX - startX)

  return (
    <div className="absolute rounded-sm" style={{ left: startX, width: barWidth, top, height, background: 'transparent' }}>
      {/* Background bar */}
      <div className={`absolute inset-0 rounded-sm ${color.includes('/') ? '' : ''}`} style={{ backgroundColor: `hsl(var(--primary) / 0.12)` }} />

      {/* House blocks inside */}
      {dists.length > 0 ? (
        dists.map((d) => {
          if (!d.data_inicio && !d.data_fim) return null
          const blockDate = d.data_inicio ?? d.data_fim!
          const blockX = getX(blockDate) - startX
          const blockW = d.data_fim && d.data_inicio
            ? Math.max(6, getX(d.data_fim) - getX(d.data_inicio))
            : Math.max(6, barWidth / (dists.length || 1))

          const isCompleted = d.casas_realizadas >= d.casas_planejadas
          const hasProgress = d.casas_realizadas > 0

          return (
            <div
              key={d.id}
              className="absolute top-0 flex items-center justify-center rounded-[2px] transition-transform hover:scale-y-150"
              style={{
                left: Math.max(0, Math.min(blockX, barWidth - 6)),
                width: Math.min(blockW, barWidth),
                height,
                backgroundColor: isCompleted
                  ? 'rgb(34 197 94 / 0.7)' // green
                  : hasProgress
                  ? 'rgb(59 130 246 / 0.5)' // blue
                  : 'rgb(148 163 184 / 0.4)', // slate
              }}
              title={`M${d.medicao_numero}: ${d.casas_planejadas} casas plan. / ${d.casas_realizadas} realizadas${d.data_inicio ? ` — ${d.data_inicio}` : ''}`}
            >
              <span className="text-[7px] font-bold text-white drop-shadow-sm">
                {d.casas_planejadas}
              </span>
            </div>
          )
        })
      ) : (
        /* Fallback: single block spanning the full bar */
        <div
          className="absolute inset-0 rounded-sm"
          style={{ backgroundColor: 'rgb(148 163 184 / 0.35)' }}
          title={`${etapa.nome}: ${etapa.casas_total} casas`}
        >
          <span className="flex h-full items-center px-1 text-[8px] font-semibold text-white/80">
            {etapa.casas_total} casas
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expanded sub-rows (MATERIAL / MAO_DE_OBRA / EQUIPAMENTO)
// ---------------------------------------------------------------------------

function ExpandedSubRows({
  items, etapa, getX, gridWidth, sidebarW, todayX, navigate,
}: {
  items: { MATERIAL: ItemCompra[]; MAO_DE_OBRA: ItemCompra[]; EQUIPAMENTO: ItemCompra[] }
  etapa: Etapa
  getX: (d: string | Date) => number
  gridWidth: number
  sidebarW: number
  todayX: number
  navigate: (path: string) => void
}) {
  const types = [
    { key: 'MATERIAL', label: 'Material', items: items.MATERIAL },
    { key: 'MAO_DE_OBRA', label: 'Mão de Obra', items: items.MAO_DE_OBRA },
    { key: 'EQUIPAMENTO', label: 'Equipamento', items: items.EQUIPAMENTO },
  ] as const

  return (
    <>
      {types.map(({ key, label, items: typeItems }) => {
        if (typeItems.length === 0) return null
        const orcado = typeItems.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
        const consumido = typeItems.reduce((s, i) => s + (i.valor_consumido ?? 0), 0)
        const saldo = orcado - consumido
        const pct = orcado > 0 ? (consumido / orcado) * 100 : 0
        const fornecedores = [...new Set(typeItems.map((i) => i.fornecedor_nome).filter(Boolean))]

        return (
          <div key={key} className="flex border-b bg-muted/10">
            {/* Sub sidebar */}
            <div className="flex shrink-0 items-center gap-2 border-r px-2 pl-10" style={{ width: sidebarW, minHeight: 36 }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
                  {fornecedores.length > 0 && (
                    <span className="truncate text-[9px] text-muted-foreground/60">
                      {fornecedores[0]}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span>{formatCurrency(orcado)}</span>
                  <span className="text-amber-500">{formatCurrency(consumido)}</span>
                  <span className={saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}>{formatCurrency(saldo)}</span>
                  <div className="h-1 w-12 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span>{pct.toFixed(0)}%</span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/compras?etapa=${etapa.id}`)}
                className="rounded p-0.5 text-muted-foreground/40 hover:text-primary"
                title="Ver compras"
              >
                <Eye className="h-3 w-3" />
              </button>
            </div>

            {/* Timeline */}
            <div className="relative flex-1" style={{ width: gridWidth, height: 36 }}>
              {/* Today line */}
              <div className="absolute top-0 h-full w-0.5 bg-red-500/30" style={{ left: todayX }} />

              {/* Simple progress bar in timeline */}
              {etapa.data_inicio_plan && etapa.data_fim_plan && (
                <div
                  className="absolute top-3 h-3 rounded-sm"
                  style={{
                    left: getX(etapa.data_inicio_plan),
                    width: Math.max(4, getX(etapa.data_fim_plan) - getX(etapa.data_inicio_plan)),
                    backgroundColor: key === 'MATERIAL' ? 'rgb(59 130 246 / 0.25)'
                      : key === 'MAO_DE_OBRA' ? 'rgb(168 85 247 / 0.25)'
                      : 'rgb(249 115 22 / 0.25)',
                  }}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: key === 'MATERIAL' ? 'rgb(59 130 246 / 0.7)'
                        : key === 'MAO_DE_OBRA' ? 'rgb(168 85 247 / 0.7)'
                        : 'rgb(249 115 22 / 0.7)',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}


