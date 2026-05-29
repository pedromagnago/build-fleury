import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  X, Loader2, Trash2, AlertTriangle, CheckCircle2, Clock, AlertCircle, Edit2, Check,
} from 'lucide-react'

export type NFDocRef = {
  id: string
  numero_doc: string | null
  fornecedor_nome: string | null
  valor_total: number | string | null
  applied_at: string | null
}

type ParcelaRow = {
  id: string
  numero_parcela: number | null
  valor: number | string
  data_vencimento: string | null
  status: string
  valor_pago: number | string | null
  descricao: string | null
  tipo: string | null
  pedido_id: string | null
  pedidos: { numero: number | null } | null
}

type RastreioRow = {
  consumo_id: string
  tipo: 'pedido_criado' | 'cobertura_previsao' | 'consumo_fisico' | 'outro'
  pedido_numero: number | null
  fornecedor_nome: string | null
  is_previsao: boolean
  item_codigo: string | null
  item_descricao: string | null
  delta_qtd_recebida: number | string | null
  valor_coberto_previsao: number | string | null
  vu_pedido: number | string | null
  vu_nf: number | string | null
  valor_efeito: number | string | null
}

type Props = {
  doc: NFDocRef
  companyId: string
  onClose: () => void
  onEstornoSuccess: () => void
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'paga') return (
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold">
      <CheckCircle2 className="h-2.5 w-2.5" /> Paga
    </span>
  )
  if (status === 'parcialmente_paga') return (
    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold">
      <AlertCircle className="h-2.5 w-2.5" /> Parcial
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-semibold">
      <Clock className="h-2.5 w-2.5" /> Futura
    </span>
  )
}

