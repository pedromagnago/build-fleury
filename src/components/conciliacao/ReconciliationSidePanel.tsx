/**
 * Build Fleury — Painel Lateral de Conciliação (v2 N:N)
 *
 * Suporta:
 *  - Multi-seleção de parcelas (1 mov → várias parcelas via split)
 *  - Busca por fornecedor/descrição/valor sem restrição de saldo
 *  - Pool dinâmico: mov saída busca parcelas a pagar; mov entrada busca
 *    medições + adiantamentos + parcelas de devolução de mútuo
 *  - Criar lançamento novo vinculado ao mov (despesa/medição/adiantamento)
 *  - Visualizar todas parcelas já vinculadas (não só a primeira)
 */
import { useState, useMemo, useEffect } from 'react'
import {
  X, CheckCircle2, XCircle, Pencil, RotateCcw, Trash2,
  Search, Link as LinkIcon, History, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, Sparkles, Plus,
} from 'lucide-react'
import {
  useConfirmConciliacao, useRejectConciliacao, useUndoConciliacao,
  useDeleteMovimento, useUpdateConciliacao, useConciliacaoHistory,
  useConciliacoes,
} from '@/hooks/useConciliacao'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { EditConciliacaoDialog } from './EditConciliacaoDialog'
import { CriarLancamentoFromMovDialog } from './CriarLancamentoFromMovDialog'

interface Props {
  row: any | null
  onClose: () => void
  onRefresh: () => void
}

// Candidato unificado para o matcher (parcela, medição ou mútuo_parcela)
interface Candidato {
  id: string
  tipo: 'parcela' | 'medicao' | 'mutuo_recebimento'
  descricao: string
  fornecedor: string | null
  valor: number
  valor_pago: number
  saldo: number
  data: string
  status: string
  raw: any
}

function fmtDateBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${(y ?? '').slice(2)}`
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function norm(s: string): string {
  return (s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function ReconciliationSidePanel({ row, onClose, onRefresh }: Props) {
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: mutuos = [] } = useMutuos()
  const { data: concs = [] } = useConciliacoes()
  const { data: auditLog = [] } = useConciliacaoHistory()
  const confirmConc = useConfirmConciliacao()
  const rejectConc = useRejectConciliacao()
  const undoConc = useUndoConciliacao()
  const deleteMov = useDeleteMovimento()
  const updateConc = useUpdateConciliacao()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const [showCriar, setShowCriar] = useState(false)
  // Multi-seleção: Map<candidatoId, valorAplicado>
  const [selecao, setSelecao] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (row) {
      setSearch('')
      setSelecao(new Map())
    }
  }, [row?.id])

  useEffect(() => {
    if (!row) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [row, onClose])

  // Pool de candidatos consolidado por tipo do movimento
  const poolCandidatos: Candidato[] = useMemo(() => {
    if (!row) return []
    const isSaida = row.tipo === 'saida'
    const result: Candidato[] = []

    if (isSaida) {
      // Saída: parcelas a pagar (pedidos + despesas indiretas)
      for (const p of parcelas) {
        if (p.status === 'paga') continue
        const valor = Number(p.valor)
        const pago = Number(p.valor_pago || 0)
        const saldo = valor - pago
        if (saldo < 0.01) continue
        result.push({
          id: p.id,
          tipo: 'parcela',
          descricao: (p as any).pedido_item ?? p.descricao ?? 'Parcela',
          fornecedor: (p as any).fornecedor_nome ?? null,
          valor, valor_pago: pago, saldo,
          data: p.data_vencimento,
          status: p.status,
          raw: p,
        })
      }
    } else {
      // Entrada: medições + adiantamentos + parcelas de mútuo (devolução)
      for (const m of medicoes) {
        if (m.status === 'paga') continue
        const valor = Number(m.valor_planejado) || 0
        const pago = Number(m.valor_liberado) || 0
        const saldo = valor - pago
        if (saldo < 0.01 && m.status !== 'futura') continue
        result.push({
          id: `med-${m.id}`,
          tipo: 'medicao',
          descricao: `Medição nº ${m.numero}`,
          fornecedor: 'Cliente (Contrato)',
          valor, valor_pago: pago, saldo: saldo > 0 ? saldo : valor,
          data: m.data_prevista,
          status: m.status,
          raw: m,
        })
      }
      for (const mut of (mutuos as any[])) {
        // Parcelas de devolução (fornecedor devolvendo ao projeto)
        if (mut.categoria === 'Adiantamento a Receber') {
          const parcs = (mut.parcelas ?? []) as any[]
          for (const mp of parcs) {
            if (mp.status === 'paga') continue
            const valor = Number(mp.valor) || 0
            const pago = Number(mp.valor_pago || 0)
            const saldo = valor - pago
            if (saldo < 0.01) continue
            result.push({
              id: `mutparc-${mp.id}`,
              tipo: 'mutuo_recebimento',
              descricao: `Devolução ${mut.nome} · P${mp.numero_parcela}`,
              fornecedor: mut.fornecedor?.nome ?? null,
              valor, valor_pago: pago, saldo,
              data: mp.data_vencimento,
              status: mp.status,
              raw: mp,
            })
          }
        }
      }
    }
    return result
  }, [row, parcelas, medicoes, mutuos])

  const candidatosFiltrados = useMemo(() => {
    if (!row) return []
    const q = norm(search)
    const absValor = Math.abs(Number(row.valor))

    let arr = poolCandidatos
    if (q) {
      arr = arr.filter(c => {
        const hay = norm(`${c.descricao} ${c.fornecedor ?? ''} ${c.valor} ${c.saldo}`)
        return hay.includes(q)
      })
    } else {
      // Default: candidatos próximos do valor (saldo entre 30%-300% do valor do mov)
      arr = arr.filter(c => c.saldo >= absValor * 0.3 && c.saldo <= absValor * 3)
    }

    // Ordenar: match exato de valor primeiro, depois data próxima
    const dataMov = new Date(row.data).getTime()
    return arr.map(c => {
      const diffValor = Math.abs(c.saldo - absValor)
      const diffDias = Math.abs((new Date(c.data).getTime() - dataMov) / 86400000)
      const scoreExato = Math.abs(c.valor - absValor) <= absValor * 0.02 ? 0 : 1000
      return { c, score: scoreExato + diffValor + diffDias * 5 }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map(x => x.c)
  }, [poolCandidatos, search, row])

  // Parcelas já vinculadas ao movimento (via conciliacao_parcelas)
  const parcelasVinculadas = useMemo(() => {
    if (!row?.conciliacao_id) return []
    const conc = concs.find((c: any) => c.id === row.conciliacao_id)
    if (!conc) return []
    const links = (conc as any).conciliacao_parcelas ?? []
    return links.map((link: any) => {
      const parc = parcelas.find(p => p.id === link.parcela_id)
      return { link, parc }
    }).filter((x: any) => x.parc)
  }, [row, concs, parcelas])

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

  const totalSelecionado = Array.from(selecao.values()).reduce((s, v) => s + v, 0)
  const difSelecao = absValor - totalSelecionado

  const toggleCandidato = (c: Candidato) => {
    const novo = new Map(selecao)
    if (novo.has(c.id)) {
      novo.delete(c.id)
    } else {
      // Auto-preenche com saldo restante da parcela ou com diferença do mov, o que for menor
      const jaAplicado = Array.from(novo.values()).reduce((s, v) => s + v, 0)
      const difMov = absValor - jaAplicado
      const valorSugerido = Math.min(c.saldo, Math.max(difMov, 0))
      novo.set(c.id, valorSugerido > 0 ? valorSugerido : c.saldo)
    }
    setSelecao(novo)
  }

  const updateValor = (id: string, v: number) => {
    const novo = new Map(selecao)
    if (v <= 0) novo.delete(id)
    else novo.set(id, v)
    setSelecao(novo)
  }

  const handleVincularSelecionados = async () => {
    if (selecao.size === 0) return
    if (!row.conciliacao_id && !row.raw?.id) {
      alert('Movimento sem ID — não é possível vincular')
      return
    }
    // Filtrar apenas parcelas (medição/mutuo_parcela exigem fluxo diferente — TODO)
    const parcelasSelecao: { parcela_id: string; valor_aplicado: number }[] = []
    const outrosSelecao: string[] = []
    for (const [id, valor] of selecao.entries()) {
      const c = poolCandidatos.find(x => x.id === id)
      if (!c) continue
      if (c.tipo === 'parcela') {
        parcelasSelecao.push({ parcela_id: c.id, valor_aplicado: valor })
      } else {
        outrosSelecao.push(c.descricao)
      }
    }
    if (outrosSelecao.length > 0) {
      alert(`Vinculação de medições/mútuos ainda não implementada. Itens ignorados: ${outrosSelecao.join(', ')}`)
    }
    if (parcelasSelecao.length === 0) return
    if (row.conciliacao_id) {
      // Atualiza concilicação existente adicionando as parcelas
      await updateConc.mutateAsync({
        conciliacaoId: row.conciliacao_id,
        parcelas: parcelasSelecao,
      })
    } else {
      // Criar conciliação nova via endpoint custom (sem hook dedicado ainda)
      await createConciliacaoNova(row.raw.id, parcelasSelecao, absValor)
    }
    setSelecao(new Map())
    onRefresh()
  }

  async function createConciliacaoNova(
    movId: string,
    parcs: { parcela_id: string; valor_aplicado: number }[],
    valorMov: number,
  ) {
    const totalAplicado = parcs.reduce((s, p) => s + p.valor_aplicado, 0)
    const diferenca = valorMov - totalAplicado
    // Pegar company_id da mov
    const companyId = row.raw?.company_id
    const { data: conc, error } = await supabase.from('conciliacoes').insert({
      company_id: companyId,
      movimentacao_id: movId,
      match_type: 'manual_ui',
      confidence: 100,
      diferenca,
      status: 'confirmado',
    }).select('id').single()
    if (error) { alert('Erro ao criar conciliação: ' + error.message); return }
    if (!conc) return
    await supabase.from('conciliacao_parcelas').insert(
      parcs.map(p => ({ conciliacao_id: conc.id, ...p }))
    )
    // Marcar movimentação como conciliada + atualizar parcelas
    await supabase.from('movimentacoes_bancarias').update({
      conciliado: true,
      conciliado_em: new Date().toISOString(),
      parcela_id: parcs[0]?.parcela_id ?? null,
    }).eq('id', movId)
    for (const p of parcs) {
      const parc = parcelas.find(x => x.id === p.parcela_id)
      if (!parc) continue
      const novoPago = Number(parc.valor_pago || 0) + p.valor_aplicado
      const total = Number(parc.valor)
      const novoStatus = novoPago >= total - 0.01 ? 'paga' : 'parcialmente_paga'
      await supabase.from('parcelas').update({
        status: novoStatus,
        valor_pago: novoPago,
        data_pagamento_real: row.data,
      }).eq('id', p.parcela_id)
    }
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
    if (!confirm('Desfazer conciliação? As parcelas voltam a ficar pendentes.')) return
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
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] max-w-[95vw] bg-card border-l shadow-2xl flex flex-col">
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
          {/* Status */}
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
                <span className="text-muted-foreground">Fornecedor (BD)</span>
                <span className="font-medium truncate max-w-[240px]">{row.fornecedor}</span>
              </div>
            )}
          </div>

          {/* Parcelas já vinculadas */}
          {parcelasVinculadas.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase text-emerald-700">
                  {parcelasVinculadas.length} Parcela{parcelasVinculadas.length > 1 ? 's' : ''} Vinculada{parcelasVinculadas.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {parcelasVinculadas.map(({ link, parc }: any) => (
                  <div key={link.parcela_id} className="flex justify-between text-[11px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{parc.pedido_item ?? parc.descricao ?? 'Parcela'}</p>
                      <p className="text-muted-foreground text-[10px]">
                        {(parc as any).fornecedor_nome ? `${(parc as any).fornecedor_nome} · ` : ''}
                        Venc {fmtDateBr(parc.data_vencimento)} · Valor {formatCurrency(Number(parc.valor))}
                      </p>
                    </div>
                    <span className="font-mono font-semibold ml-2">{formatCurrency(Number(link.valor_aplicado))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações existentes */}
          {(row.situacao === 'sugerido' || row.situacao === 'conciliado') && (
            <div className="grid grid-cols-2 gap-2">
              {row.situacao === 'sugerido' && row.conciliacao_id && (
                <>
                  <button onClick={handleConfirm}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />Confirmar sugestão
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
                    <Pencil className="h-3.5 w-3.5" />Editar parcelas
                  </button>
                  <button onClick={handleUndo}
                    className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10">
                    <RotateCcw className="h-3.5 w-3.5" />Desfazer
                  </button>
                </>
              )}
            </div>
          )}
          {row.is_manual && (
            <button onClick={handleDelete}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" />Excluir lançamento manual
            </button>
          )}

          {/* Vincular a parcelas (multi-seleção N:N) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {isSaida ? 'Vincular a pagamentos' : 'Vincular a recebimentos'}
                </p>
              </div>
              <button onClick={() => setShowCriar(true)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold hover:bg-muted">
                <Plus className="h-3 w-3" />Criar novo
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar fornecedor, descrição ou valor..."
                className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
            </div>

            {candidatosFiltrados.length === 0 ? (
              <div className="rounded-md bg-muted/40 p-3 text-center">
                <AlertTriangle className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-[11px] text-muted-foreground">
                  {search ? 'Nenhum candidato encontrado' : 'Digite para buscar ou crie um novo lançamento'}
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-auto space-y-1 rounded-md border">
                {candidatosFiltrados.map(c => {
                  const sel = selecao.has(c.id)
                  const val = selecao.get(c.id) ?? 0
                  const matchExato = Math.abs(c.valor - absValor) <= absValor * 0.02
                  return (
                    <div key={c.id}
                      className={`flex items-center gap-2 border-b p-2 last:border-0 transition-colors ${
                        sel ? 'bg-primary/5' : 'hover:bg-muted/50'
                      }`}>
                      <input type="checkbox" checked={sel} onChange={() => toggleCandidato(c)}
                        className="h-3.5 w-3.5 rounded accent-primary shrink-0" />
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleCandidato(c)}>
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium truncate">{c.descricao}</p>
                          {matchExato && <span className="text-[9px] text-emerald-600 font-bold">MATCH</span>}
                          {c.tipo === 'medicao' && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded">MED</span>}
                          {c.tipo === 'mutuo_recebimento' && <span className="text-[9px] bg-violet-500/10 text-violet-600 px-1 rounded">MUT</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.fornecedor ? `${c.fornecedor} · ` : ''}
                          Venc {fmtDateBr(c.data)} · saldo {formatCurrency(c.saldo)}
                          {c.valor_pago > 0 && ` · pago ${formatCurrency(c.valor_pago)}/${formatCurrency(c.valor)}`}
                        </p>
                      </div>
                      {sel && (
                        <input type="number" step="0.01" value={val}
                          onChange={(e) => updateValor(c.id, Number(e.target.value) || 0)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-24 rounded border bg-background px-1.5 py-0.5 text-xs text-right font-mono" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Resumo da seleção + botão vincular */}
            {selecao.size > 0 && (
              <div className="mt-3 rounded-md border bg-muted/30 p-2 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>Valor do movimento</span>
                  <span className="font-mono">{formatCurrency(absValor)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Total selecionado</span>
                  <span className="font-mono">{formatCurrency(totalSelecionado)}</span>
                </div>
                <div className={`flex justify-between text-xs font-bold pt-1 border-t ${
                  Math.abs(difSelecao) < 0.01 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  <span>Diferença</span>
                  <span className="font-mono">{formatCurrency(difSelecao)}</span>
                </div>
                <button onClick={handleVincularSelecionados}
                  disabled={updateConc.isPending}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Vincular {selecao.size} item{selecao.size > 1 ? 's' : ''} ao movimento
                </button>
              </div>
            )}
          </div>

          {/* Histórico */}
          {historicoDaLinha.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Histórico</p>
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

      {/* Criar lançamento a partir do movimento */}
      {showCriar && (
        <CriarLancamentoFromMovDialog
          mov={row}
          onClose={(refresh) => {
            setShowCriar(false)
            if (refresh) onRefresh()
          }}
        />
      )}
    </>
  )
}
