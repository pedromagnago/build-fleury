import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuditLogs } from '@/hooks/useOperacional'
import { formatDate } from '@/lib/utils'
import { exportToExcel } from '@/lib/exportExcel'
import BulkActionBar from '@/components/BulkActionBar'
import { useSelection } from '@/hooks/useSelection'
import { toast } from 'sonner'
import { Shield, Search, Database, User, Info, Download, Filter } from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

const ACAO_CONFIG: Record<string, { label: string; color: string }> = {
  INSERT: { label: 'Criar', color: 'bg-emerald-500/10 text-emerald-600' },
  UPDATE: { label: 'Editar', color: 'bg-blue-500/10 text-blue-500' },
  DELETE: { label: 'Excluir', color: 'bg-red-500/10 text-red-500' },
  BULK_UPDATE: { label: 'Lote ✏️', color: 'bg-amber-500/10 text-amber-600' },
  BULK_DELETE: { label: 'Lote 🗑️', color: 'bg-red-500/10 text-red-500' },
  BULK_INSERT: { label: 'Lote ➕', color: 'bg-emerald-500/10 text-emerald-600' },
  BULK_PAYMENT: { label: 'Pgto Lote', color: 'bg-teal-500/10 text-teal-600' },
}

type QuickFilter = '' | 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK'

export default function AuditoriaPage() {
  const { restartTour } = useTour('auditoria', pageTours.auditoria)

  const { data: logs = [], isLoading } = useAuditLogs()
  const [search, setSearch] = useState('')
  const [filterTabela, setFilterTabela] = useState('')
  const [filterAcao, setFilterAcao] = useState<QuickFilter>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const selection = useSelection()

  const tabelas = useMemo(() => [...new Set(logs.map((l) => l.tabela))].sort(), [logs])

  const filtered = useMemo(() => logs.filter((l) => {
    const matchSearch = l.tabela.toLowerCase().includes(search.toLowerCase()) ||
      (l.agente ?? '').toLowerCase().includes(search.toLowerCase()) ||
      l.acao.toLowerCase().includes(search.toLowerCase())
    const matchTabela = !filterTabela || l.tabela === filterTabela
    const matchAcao = !filterAcao || (filterAcao === 'BULK' ? l.acao.startsWith('BULK') : l.acao === filterAcao)
    return matchSearch && matchTabela && matchAcao
  }), [logs, search, filterTabela, filterAcao])

  const handleExport = () => {
    const selected = filtered.filter(l => selection.selected.has(l.id))
    const data = (selected.length > 0 ? selected : filtered).map(l => ({
      'Data': formatDate(l.created_at),
      'Ação': l.acao,
      'Tabela': l.tabela,
      'Agente': l.agente ?? 'Sistema',
      'Registro ID': l.registro_id ?? '',
      'Dados Antes': l.dados_antes ? JSON.stringify(l.dados_antes) : '',
      'Dados Depois': l.dados_depois ? JSON.stringify(l.dados_depois) : '',
    }))
    exportToExcel(data, `auditoria_${new Date().toISOString().split('T')[0]}`, 'Logs')
    toast.success(`${data.length} registros exportados`)
  }

  // Stats
  const stats = useMemo(() => ({
    total: filtered.length,
    creates: filtered.filter(l => l.acao === 'INSERT' || l.acao === 'BULK_INSERT').length,
    updates: filtered.filter(l => l.acao === 'UPDATE' || l.acao === 'BULK_UPDATE').length,
    deletes: filtered.filter(l => l.acao === 'DELETE' || l.acao === 'BULK_DELETE').length,
    bulk: filtered.filter(l => l.acao.startsWith('BULK')).length,
  }), [filtered])

  return (
    <div>
      <PageHeader title="Auditoria" description="Registro de alterações no sistema" icon={Shield} onHelp={restartTour} />

      {/* Quick filters */}
      <div id="tour-audit-indicators" className="mb-3 flex flex-wrap items-center gap-2">
        <QuickFilterBtn label="Todos" count={stats.total} active={filterAcao === ''} onClick={() => setFilterAcao('')} />
        <QuickFilterBtn label="Criar" count={stats.creates} active={filterAcao === 'INSERT'} onClick={() => setFilterAcao('INSERT')} color="emerald" />
        <QuickFilterBtn label="Editar" count={stats.updates} active={filterAcao === 'UPDATE'} onClick={() => setFilterAcao('UPDATE')} color="blue" />
        <QuickFilterBtn label="Excluir" count={stats.deletes} active={filterAcao === 'DELETE'} onClick={() => setFilterAcao('DELETE')} color="red" />
        <QuickFilterBtn label="Operações em lote" count={stats.bulk} active={filterAcao === 'BULK'} onClick={() => setFilterAcao('BULK')} color="amber" />
        <div className="ml-auto">
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
        </div>
      </div>

      {/* Search & table filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tabela, ação ou agente..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select value={filterTabela} onChange={(e) => setFilterTabela(e.target.value)} className="bg-transparent text-xs font-medium text-muted-foreground outline-none">
            <option value="">Todas tabelas</option>
            {tabelas.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-2 text-xs text-muted-foreground">{filtered.length} registros</div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed"><p className="text-sm text-muted-foreground">Nenhum log de auditoria</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const cfg = ACAO_CONFIG[log.acao] ?? { label: log.acao, color: 'bg-slate-500/10 text-slate-500' }
            const isExpanded = expandedId === log.id
            return (
              <div key={log.id} className={`rounded-xl border bg-card transition-shadow hover:shadow-sm ${selection.isSelected(log.id) ? 'ring-2 ring-primary/30' : ''}`}>
                <div className="flex w-full items-center gap-3 p-4">
                  <input type="checkbox"
                    checked={selection.isSelected(log.id)}
                    onChange={() => selection.toggle(log.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded accent-primary" />
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Database className="h-3 w-3" />{log.tabela}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />{log.agente ?? 'Sistema'}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(log.created_at)}</span>
                    <Info className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t px-4 py-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      {log.dados_antes && (
                        <div>
                          <p className="mb-1 text-[10px] font-medium text-red-500">ANTES</p>
                          <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 text-[10px] font-mono">
                            {JSON.stringify(log.dados_antes, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.dados_depois && (
                        <div>
                          <p className="mb-1 text-[10px] font-medium text-emerald-500">DEPOIS</p>
                          <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 text-[10px] font-mono">
                            {JSON.stringify(log.dados_depois, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bulk Action Bar (export selected) */}
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
  const baseColor = color
    ? `${active ? `bg-${color}-500/20 text-${color}-600 border-${color}-500/30` : 'border-border text-muted-foreground hover:bg-accent'}`
    : `${active ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:bg-accent'}`

  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors ${baseColor}`}>
      {label}
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{count}</span>
    </button>
  )
}
