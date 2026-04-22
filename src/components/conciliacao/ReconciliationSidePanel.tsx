/**
 * Build Fleury — Painel Lateral de Conciliação
 *
 * Abre ao selecionar uma linha do Extrato da Conta. Mostra contexto do movimento,
 * sugestão de match do motor, busca manual de parcela e ações (confirmar/editar/
 * desfazer/criar despesa avulsa). Substitui o fluxo fragmentado em abas.
 */
import { useState, useMemo, useEffect } from 'react'
import {
  X, CheckCircle2, XCircle, Pencil, RotateCcw, Trash2,
  Search, Link as LinkIcon, History, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, Plus, Sparkles,
} from 'lucide-react'
import {
  useConfirmConciliacao, useRejectConciliacao, useUndoConciliacao,
  useDeleteMovimento, useUpdateConciliacao, useConciliacaoHistory,
  useConciliacoes,
} from '@/hooks/useConciliacao'
import { useParcelas } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { EditConciliacaoDialog } from './EditConciliacaoDialog'

interface Props {
  row: any | null
  onClose: () => void
  onRefresh: () => void
}

function fmtDateBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ReconciliationSidePanel({ row, onClose, onRefresh }: Props) {
  const { data: parcelas = [] } = useParcelas()
  const { data: concs = [] } = useConciliacoes()
  const { data: auditLog = [] } = useConciliacaoHistory()
  const confirmConc = useConfirmConciliacao()
  const rejectConc = useRejectConciliacao()
  const undoConc = useUndoConciliacao()
  const deleteMov = useDeleteMovimento()
  const updateConc = useUpdateConciliacao()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (row) setSearch('')
  }, [row?.id])

  useEffect(() => {
    if (!row) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [row, onClose])

  const parcelasCandidatas = useMemo(() => {
    if (!row) return []
    const q = search.toLowerCase().trim()
    const absValor = Math.abs(Number(row.valor))
    return parcelas
      .filter(p => p.status !== 'paga')
      .filter(p => {
        if (q) {
          const hay = `${p.pedido_item ?? ''} ${p.descricao ?? ''} ${p.valor}`.toLowerCase()
          return hay.includes(q)
        }
        // Default: próximas do valor
        const saldo = Number(p.valor) - Number(p.valor_pago || 0)
        return saldo >= absValor * 0.5 && saldo <= absValor * 2
      })
      .slice(0, 20)
  }, [parcelas, search, row])

  const parcelaConciliada = useMemo(() => {
    if (!row?.parcela_id) return null
    return parcelas.find(p => p.id === row.parcela_id) ?? null
  }, [row, parcelas])

  const historicoDaLinha = useMemo(() => {
    if (!row?.conciliacao_id) return []
    return (auditLog as any[]).filter(a => a.registro_id === row.conciliacao_id).slice(0, 5)
  }, [auditLog, row])

  const concObj = useMemo(() => {
    if (!row?.conciliacao_id) return null
    return concs.find((c: any) => c.id === row.conciliacao_id) ?? null
  }, [concs, row])

  if (!row) return null

  const isSaida = row.tipo === 'saida'
  const absValor = Math.abs(Number(row.valor))

  const handleConfirmCandidato = async (parcelaId: string) => {
    if (row.conciliacao_id) {
      await updateConc.mutateAsync({
        conciliacaoId: row.conciliacao_id,
        parcelas: [{ parcela_id: parcelaId, valor_aplicado: absValor }],
      })
    }
    // else: criar conciliação nova via endpoint de match manual (TODO)
    onRefresh()
  }

  const handleConfirm = async () => {
    if (!row.conciliacao_id) return
    await confirmConc.mutateAsync(row.conciliacao_id)
    onRefresh()
  }

  const handleReject = async () => {
    if (!row.conciliacao_id) return
    if (!confirm('Rejeitar esta sugestão?')) return
    await rejectConc.mutateAsync(row.conciliacao_id)
    onRefresh()
  }

  const handleUndo = async () => {
    if (!row.conciliacao_id) return
    if (!confirm('Desfazer conciliação? A parcela volta a ficar pendente.')) return
    await undoConc.mutateAsync(row.conciliacao_id)
    onRefresh()
  }

  const handleDelete = async () => {
    if (!row.is_manual) return
    if (!confirm('Excluir este lançamento manual?')) return
    await deleteMov.mutateAsync(row.id.replace('mov-', ''))
    onClose()
    onRefresh()
  }

  return (
    <>
      {/* Backdrop opaco */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />

      {/* Painel lateral */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-[90vw] bg-card border-l shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
              {isSaida ? <ArrowUpCircle className="h-3 w-3 text-red-500" /> : <ArrowDownCircle className="h-3 w-3 text-emerald-500" />}
              <span>{isSaida ? 'Saída' : 'Entrada'}</span>
              <span>·</span>
              <span>{fmtDateBr(row.data)}</span>
            </div>
            <p className="text-sm font-semibold truncate mt-0.5" title={row.descricao}>
              {row.descricao || '—'}
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${isSaida ? 'text-red-500' : 'text-emerald-600'}`}>
              {isSaida ? '−' : '+'}{formatCurrency(absValor)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Status atual */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Situação</span>
              <span className="font-bold">{String(row.situacao || '').toUpperCase()}</span>
            </div>
            {row.categoria && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Categoria</span>
                <span className="font-medium">{row.categoria}</span>
              </div>
            )}
            {row.fornecedor && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fornecedor</span>
                <span className="font-medium truncate max-w-[200px]">{row.fornecedor}</span>
              </div>
            )}
            {row.saldo_acumulado != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Saldo após mov.</span>
                <span className="font-mono">{formatCurrency(Number(row.saldo_acumulado))}</span>
              </div>
            )}
          </div>

          {/* Parcela já vinculada (se houver) */}
          {parcelaConciliada && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase text-emerald-700">Parcela Vinculada</span>
              </div>
              <p className="text-xs font-medium">
                {(parcelaConciliada as any).pedido_item ?? parcelaConciliada.descricao ?? 'Parcela'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Venc {fmtDateBr(parcelaConciliada.data_vencimento)} · Valor {formatCurrency(Number(parcelaConciliada.valor))}
                {' · '}Pago {formatCurrency(Number(parcelaConciliada.valor_pago || 0))}
              </p>
            </div>
          )}

          {/* Ações principais */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ações</p>
            <div className="grid grid-cols-2 gap-2">
              {row.situacao === 'sugerido' && row.conciliacao_id && (
                <>
                  <button onClick={handleConfirm}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />Confirmar
                  </button>
                  <button onClick={handleReject}
                    className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10">
                    <XCircle className="h-3.5 w-3.5" />Rejeitar
                  </button>
                </>
              )}
              {row.situacao === 'conciliado' && row.conciliacao_id && (
                <>
                  <button onClick={() => setEditing(true)}
                    className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-500/10">
                    <Pencil className="h-3.5 w-3.5" />Editar
                  </button>
                  <button onClick={handleUndo}
                    className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10">
                    <RotateCcw className="h-3.5 w-3.5" />Desfazer
                  </button>
                </>
              )}
              {row.is_manual && (
                <button onClick={handleDelete}
                  className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" />Excluir lançamento manual
                </button>
              )}
            </div>
          </div>

          {/* Vincular a parcela (quando não concilado OU editando) */}
          {(row.situacao === 'nao_conciliado' || row.situacao === 'atrasado' || row.situacao === 'sugerido') && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Vincular a parcela do sistema
                </p>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por fornecedor, descrição ou valor..."
                  className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
              </div>
              {parcelasCandidatas.length === 0 ? (
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <AlertTriangle className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                  <p className="text-[11px] text-muted-foreground">
                    {search ? 'Nenhuma parcela encontrada' : 'Digite para buscar parcelas'}
                  </p>
                </div>
              ) : (
                <div className="max-h-64 overflow-auto space-y-1">
                  {parcelasCandidatas.map((p: any) => {
                    const saldo = Number(p.valor) - Number(p.valor_pago || 0)
                    const matchExato = Math.abs(saldo - absValor) < absValor * 0.02
                    return (
                      <button key={p.id} onClick={() => handleConfirmCandidato(p.id)}
                        className={`w-full flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-muted/50 transition-colors ${
                          matchExato ? 'border-emerald-500/50 bg-emerald-500/5' : ''
                        }`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            {p.pedido_item ?? p.descricao ?? 'Parcela'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Venc {fmtDateBr(p.data_vencimento)} · {p.status}
                            {Number(p.valor_pago) > 0 && ` · pago ${formatCurrency(Number(p.valor_pago))}`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-mono font-semibold">{formatCurrency(saldo)}</p>
                          {matchExato && <p className="text-[9px] text-emerald-600 font-bold">MATCH</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Histórico */}
          {historicoDaLinha.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Histórico
                </p>
              </div>
              <div className="space-y-1 text-[11px]">
                {historicoDaLinha.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      log.acao === 'UNDO' ? 'bg-red-500/10 text-red-600' :
                      log.acao === 'UPDATE' ? 'bg-blue-500/10 text-blue-600' :
                      'bg-muted text-muted-foreground'
                    }`}>{log.acao}</span>
                    <span className="text-muted-foreground text-[10px] tabular-nums">{fmtDateTime(log.created_at)}</span>
                    <span className="truncate flex-1">{log.dados_depois?.motivo ?? log.dados_depois?.type ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {editing && concObj && (
        <EditConciliacaoDialog
          conciliacao={concObj}
          movimentacao={row.raw}
          onClose={() => { setEditing(false); onRefresh() }}
        />
      )}
    </>
  )
}
