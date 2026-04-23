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
  useConciliacoes, useCreateConciliacao,
} from '@/hooks/useConciliacao'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'
import { EditConciliacaoDialog } from './EditConciliacaoDialog'
import { CriarLancamentoFromMovDialog } from './CriarLancamentoFromMovDialog'

interface Props {
  row: any | null
  onClose: () => void
  onRefresh: () => void
}

// Candidato unificado para o matcher (parcela, medição, parcela de mútuo, ou mútuo inteiro)
interface Candidato {
  id: string
  tipo: 'parcela' | 'medicao' | 'mutuo_recebimento' | 'mutuo_captacao'
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
  const createConc = useCreateConciliacao()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const [showCriar, setShowCriar] = useState(false)
  // Multi-seleção: Map<candidatoId, { valor, observacao }>
  const [selecao, setSelecao] = useState<Map<string, { valor: number; observacao: string }>>(new Map())

  useEffect(() => {
    if (row) {
      setSearch('')
      const pre = new Map<string, { valor: number; observacao: string }>()
      if (row.conciliacao_id) {
        const conc = concs.find((c: any) => c.id === row.conciliacao_id)
        if (conc) {
          const links = (conc as any).conciliacao_parcelas ?? []
          for (const l of links) {
            const cid = l.parcela_id ? l.parcela_id
              : l.medicao_id ? `med-${l.medicao_id}`
              : l.mutuo_parcela_id ? `mutparc-${l.mutuo_parcela_id}`
              : l.mutuo_id ? `mut-${l.mutuo_id}` : null
            if (cid) pre.set(cid, { valor: Number(l.valor_aplicado), observacao: l.observacao ?? '' })
          }
        }
      }
      setSelecao(pre)
    }
  }, [row?.id, concs])

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
      // Entrada: medições + adiantamentos + parcelas de mútuo (devolução) + captações de mútuo
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
      // Soma de valor já vinculado a cada mutuo (conciliações confirmadas)
      // para permitir conciliação parcial de depósitos que formam o total da captação.
      const mutuoValorAplicado = new Map<string, number>()
      for (const conc of (concs as any[])) {
        for (const link of (conc.conciliacao_parcelas ?? [])) {
          if (link.mutuo_id) {
            const atual = mutuoValorAplicado.get(link.mutuo_id) ?? 0
            mutuoValorAplicado.set(link.mutuo_id, atual + Number(link.valor_aplicado))
          }
        }
      }

