import { useMemo, useState } from 'react'
import { FileText, Trash2, Calendar, Hash, ChevronDown, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface ImportBatch {
  batchTime: string       // created_at truncated to minute
  count: number
  dataInicio: string
  dataFim: string
  totalEntradas: number
  totalSaidas: number
  conciliadas: number
  ids: string[]
}

interface ExtratosManagerProps {
  movimentacoes: any[]
  onRefresh: () => void
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function ExtratosManager({ movimentacoes, onRefresh }: ExtratosManagerProps) {
  const qc = useQueryClient()
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null)
  const [deletingBatch, setDeletingBatch] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const batches = useMemo<ImportBatch[]>(() => {
    if (!movimentacoes.length) return []
    
    // Group movinentacoes by created_at truncated to minute
    const groups = new Map<string, any[]>()
    for (const mov of movimentacoes) {
      const created = mov.created_at || ''
      // Truncate to minute
      const key = created.slice(0, 16) // "2026-04-16T00:41"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(mov)
    }

    const result: ImportBatch[] = []
    for (const [batchTime, items] of groups.entries()) {
      const dates = items.map((m: any) => m.data).filter(Boolean).sort()
      result.push({
        batchTime,
        count: items.length,
        dataInicio: dates[0] || '',
        dataFim: dates[dates.length - 1] || '',
        totalEntradas: items.filter((m: any) => m.tipo !== 'saida').reduce((s: number, m: any) => s + Number(m.valor), 0),
        totalSaidas: items.filter((m: any) => m.tipo === 'saida').reduce((s: number, m: any) => s + Number(m.valor), 0),
        conciliadas: items.filter((m: any) => m.conciliado).length,
        ids: items.map((m: any) => m.id),
      })
    }

    // Sort by batch time descending (newest first)
    result.sort((a, b) => b.batchTime.localeCompare(a.batchTime))
    return result
  }, [movimentacoes])

  const handleDeleteBatch = async (batchIndex: number) => {
    const batch = batches[batchIndex]
    if (!batch) return
    setDeletingBatch(batchIndex)
    try {
      // Delete in chunks of 50 to avoid timeout
      const chunks = []
      for (let i = 0; i < batch.ids.length; i += 50) {
        chunks.push(batch.ids.slice(i, i + 50))
      }
      for (const chunk of chunks) {
        const { error } = await supabase
          .from('movimentacoes_bancarias')
          .delete()
          .in('id', chunk)
        if (error) throw error
      }

      // Also delete related conciliacoes
      await supabase
        .from('conciliacoes')
        .delete()
        .in('movimentacao_id', batch.ids)

      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      toast.success(`Lote removido: ${batch.count} movimentações excluídas`)
      setConfirmDelete(null)
      onRefresh()
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message)
    } finally {
      setDeletingBatch(null)
    }
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-6 text-center text-muted-foreground">
        <FileText className="mx-auto mb-2 h-8 w-8 opacity-20" />
        <p className="text-sm font-medium">Nenhum extrato importado</p>
        <p className="text-xs mt-1">Importe um arquivo OFX ou JSON para começar.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Extratos Importados
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            {batches.length} lote(s) · {movimentacoes.length} movimentações
          </span>
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Histórico de importações. Exclua lotes duplicados ou incorretos.
        </p>
      </div>

      <div className="divide-y max-h-[400px] overflow-y-auto">
        {batches.map((batch, idx) => {
          const isExpanded = expandedBatch === idx
          const pctConc = batch.count > 0 ? Math.round((batch.conciliadas / batch.count) * 100) : 0
          const isDeleting = deletingBatch === idx
          const isConfirming = confirmDelete === idx

          return (
            <div key={batch.batchTime} className="group">
              {/* Batch header */}
              <div 
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedBatch(isExpanded ? null : idx)}
              >
                {isExpanded 
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                }

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold">
                      {fmtDate(batch.dataInicio)} → {fmtDate(batch.dataFim)}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      <Hash className="inline h-2.5 w-2.5 -mt-px" /> {batch.count} transações
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Importado em {fmtDateTime(batch.batchTime)}
                  </p>
                </div>

                {/* Mini stats */}
                <div className="flex items-center gap-3 text-[10px] tabular-nums flex-shrink-0">
                  <span className="text-emerald-600 font-bold">+{fmt(batch.totalEntradas)}</span>
                  <span className="text-red-500 font-bold">-{fmt(batch.totalSaidas)}</span>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-emerald-500 transition-all" 
                        style={{ width: `${pctConc}%` }} 
                      />
                    </div>
                    <span className="text-muted-foreground">{pctConc}%</span>
                  </div>
                </div>

                {/* Delete button */}
                <div className="flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 animate-in slide-in-from-right-2 duration-150">
                      <button 
                        onClick={() => handleDeleteBatch(idx)}
                        disabled={isDeleting}
                        className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Confirmar
                      </button>
                      <button 
                        onClick={() => setConfirmDelete(null)}
                        className="rounded border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmDelete(idx)}
                      className="rounded border p-1.5 text-muted-foreground hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-all"
                      title="Excluir este lote"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-muted/20 px-4 py-3 border-t animate-in slide-in-from-top-1 duration-150">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg bg-background p-2.5 border">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Período</p>
                      <p className="font-bold mt-0.5">{fmtDate(batch.dataInicio)} → {fmtDate(batch.dataFim)}</p>
                    </div>
                    <div className="rounded-lg bg-background p-2.5 border">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Entradas</p>
                      <p className="font-bold mt-0.5 text-emerald-600">{fmt(batch.totalEntradas)}</p>
                    </div>
                    <div className="rounded-lg bg-background p-2.5 border">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Saídas</p>
                      <p className="font-bold mt-0.5 text-red-500">{fmt(batch.totalSaidas)}</p>
                    </div>
                    <div className="rounded-lg bg-background p-2.5 border">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Conciliadas</p>
                      <p className="font-bold mt-0.5">{batch.conciliadas}/{batch.count}</p>
                    </div>
                  </div>

                  {batch.conciliadas > 0 && batch.conciliadas < batch.count && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {batch.count - batch.conciliadas} movimentações neste lote ainda não foram conciliadas.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