export function NFDetalheDrawer({ doc, companyId, onClose, onEstornoSuccess }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'parcelas' | 'rastreio'>('parcelas')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [confirmEstorno, setConfirmEstorno] = useState(false)

  const { data: parcelas = [], isLoading: parcelasLoading } = useQuery<ParcelaRow[]>({
    queryKey: ['parcelas_por_nf', doc.id],
    staleTime: 0,
    queryFn: async () => {
      // Caminho 1: parcelas com nf_origem_id direto (RPC nova ou backfill)
      const { data: p1 } = await supabase
        .from('parcelas')
        .select('id, numero_parcela, valor, data_vencimento, status, valor_pago, descricao, tipo, pedido_id, pedidos(numero_pedido)')
        .eq('nf_origem_id', doc.id)
        .eq('company_id', companyId)

      // Caminho 2: via pedidos âncora/consumidos que têm nf_origem_id (RPC antiga)
      // Embutimos as parcelas dentro de pedidos — uma única query, sem roundtrip extra.
      const { data: pedidosVinc } = await supabase
        .from('pedidos')
        .select('id, numero_pedido, parcelas(id, numero_parcela, valor, data_vencimento, status, valor_pago, descricao, tipo, pedido_id)')
        .eq('nf_origem_id', doc.id)
        .eq('company_id', companyId)

      const p2 = (pedidosVinc ?? []).flatMap((ped: any) =>
        ((ped.parcelas ?? []) as any[]).map((p: any) => ({
          ...p,
          // Adapta para o shape esperado pelo drawer (pedidos.numero)
          pedidos: { numero: ped.numero_pedido },
        }))
      )

      // Merge e deduplica por ID
      const seen = new Set<string>()
      const merged = [...(p1 ?? []).map((p: any) => ({
        ...p,
        pedidos: p.pedidos ? { numero: (p.pedidos as any).numero_pedido } : null,
      })), ...p2].filter((p: any) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })

      merged.sort((a: any, b: any) => {
        if (!a.data_vencimento && !b.data_vencimento) return 0
        if (!a.data_vencimento) return 1
        if (!b.data_vencimento) return -1
        return a.data_vencimento.localeCompare(b.data_vencimento)
      })

      return merged as unknown as ParcelaRow[]
    },
  })

  const { data: rastreioRows = [], isLoading: rastreioLoading } = useQuery<RastreioRow[]>({
    queryKey: ['recepcao_rastreio', doc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_recepcao_rastreio')
        .select('*')
        .eq('doc_id', doc.id)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as RastreioRow[]
    },
  })

  const updateVencimento = useMutation({
    mutationFn: async ({ id, data_vencimento }: { id: string; data_vencimento: string }) => {
      const { error } = await supabase
        .from('parcelas')
        .update({ data_vencimento })
        .eq('id', id)
        .eq('status', 'futura')
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Vencimento atualizado')
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['parcelas_por_nf', doc.id] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
    },
    onError: (err: any) => toast.error('Erro ao atualizar: ' + (err?.message ?? String(err))),
  })

  const estornarNF = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('excluir_recepcao_doc', { p_doc_id: doc.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('NF estornada · consumo revertido')
      qc.invalidateQueries({ queryKey: ['recepcao_docs_aplicadas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido_itens'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      onEstornoSuccess()
      onClose()
    },
    onError: (err: any) => toast.error('Erro ao estornar NF: ' + (err?.message ?? String(err))),
  })

  const totValor = parcelas.reduce((s, p) => s + Number(p.valor ?? 0), 0)
  const totPago = parcelas.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0)
  const saldoAberto = totValor - totPago

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-5 py-3 flex items-start justify-between gap-3 rounded-t-xl">
          <div>
            <h3 className="text-base font-bold">NF #{doc.numero_doc ?? '?'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doc.fornecedor_nome ?? '—'}
              {doc.valor_total != null && (
                <> · <span className="font-mono font-medium">{formatCurrency(Number(doc.valor_total))}</span></>
              )}
              {doc.applied_at && (
                <> · aplicada em {new Date(doc.applied_at).toLocaleDateString('pt-BR')}</>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 text-xs shrink-0">
          <button
            onClick={() => setTab('parcelas')}
            className={`py-2 mr-5 border-b-2 font-medium transition-colors ${tab === 'parcelas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Parcelas {parcelas.length > 0 && `(${parcelas.length})`}
          </button>
          <button
            onClick={() => setTab('rastreio')}
            className={`py-2 border-b-2 font-medium transition-colors ${tab === 'rastreio' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Rastreio
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── PARCELAS ── */}
          {tab === 'parcelas' && (
            <div className="space-y-3">
              {parcelasLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando parcelas…
                </div>
              )}
              {!parcelasLoading && parcelas.length === 0 && (
                <p className="text-muted-foreground italic text-center py-6 text-xs">
                  Nenhuma parcela vinculada a esta NF.{' '}
                  <span className="not-italic text-foreground/60">
                    (nf_origem_id não encontrado — NF pode ter sido aplicada antes da coluna existir)
                  </span>
                </p>
              )}
              {!parcelasLoading && parcelas.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[9px] uppercase text-muted-foreground border-b">
                          <th className="py-1.5 text-left w-8">#</th>
                          <th className="py-1.5 text-left">Descrição / Pedido</th>
                          <th className="py-1.5 text-left">Vencimento</th>
                          <th className="py-1.5 text-right">Valor</th>
                          <th className="py-1.5 text-right">Pago</th>
                          <th className="py-1.5 text-center">Status</th>
                          <th className="py-1.5 w-6" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {parcelas.map(p => {
                          const valor = Number(p.valor ?? 0)
                          const pago = Number(p.valor_pago ?? 0)
                          const saldo = valor - pago
                          const isFutura = p.status === 'futura'
                          const isEditing = editingId === p.id

                          return (
                            <tr key={p.id} className="hover:bg-muted/10">
                              <td className="py-1.5 font-mono text-muted-foreground text-[10px]">
                                {p.numero_parcela ?? '—'}
                              </td>
                              <td className="py-1.5 max-w-[160px]">
                                <div className="truncate">
                                  {p.descricao ?? <span className="text-muted-foreground italic">—</span>}
                                </div>
                                {(p.pedidos as any)?.numero && (
                                  <div className="text-[10px] text-muted-foreground">
                                    Pedido #{(p.pedidos as any).numero}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="date"
                                      value={editDate}
                                      onChange={e => setEditDate(e.target.value)}
                                      className="rounded border bg-background px-1.5 py-0.5 text-xs font-mono w-28"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => updateVencimento.mutate({ id: p.id, data_vencimento: editDate })}
                                      disabled={!editDate || updateVencimento.isPending}
                                      className="rounded p-0.5 hover:bg-emerald-500/10 text-emerald-600 disabled:opacity-40"
                                      title="Salvar"
                                    >
                                      {updateVencimento.isPending
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <Check className="h-3 w-3" />}
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="rounded p-0.5 hover:bg-muted text-muted-foreground"
                                      title="Cancelar"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-mono text-[11px]">
                                    {p.data_vencimento
                                      ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')
                                      : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-right font-mono font-medium">
                                {formatCurrency(valor)}
                              </td>
                              <td className="py-1.5 text-right font-mono">
                                {pago > 0 ? (
                                  <span className="text-emerald-700">{formatCurrency(pago)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-1.5 text-center">
                                <StatusBadge status={p.status} />
                                {!isFutura && saldo > 0.01 && (
                                  <div className="text-[10px] text-amber-700 font-mono mt-0.5">
                                    saldo {formatCurrency(saldo)}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 text-center">
                                {isFutura && !isEditing && (
                                  <button
                                    onClick={() => {
                                      setEditingId(p.id)
                                      setEditDate(p.data_vencimento ?? '')
                                    }}
                                    className="rounded p-0.5 hover:bg-blue-500/10 text-blue-600"
                                    title="Editar vencimento"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo financeiro */}
                  <div className="flex items-center justify-end gap-4 pt-2 border-t text-[11px] text-muted-foreground">
                    <span>
                      Total: <span className="font-mono font-medium text-foreground">{formatCurrency(totValor)}</span>
                    </span>
                    {totPago > 0.01 && (
                      <span>
                        Pago: <span className="font-mono font-medium text-emerald-700">{formatCurrency(totPago)}</span>
                      </span>
                    )}
                    {saldoAberto > 0.01 && (
                      <span>
                        A pagar: <span className="font-mono font-medium text-amber-700">{formatCurrency(saldoAberto)}</span>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── RASTREIO ── */}
          {tab === 'rastreio' && (
            <div className="space-y-2 text-xs">
              {rastreioLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando rastreio…
                </div>
              )}
              {!rastreioLoading && rastreioRows.length === 0 && (
                <p className="text-muted-foreground italic text-center py-6">
                  Sem registros de consumo pra essa NF.
                </p>
              )}
              {!rastreioLoading && rastreioRows.map(r => {
                const valor = r.valor_efeito != null ? Number(r.valor_efeito) : 0
                const qtd = r.delta_qtd_recebida != null ? Number(r.delta_qtd_recebida) : 0

                if (r.tipo === 'pedido_criado') {
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] rounded bg-blue-500/15 text-blue-700 px-1.5 py-0.5 font-bold uppercase">pedido novo</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? 'sem fornecedor'}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Pedido criado a partir desta NF (âncora financeiro pras parcelas da NF).
                      </p>
                    </div>
                  )
                }

                if (r.tipo === 'cobertura_previsao') {
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] rounded bg-amber-500/20 text-amber-800 px-1.5 py-0.5 font-bold uppercase">cobertura financeira</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? '—'}</span>
                        <span className="text-[10px] rounded bg-amber-500/15 text-amber-800 px-1 font-semibold">PREVISÃO</span>
                      </div>
                      <p className="text-[11px]">
                        Cobriu <span className="font-mono font-bold text-amber-700">{formatCurrency(valor)}</span> do saldo financeiro da previsão
                        {r.item_codigo && <> · item <span className="font-mono text-muted-foreground">{r.item_codigo}</span></>}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        A parcela futura mais distante do pedido foi reduzida nesse valor (sem mexer em parcelas pagas/conciliadas).
                      </p>
                    </div>
                  )
                }

                if (r.tipo === 'consumo_fisico') {
                  const vuNF = r.vu_nf != null ? Number(r.vu_nf) : null
                  const vuPed = r.vu_pedido != null ? Number(r.vu_pedido) : null
                  const temDifPreco = vuNF != null && vuPed != null && Math.abs(vuNF - vuPed) > 0.01
                  const deltaUnit = (vuNF ?? 0) - (vuPed ?? 0)
                  const deltaPct = vuPed && vuPed > 0 ? (deltaUnit / vuPed) * 100 : 0
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 font-bold uppercase">consumo</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? '—'}</span>
                      </div>
                      <p className="text-[11px]">
                        Consumiu{' '}
                        <span className="font-mono font-bold text-emerald-700">
                          {qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>{' '}
                        un
                        {valor > 0 && <> = <span className="font-mono">{formatCurrency(valor)}</span></>}
                        {r.item_codigo && <> · <span className="font-mono text-muted-foreground">{r.item_codigo}</span></>}
                      </p>
                      {r.item_descricao && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.item_descricao}</p>
                      )}
                      {temDifPreco && (
                        <p className={`text-[10px] mt-1 ${deltaUnit > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          Preço NF: <span className="font-mono">{formatCurrency(vuNF!)}</span>/un
                          {' '}vs orçado <span className="font-mono">{formatCurrency(vuPed!)}</span>
                          {' · '}<strong>{deltaUnit > 0 ? '+' : ''}{formatCurrency(deltaUnit * qtd)}</strong>
                          {' '}({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={r.consumo_id} className="rounded-md border bg-muted/10 p-2 text-[11px] text-muted-foreground">
                    Registro sem efeito identificado (id <span className="font-mono">{r.consumo_id.slice(0, 8)}</span>)
                  </div>
                )
              })}
              {!rastreioLoading && rastreioRows.length > 0 && (() => {
                const totConsumido = rastreioRows
                  .filter(r => r.tipo === 'consumo_fisico')
                  .reduce((s, r) => s + Number(r.valor_efeito ?? 0), 0)
                const totCoberto = rastreioRows
                  .filter(r => r.tipo === 'cobertura_previsao')
                  .reduce((s, r) => s + Number(r.valor_efeito ?? 0), 0)
                const totPedidosNovos = rastreioRows.filter(r => r.tipo === 'pedido_criado').length
                return (
                  <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground space-y-0.5">
                    {totConsumido > 0 && (
                      <div>Consumido (físico): <span className="font-mono">{formatCurrency(totConsumido)}</span></div>
                    )}
                    {totCoberto > 0 && (
                      <div>Coberto (previsões): <span className="font-mono">{formatCurrency(totCoberto)}</span></div>
                    )}
                    {totPedidosNovos > 0 && (
                      <div>Pedidos novos: <span className="font-mono">{totPedidosNovos}</span></div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Footer: estorno */}
        <div className="border-t px-5 py-3 flex items-center gap-2 rounded-b-xl bg-card shrink-0">
          {confirmEstorno ? (
            <>
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-muted-foreground flex-1">
                Estornar reverte o consumo nos pedidos e exclui parcelas futuras. Não dá pra desfazer.
              </span>
              <button
                onClick={() => setConfirmEstorno(false)}
                className="rounded border px-2.5 py-1 text-xs hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => estornarNF.mutate()}
                disabled={estornarNF.isPending}
                className="inline-flex items-center gap-1.5 rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {estornarNF.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                Confirmar estorno
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmEstorno(true)}
                className="inline-flex items-center gap-1.5 rounded border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Estornar NF
              </button>
              <div className="flex-1" />
              <button onClick={onClose} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
