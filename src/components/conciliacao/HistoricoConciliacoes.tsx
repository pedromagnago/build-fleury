/**
 * Build Fleury — Histórico de Conciliações
 *
 * Lista todas as conciliações (sugeridas/confirmadas/rejeitadas) com filtros e
 * ações de Editar/Desfazer. Exibe trilha de auditoria de eventos passados (undo/edit).
 */
import { useState, useMemo } from 'react'
import {
  CheckCircle2, Clock, XCircle, Pencil, RotateCcw, History,
  Search, Filter, FileWarning, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  useConciliacoes, useUndoConciliacao, useConciliacaoHistory,
} from '@/hooks/useConciliacao'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useParcelas } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { EditConciliacaoDialog } from './EditConciliacaoDialog'

type StatusFilter = 'todos' | 'sugerido' | 'confirmado' | 'rejeitado'

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusBadge(status: string) {
  if (status === 'confirmado') return { Icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600', label: 'Confirmada' }
  if (status === 'sugerido') return { Icon: Clock, cls: 'bg-blue-500/10 text-blue-600', label: 'Sugerida' }
  return { Icon: XCircle, cls: 'bg-red-500/10 text-red-600', label: 'Rejeitada' }
}

export function HistoricoConciliacoes() {
  const { data: concs = [] } = useConciliacoes()
  const { data: movs = [] } = useMovimentacoes()
  const { data: parcelas = [] } = useParcelas()
  const { data: auditLog = [] } = useConciliacaoHistory()
  const undoConc = useUndoConciliacao()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('confirmado')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [showAudit, setShowAudit] = useState(false)

  const movById = useMemo(() => {
    const m = new Map<string, any>()
    for (const x of (movs as any[])) m.set(x.id, x)
    return m
  }, [movs])

  const parcelaById = useMemo(() => {
    const m = new Map<string, any>()
    for (const p of parcelas) m.set(p.id, p)
    return m
  }, [parcelas])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return concs.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false
      if (!q) return true
      const mov = movById.get(c.movimentacao_id)
      const txt = `${mov?.descricao ?? ''} ${mov?.valor ?? ''}`.toLowerCase()
      return txt.includes(q)
    })
  }, [concs, statusFilter, search, movById])

  const counts = useMemo(() => {
    const r = { todos: concs.length, sugerido: 0, confirmado: 0, rejeitado: 0 }
    for (const c of concs) {
      if (c.status === 'sugerido') r.sugerido++
      else if (c.status === 'confirmado') r.confirmado++
      else if (c.status === 'rejeitado') r.rejeitado++
    }
    return r
  }, [concs])

  const handleUndo = async (concId: string) => {
    if (!confirm('Desfazer esta conciliação? As parcelas voltam ao status anterior e a movimentação fica pendente novamente.')) return
    await undoConc.mutateAsync(concId)
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-0.5 text-xs">
          {(['todos', 'confirmado', 'sugerido', 'rejeitado'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[9px] font-bold">
                {counts[s]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição ou valor..."
            className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
        </div>

        <button onClick={() => setShowAudit(v => !v)}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
          <History className="h-3.5 w-3.5" />
          Auditoria ({auditLog.length})
          {showAudit ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {/* Audit log */}
      {showAudit && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Eventos de Conciliação (últimos 200)
          </p>
          {auditLog.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum evento registrado</p>
          ) : (
            <div className="max-h-64 overflow-auto divide-y text-xs">
              {auditLog.map((log: any) => (
                <div key={log.id} className="flex items-center gap-2 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    log.acao === 'UNDO' ? 'bg-red-500/10 text-red-600' :
                    log.acao === 'UPDATE' ? 'bg-blue-500/10 text-blue-600' :
                    'bg-muted text-muted-foreground'
                  }`}>{log.acao}</span>
                  <span className="text-muted-foreground tabular-nums text-[10px]">
                    {fmtDateTime(log.created_at)}
                  </span>
                  <span className="truncate flex-1 text-[11px]">
                    {log.dados_depois?.motivo ?? log.dados_depois?.type ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <FileWarning className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm">Nenhuma conciliação encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ajuste os filtros ou rode a conciliação para ver sugestões
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Data</th>
                <th className="text-left px-3 py-2 font-semibold">Movimento</th>
                <th className="text-right px-3 py-2 font-semibold">Valor</th>
                <th className="text-center px-3 py-2 font-semibold">Parcelas</th>
                <th className="text-right px-3 py-2 font-semibold">Diferença</th>
                <th className="text-center px-3 py-2 font-semibold">Confiança</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(c => {
                const mov = movById.get(c.movimentacao_id)
                const valor = mov ? Number(mov.valor) : 0
                const badge = statusBadge(c.status)
                const links = (c as any).conciliacao_parcelas ?? []
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        <badge.Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {fmtDate(mov?.data)}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={mov?.descricao ?? '—'}>
                      {mov?.descricao ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                      mov?.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {formatCurrency(valor)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {links.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="rounded-full bg-blue-500/10 text-blue-600 px-2 py-0.5 text-[10px] font-bold"
                          title={links.map((l: any) => parcelaById.get(l.parcela_id)?.pedido_item ?? l.parcela_id).join(', ')}>
                          {links.length}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                      Math.abs(Number(c.diferenca)) < 0.01 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {formatCurrency(Number(c.diferenca))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        c.confidence >= 90 ? 'bg-emerald-500/10 text-emerald-600' :
                        c.confidence >= 70 ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {c.confidence}%
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === 'confirmado' && (
                          <>
                            <button onClick={() => setEditing({ conc: c, mov })}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-500/10"
                              title="Editar parcelas vinculadas">
                              <Pencil className="h-3 w-3" />Editar
                            </button>
                            <button onClick={() => handleUndo(c.id)} disabled={undoConc.isPending}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                              title="Desfazer conciliação">
                              <RotateCcw className="h-3 w-3" />Desfazer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditConciliacaoDialog
          conciliacao={editing.conc}
          movimentacao={editing.mov}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