      for (const mut of (mutuos as any[])) {
        const cat = String(mut.categoria ?? '').toLowerCase()
        const isAdiantamentoFeito = cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')

        if (isAdiantamentoFeito) {
          // Adiantamento feito: entrada é a devolução (parcela ou direto no mutuo)
          const parcs = (mut.parcelas ?? []) as any[]
          if (parcs.length > 0) {
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
          } else {
            // Sem parcelas planejadas: permitir devolução livre sobre o mutuo
            const valor = Number(mut.valor_captado) || 0
            const jaAplicado = mutuoValorAplicado.get(mut.id) ?? 0
            const saldo = valor - jaAplicado
            if (saldo < 0.01) continue
            result.push({
              id: `mut-${mut.id}`,
              tipo: 'mutuo_captacao',
              descricao: `Devolução adiantamento: ${mut.nome}`,
              fornecedor: mut.fornecedor?.nome ?? mut.instituicao ?? null,
              valor, valor_pago: jaAplicado, saldo,
              data: mut.data_captacao,
              status: mut.status ?? 'ativo',
              raw: mut,
            })
          }
        } else {
          // Captação genuína (entrada de dinheiro no projeto):
          // permite conciliar múltiplos depósitos parciais somando o valor_captado
          const valor = Number(mut.valor_captado) || 0
          if (valor <= 0) continue
          const jaAplicado = mutuoValorAplicado.get(mut.id) ?? 0
          const saldo = valor - jaAplicado
          if (saldo < 0.01) continue
          result.push({
            id: `mut-${mut.id}`,
            tipo: 'mutuo_captacao',
            descricao: `Captação: ${mut.nome}`,
            fornecedor: mut.fornecedor?.nome ?? mut.instituicao ?? null,
            valor, valor_pago: jaAplicado, saldo,
            data: mut.data_captacao,
            status: mut.status ?? 'ativo',
            raw: mut,
          })
        }
      }
    }
    return result
  }, [row, parcelas, medicoes, mutuos])

  const candidatosFiltrados = useMemo(() => {
    if (!row) return []
    const q = norm(search)
    const absValor = Math.abs(Number(row.valor))
    const selecionadosSet = new Set(selecao.keys())

    let arr = poolCandidatos
    if (q) {
      arr = arr.filter(c => {
        if (selecionadosSet.has(c.id)) return true
        const hay = norm(`${c.descricao} ${c.fornecedor ?? ''} ${c.valor} ${c.saldo}`)
        return hay.includes(q)
      })
    } else {
      // Default: mostra candidatos com saldo >= 30% do valor, sem limite superior.
      // (Mútuos e medições com saldo muito maior que o depósito devem aparecer para conciliação parcial.)
      arr = arr.filter(c => {
        if (selecionadosSet.has(c.id)) return true
        return c.saldo >= absValor * 0.3
      })
    }

    // Ordenar: selecionados primeiro, depois match exato, depois data próxima
    const dataMov = new Date(row.data).getTime()
    return arr.map(c => {
      const diffValor = Math.abs(c.saldo - absValor)
      const diffDias = Math.abs((new Date(c.data).getTime() - dataMov) / 86400000)
      const scoreExato = Math.abs(c.valor - absValor) <= absValor * 0.02 ? 0 : 1000
      const scoreSelecionado = selecionadosSet.has(c.id) ? -10000 : 0
      return { c, score: scoreSelecionado + scoreExato + diffValor + diffDias * 5 }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map(x => x.c)
  }, [poolCandidatos, search, row, selecao])

  // Itens já vinculados ao movimento (via conciliacao_parcelas polimórfico)
  const vinculosDoMov = useMemo(() => {
    if (!row?.conciliacao_id) return []
    const conc = concs.find((c: any) => c.id === row.conciliacao_id)
    if (!conc) return []
    const links = (conc as any).conciliacao_parcelas ?? []
    return links.map((link: any) => {
      if (link.parcela_id) {
        const parc = parcelas.find(p => p.id === link.parcela_id)
        if (!parc) return null
        const ehDespesa = !!parc.despesa_indireta_id
        const ehPedido = !!parc.pedido_id
        return {
          tipo: 'parcela' as const,
          subtipo: ehDespesa ? ('despesa' as const) : ehPedido ? ('pedido' as const) : ('avulsa' as const),
          link,
          descricao: (parc as any).pedido_item ?? parc.descricao ?? 'Parcela',
          fornecedor: (parc as any).fornecedor_nome ?? null,
          valor: Number(parc.valor),
          venc: parc.data_vencimento,
          parcelaRef: `P${parc.numero_parcela}`,
        }
      }
      if (link.medicao_id) {
        const med = medicoes.find(m => m.id === link.medicao_id)
        if (!med) return null
        return {
          tipo: 'medicao' as const,
          link,
          descricao: `Medição nº ${med.numero}`,
          fornecedor: 'Cliente (Contrato)',
          valor: Number(med.valor_planejado),
          venc: med.data_prevista,
        }
      }
      if (link.mutuo_parcela_id) {
        // localizar parcela de mútuo
        for (const mut of (mutuos as any[])) {
          const mp = (mut.parcelas ?? []).find((p: any) => p.id === link.mutuo_parcela_id)
          if (mp) {
            return {
              tipo: 'mutuo_parcela' as const,
              link,
              descricao: `${mut.nome} · P${mp.numero_parcela}`,
              fornecedor: mut.fornecedor?.nome ?? null,
              valor: Number(mp.valor),
              venc: mp.data_vencimento,
            }
          }
        }
      }
      if (link.mutuo_id) {
        const mut = (mutuos as any[]).find((m: any) => m.id === link.mutuo_id)
        if (mut) {
          return {
            tipo: 'mutuo_captacao' as const,
            link,
            descricao: `Captação: ${mut.nome}`,
            fornecedor: mut.fornecedor?.nome ?? mut.instituicao ?? null,
            valor: Number(mut.valor_captado),
            venc: mut.data_captacao,
          }
        }
      }
      return null
    }).filter((x: any): x is NonNullable<typeof x> => x !== null)
  }, [row, concs, parcelas, medicoes, mutuos])

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

  const totalSelecionado = Array.from(selecao.values()).reduce((s, v) => s + v.valor, 0)
  const difSelecao = absValor - totalSelecionado

  const toggleCandidato = (c: Candidato) => {
    const novo = new Map(selecao)
    if (novo.has(c.id)) {
      novo.delete(c.id)
    } else {
      const jaAplicado = Array.from(novo.values()).reduce((s, v) => s + v.valor, 0)
      const difMov = absValor - jaAplicado
      const valorSugerido = Math.min(c.saldo, Math.max(difMov, 0))
      novo.set(c.id, { valor: valorSugerido > 0 ? valorSugerido : c.saldo, observacao: '' })
    }
    setSelecao(novo)
  }

  const updateValor = (id: string, v: number) => {
    const novo = new Map(selecao)
    const atual = novo.get(id)
    if (v <= 0) {
      novo.delete(id)
    } else {
      novo.set(id, { valor: v, observacao: atual?.observacao ?? '' })
    }
    setSelecao(novo)
  }

  const updateObservacao = (id: string, obs: string) => {
    const novo = new Map(selecao)
    const atual = novo.get(id)
    if (!atual) return
    novo.set(id, { ...atual, observacao: obs })
    setSelecao(novo)
  }

  const handleVincularSelecionados = async () => {
    if (selecao.size === 0) return
    if (!row.raw?.id) {
      alert('Movimento sem ID — não é possível vincular')
      return
    }
    // Converte selecao em VinculoPayload polim\u00f3rfico
    const vinculos = Array.from(selecao.entries()).map(([id, { valor, observacao }]) => {
      const c = poolCandidatos.find(x => x.id === id)
      if (!c) return null
      const origem: 'parcela' | 'medicao' | 'mutuo_parcela' | 'mutuo' =
        c.tipo === 'parcela' ? 'parcela' :
        c.tipo === 'medicao' ? 'medicao' :
        c.tipo === 'mutuo_captacao' ? 'mutuo' : 'mutuo_parcela'
      const origem_id = c.tipo === 'parcela' ? c.id :
        c.tipo === 'medicao' ? c.id.replace(/^med-/, '') :
        c.tipo === 'mutuo_captacao' ? c.id.replace(/^mut-/, '') :
        c.id.replace(/^mutparc-/, '')
      return { origem, origem_id, valor_aplicado: valor, observacao: observacao || null }
    }).filter((v): v is NonNullable<typeof v> => v !== null)

    if (row.conciliacao_id) {
      await updateConc.mutateAsync({
        conciliacaoId: row.conciliacao_id,
        vinculos,
      })
    } else {
      await createConc.mutateAsync({
        movimentacaoId: row.raw.id,
        vinculos,
        dataPgto: row.data,
      })
    }
    setSelecao(new Map())
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

          {/* Itens já vinculados (parcela/medição/mútuo) */}
          {vinculosDoMov.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase text-emerald-700">
                  {vinculosDoMov.length} Item{vinculosDoMov.length > 1 ? 's' : ''} Vinculado{vinculosDoMov.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {vinculosDoMov.map((v: any, i: number) => (
                  <div key={i} className="text-[11px]">
                    <div className="flex justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <p className="font-medium truncate">{v.descricao}</p>
                          {v.tipo === 'parcela' && v.subtipo === 'pedido' && <span className="text-[9px] bg-blue-500/10 text-blue-600 px-1 rounded">PEDIDO</span>}
                          {v.tipo === 'parcela' && v.subtipo === 'despesa' && <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1 rounded">DESPESA</span>}
                          {v.tipo === 'parcela' && v.subtipo === 'avulsa' && <span className="text-[9px] bg-slate-500/10 text-slate-600 px-1 rounded">AVULSA</span>}
                          {v.parcelaRef && <span className="text-[9px] bg-muted text-muted-foreground px-1 rounded">{v.parcelaRef}</span>}
                          {v.tipo === 'medicao' && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded">MED</span>}
                          {v.tipo === 'mutuo_parcela' && <span className="text-[9px] bg-violet-500/10 text-violet-600 px-1 rounded">MUT</span>}
                          {v.tipo === 'mutuo_captacao' && <span className="text-[9px] bg-indigo-500/10 text-indigo-600 px-1 rounded">CAP</span>}
                        </div>
                        <p className="text-muted-foreground text-[10px]">
                          {v.fornecedor ? `${v.fornecedor} · ` : ''}
                          Venc {fmtDateBr(v.venc)} · Valor {formatCurrency(v.valor)}
                        </p>
                      </div>
                      <span className="font-mono font-semibold ml-2">{formatCurrency(Number(v.link.valor_aplicado))}</span>
                    </div>
                    {v.link.observacao && (
                      <p className="mt-1 text-[10px] italic text-emerald-700 bg-emerald-500/5 rounded px-1.5 py-0.5">
                        📝 {v.link.observacao}
                      </p>
                    )}
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
                  {vinculosDoMov.length > 0
                    ? (isSaida ? 'Trocar / adicionar pagamento vinculado' : 'Trocar / adicionar recebimento vinculado')
                    : (isSaida ? 'Vincular a pagamentos' : 'Vincular a recebimentos')}
                </p>
              </div>
              <button onClick={() => setShowCriar(true)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold hover:bg-muted">
                <Plus className="h-3 w-3" />Criar novo
              </button>
            </div>
            {vinculosDoMov.length > 0 && (
              <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                ⚠️ Ao selecionar e clicar "Vincular" abaixo, o vínculo atual é <strong>substituído</strong> pelos novos escolhidos. Para apenas remover o vínculo sem trocar, use <em>Desfazer</em> acima.
              </div>
            )}
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
                  const selObj = selecao.get(c.id)
                  const sel = !!selObj
                  const val = selObj?.valor ?? 0
                  const obs = selObj?.observacao ?? ''
                  const matchExato = Math.abs(c.valor - absValor) <= absValor * 0.02
                  const isSugerido = sel && row.situacao === 'sugerido'
                  return (
                    <div key={c.id}
                      className={`border-b last:border-0 transition-colors ${
                        isSugerido ? 'bg-blue-500/10 ring-1 ring-blue-500/30' :
                        sel ? 'bg-primary/5' : 'hover:bg-muted/50'
                      }`}>
                      <div className="flex items-center gap-2 p-2">
                        <input type="checkbox" checked={sel} onChange={() => toggleCandidato(c)}
                          className="h-3.5 w-3.5 rounded accent-primary shrink-0" />
                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleCandidato(c)}>
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="text-xs font-medium truncate">{c.descricao}</p>
                            {isSugerido && <span className="text-[9px] bg-blue-500/20 text-blue-700 px-1.5 py-0.5 rounded font-bold">SUGERIDO</span>}
                            {matchExato && <span className="text-[9px] text-emerald-600 font-bold">MATCH</span>}
                            {c.tipo === 'medicao' && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded">MED</span>}
                            {c.tipo === 'mutuo_recebimento' && <span className="text-[9px] bg-violet-500/10 text-violet-600 px-1 rounded">MUT</span>}
                          {c.tipo === 'mutuo_captacao' && <span className="text-[9px] bg-indigo-500/10 text-indigo-600 px-1 rounded">CAP</span>}
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
                      {sel && (
                        <div className="px-2 pb-2">
                          <textarea value={obs} onChange={(e) => updateObservacao(c.id, e.target.value)}
                            placeholder="📝 Observa\u00e7\u00e3o (opcional): mem\u00f3ria do consumo, lote, motivo do split..."
                            rows={2}
                            className="w-full rounded border bg-background px-2 py-1.5 text-[11px] placeholder:text-muted-foreground/60" />
                        </div>
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
