import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuditLogs, type AuditLog } from '@/hooks/useOperacional'
import { formatDate } from '@/lib/utils'
import { exportToExcel } from '@/lib/exportExcel'
import BulkActionBar from '@/components/BulkActionBar'
import { useSelection } from '@/hooks/useSelection'
import { toast } from 'sonner'
import {
  Shield, Search, Database, User, Download, Filter,
  ChevronDown, ChevronRight, ArrowRight, Clock,
  FileText, Trash2, Pencil, Plus, Package, CreditCard, Upload,
  Activity
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// ── Action config ──
const ACAO_CONFIG: Record<string, { label: string; color: string; icon: typeof Plus; bgRow: string }> = {
  INSERT:       { label: 'Criar',       color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20', icon: Plus,       bgRow: 'border-l-emerald-500' },
  UPDATE:       { label: 'Editar',      color: 'bg-blue-500/15 text-blue-500 border-blue-500/20',         icon: Pencil,     bgRow: 'border-l-blue-500' },
  DELETE:       { label: 'Excluir',     color: 'bg-red-500/15 text-red-500 border-red-500/20',             icon: Trash2,     bgRow: 'border-l-red-500' },
  BULK_UPDATE:  { label: 'Lote ✏️',     color: 'bg-amber-500/15 text-amber-600 border-amber-500/20',       icon: Package,    bgRow: 'border-l-amber-500' },
  BULK_DELETE:  { label: 'Lote 🗑️',     color: 'bg-red-500/15 text-red-500 border-red-500/20',             icon: Trash2,     bgRow: 'border-l-red-500' },
  BULK_INSERT:  { label: 'Lote ➕',     color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20', icon: Upload,     bgRow: 'border-l-emerald-500' },
  BULK_PAYMENT: { label: 'Pgto Lote',  color: 'bg-teal-500/15 text-teal-600 border-teal-500/20',         icon: CreditCard, bgRow: 'border-l-teal-500' },
  IMPORT:       { label: 'Importação', color: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',   icon: Upload,     bgRow: 'border-l-indigo-500' },
  SIMULATION_APPLY: { label: 'Simulação', color: 'bg-violet-500/15 text-violet-600 border-violet-500/20', icon: Activity, bgRow: 'border-l-violet-500' },
}

const TABELA_LABEL: Record<string, string> = {
  etapas: 'Etapas', pedidos: 'Pedidos', parcelas: 'Parcelas',
  itens_compra: 'Itens de Compra', fornecedores: 'Fornecedores',
  medicoes: 'Medições', cronograma_distribuicao: 'Distribuições',
  documentos: 'Documentos', despesas_indiretas: 'Despesas Indiretas',
  pagamentos: 'Pagamentos', wbs: 'WBS',
}

type QuickFilter = '' | 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK'
type DateRange = 'all' | 'today' | '7d' | '30d'

function isToday(d: string) {
  return new Date(d).toDateString() === new Date().toDateString()
}
function isWithin(d: string, days: number) {
  return Date.now() - new Date(d).getTime() < days * 86400000
}

// ── Relative time ──
function timeAgo(d: string) {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (sec < 60) return 'agora'
  if (sec < 3600) return `${Math.floor(sec / 60)}min atrás`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h atrás`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d atrás`
  return formatDate(d)
}

// ── Diff viewer ──
function DiffViewer({ antes, depois }: { antes?: Record<string, unknown> | null; depois?: Record<string, unknown> | null }) {
  if (!antes && !depois) return <p className="text-[10px] text-muted-foreground italic">Sem dados detalhados</p>

  // For bulk operations, show summary
  if (antes && (antes as any).type?.startsWith('bulk')) {
    const ids = (antes as any).ids as string[] | undefined
    const qtd = (antes as any).qtd ?? ids?.length ?? '?'
    return (
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-[10px] font-medium text-muted-foreground mb-1">Operação em lote</p>
        <p className="text-xs"><span className="font-medium">{qtd}</span> registros afetados</p>
        {ids && ids.length <= 5 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {ids.map(id => <span key={id} className="text-[9px] font-mono bg-muted rounded px-1.5 py-0.5">{id.slice(0, 8)}…</span>)}
          </div>
        )}
      </div>
    )
  }

  // For single operations, show field-by-field diff
  if (antes && depois) {
    const allKeys = [...new Set([...Object.keys(antes), ...Object.keys(depois)])]
      .filter(k => !['id', 'company_id', 'created_at', 'updated_at'].includes(k))
    const changes = allKeys.filter(k => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    const unchanged = allKeys.filter(k => JSON.stringify(antes[k]) === JSON.stringify(depois[k]))

    if (changes.length === 0) return <p className="text-[10px] text-muted-foreground italic">Sem alterações detectadas</p>

    return (
      <div className="space-y-1.5">
        {changes.map(k => (
          <div key={k} className="flex items-start gap-2 text-[11px] rounded-lg bg-muted/30 px-2.5 py-1.5">
            <span className="font-medium text-muted-foreground min-w-[100px] shrink-0">{k}:</span>
            <span className="text-red-500 line-through">{fmt(antes[k])}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-emerald-600 font-medium">{fmt(depois[k])}</span>
          </div>
        ))}
        {unchanged.length > 0 && (
          <p className="text-[9px] text-muted-foreground">{unchanged.length} campos inalterados</p>
        )}
      </div>
    )
  }

  // Single-side data (INSERT or DELETE)
  const data = depois || antes
  if (!data) return null

  const label = depois ? 'Dados criados' : 'Dados removidos'
  const color = depois ? 'text-emerald-600' : 'text-red-500'
  const entries = Object.entries(data).filter(([k]) => !['id', 'company_id', 'created_at', 'updated_at', 'type'].includes(k))

  return (
    <div>
      <p className={`text-[10px] font-medium mb-1.5 ${color}`}>{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {entries.slice(0, 12).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <span className="text-muted-foreground font-medium">{k}:</span>
            <span className="truncate">{fmt(v)}</span>
          </div>
        ))}
        {entries.length > 12 && <p className="text-[9px] text-muted-foreground col-span-2">+{entries.length - 12} campos</p>}
      </div>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return formatDate(v)
    return v.length > 60 ? v.slice(0, 60) + '…' : v
  }
  return JSON.stringify(v).slice(0, 50)
}

// ── Activity mini-chart ──
function ActivityChart({ logs }: { logs: AuditLog[] }) {
  const days = useMemo(() => {
    const buckets = new Map<string, number>()
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      buckets.set(d.toISOString().split('T')[0]!, 0)
    }
    logs.forEach(l => {
      const dk = new Date(l.created_at).toISOString().split('T')[0]!
      if (buckets.has(dk)) buckets.set(dk, (buckets.get(dk) || 0) + 1)
    })
    return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
  }, [logs])

  const max = Math.max(...days.map(d => d.count), 1)

  return (
    <div className="flex items-end gap-[3px] h-[40px]">
      {days.map(d => (
        <div key={d.date} className="group relative flex-1 min-w-[6px]">
          <div
            className="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors"
            style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
          />
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border rounded px-2 py-1 text-[9px] shadow-lg whitespace-nowrap z-50">
            {d.date.split('-').slice(1).join('/')}: {d.count} ações
          </div>
        </div>
      ))}
    </div>
  )
}

// ── MAIN ──
export default function AuditoriaPage() {
  const { restartTour } = useTour('auditoria', pageTours.auditoria)
  const { data: logs = [], isLoading } = useAuditLogs()
  const [search, setSearch] = useState('')
  const [filterTabela, setFilterTabela] = useState('')
  const [filterAcao, setFilterAcao] = useState<QuickFilter>('')
  const [filterDate, setFilterDate] = useState<DateRange>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const selection = useSelection()

  const tabelas = useMemo(() => [...new Set(logs.map(l => l.tabela))].sort(), [logs])

  const filtered = useMemo(() => logs.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || l.tabela.toLowerCase().includes(q)
      || (l.agente ?? '').toLowerCase().includes(q)
      || l.acao.toLowerCase().includes(q)
      || (l.resumo ?? '').toLowerCase().includes(q)
      || (l.user_email ?? '').toLowerCase().includes(q)
    const matchTabela = !filterTabela || l.tabela === filterTabela
    const matchAcao = !filterAcao || (filterAcao === 'BULK' ? l.acao.startsWith('BULK') : l.acao === filterAcao)
    const matchDate = filterDate === 'all'
      || (filterDate === 'today' && isToday(l.created_at))
      || (filterDate === '7d' && isWithin(l.created_at, 7))
      || (filterDate === '30d' && isWithin(l.created_at, 30))
    return matchSearch && matchTabela && matchAcao && matchDate
  }), [logs, search, filterTabela, filterAcao, filterDate])

  const handleExport = () => {
    const selected = filtered.filter(l => selection.selected.has(l.id))
    const data = (selected.length > 0 ? selected : filtered).map(l => ({
      'Data': formatDate(l.created_at),
      'Ação': l.acao,
      'Tabela': l.tabela,
      'Usuário': l.user_email ?? l.agente ?? 'Sistema',
      'Resumo': l.resumo ?? '',
      'Registro ID': l.registro_id ?? '',
      'Dados Antes': l.dados_antes ? JSON.stringify(l.dados_antes) : '',
      'Dados Depois': l.dados_depois ? JSON.stringify(l.dados_depois) : '',
    }))
    exportToExcel(data, `auditoria_${new Date().toISOString().split('T')[0]!}`, 'Logs')
    toast.success(`${data.length} registros exportados`)
  }

  const stats = useMemo(() => ({
    total: filtered.length,
    creates: filtered.filter(l => l.acao === 'INSERT' || l.acao === 'BULK_INSERT').length,
    updates: filtered.filter(l => l.acao === 'UPDATE' || l.acao === 'BULK_UPDATE').length,
    deletes: filtered.filter(l => l.acao === 'DELETE' || l.acao === 'BULK_DELETE').length,
    bulk: filtered.filter(l => l.acao.startsWith('BULK')).length,
  }), [filtered])

  // Group by date
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, AuditLog[]>()
    filtered.forEach(l => {
      const dk = new Date(l.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
      if (!groups.has(dk)) groups.set(dk, [])
      groups.get(dk)!.push(l)
    })
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div>
      <PageHeader title="Auditoria" description="Quem fez, o que fez, quando e o impacto" icon={Shield} onHelp={restartTour} />

      {/* Activity chart */}
      <div id="tour-audit-chart" className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">Atividade nos últimos 14 dias</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{stats.creates} criações</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />{stats.updates} edições</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{stats.deletes} exclusões</span>
          </div>
        </div>
        <ActivityChart logs={logs} />
      </div>

      {/* Quick filters */}
      <div id="tour-audit-indicators" className="mb-3 flex flex-wrap items-center gap-2">
        <QuickFilterBtn label="Todos" count={stats.total} active={filterAcao === ''} onClick={() => setFilterAcao('')} />
        <QuickFilterBtn label="Criar" count={stats.creates} active={filterAcao === 'INSERT'} onClick={() => setFilterAcao('INSERT')} color="emerald" />
        <QuickFilterBtn label="Editar" count={stats.updates} active={filterAcao === 'UPDATE'} onClick={() => setFilterAcao('UPDATE')} color="blue" />
        <QuickFilterBtn label="Excluir" count={stats.deletes} active={filterAcao === 'DELETE'} onClick={() => setFilterAcao('DELETE')} color="red" />
        <QuickFilterBtn label="Em lote" count={stats.bulk} active={filterAcao === 'BULK'} onClick={() => setFilterAcao('BULK')} color="amber" />
        <div className="ml-auto flex items-center gap-2">
          <select value={filterDate} onChange={e => setFilterDate(e.target.value as DateRange)} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium bg-transparent outline-none">
            <option value="all">Todo período</option>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
        </div>
      </div>

      {/* Search & table filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por tabela, ação, usuário ou resumo..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select value={filterTabela} onChange={e => setFilterTabela(e.target.value)} className="bg-transparent text-xs font-medium text-muted-foreground outline-none">
            <option value="">Todas tabelas</option>
            {tabelas.map(t => <option key={t} value={t}>{TABELA_LABEL[t] || t}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-2 text-xs text-muted-foreground flex items-center gap-2">
        <FileText className="h-3.5 w-3.5" />
        {filtered.length} registros {filterDate !== 'all' && `(${filterDate === 'today' ? 'hoje' : filterDate === '7d' ? '7 dias' : '30 dias'})`}
      </div>

      {/* Main content */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
          <div className="text-center">
            <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum log de auditoria</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(([dayLabel, dayLogs]) => (
            <div key={dayLabel}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{dayLabel}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium">{dayLogs.length}</span>
                <div className="flex-1 border-t border-dashed" />
              </div>

              {/* Day entries */}
              <div className="space-y-1.5 ml-2 border-l-2 border-muted/50 pl-4">
                {dayLogs.map(log => {
                  const cfg = ACAO_CONFIG[log.acao] ?? { label: log.acao, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', icon: FileText, bgRow: 'border-l-slate-400' }
                  const Icon = cfg.icon
                  const isExpanded = expandedId === log.id
                  const displayName = log.user_email
                    ? log.user_email.split('@')[0]
                    : log.agente ?? 'Sistema'

                  return (
                    <div key={log.id} className={`rounded-xl border bg-card border-l-4 ${cfg.bgRow} transition-all hover:shadow-sm ${selection.isSelected(log.id) ? 'ring-2 ring-primary/30' : ''}`}>
                      <div className="flex w-full items-center gap-3 px-4 py-3">
                        <input type="checkbox"
                          checked={selection.isSelected(log.id)}
                          onChange={() => selection.toggle(log.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded accent-primary" />
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="flex flex-1 items-center gap-3 text-left min-w-0"
                        >
                          {/* Action badge */}
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cfg.color}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>

                          {/* Summary */}
                          <span className="text-xs font-medium truncate flex-1">
                            {log.resumo || `${log.acao} em ${TABELA_LABEL[log.tabela] || log.tabela}`}
                          </span>

                          {/* Table badge */}
                          <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                            <Database className="h-2.5 w-2.5" />{TABELA_LABEL[log.tabela] || log.tabela}
                          </span>

                          {/* User */}
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                            <User className="h-3 w-3" />{displayName}
                          </span>

                          {/* Time */}
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(log.created_at)}</span>

                          {/* Expand indicator */}
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        </button>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t px-4 py-3 bg-muted/5">
                          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                            <DiffViewer antes={log.dados_antes} depois={log.dados_depois} />
                            <div className="text-[10px] text-muted-foreground space-y-1 sm:text-right">
                              <p><span className="font-medium">Horário:</span> {new Date(log.created_at).toLocaleTimeString('pt-BR')}</p>
                              {log.user_email && <p><span className="font-medium">E-mail:</span> {log.user_email}</p>}
                              {log.registro_id && <p><span className="font-medium">ID:</span> <span className="font-mono">{log.registro_id.slice(0, 12)}…</span></p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent">
          <Download className="h-3.5 w-3.5" /> Exportar selecionados
        </button>
      </BulkActionBar>
    </div>
  )
}

function QuickFilterBtn({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string
}) {
  const base = active
    ? (color ? `bg-${color}-500/20 text-${color}-600 border-${color}-500/30` : 'bg-primary/10 text-primary border-primary/30')
    : 'border-border text-muted-foreground hover:bg-accent'

  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors ${base}`}>
      {label}
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{count}</span>
    </button>
  )
}
