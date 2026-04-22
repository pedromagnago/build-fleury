/**
 * Build Fleury — Painel "Movimentos Vinculados" (visão reversa)
 *
 * Slide-in lateral usado em Pagamentos/Recebimentos. Dado um item
 * (parcela, medição ou parcela de mútuo), lista todos os movimentos
 * bancários que baixaram pagamentos contra ele.
 */
import { useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, ArrowDownCircle, ArrowUpCircle, ExternalLink, Calendar, Link as LinkIcon } from 'lucide-react'
import { useConciliacoes } from '@/hooks/useConciliacao'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'

interface Props {
  origem: 'parcela' | 'medicao' | 'mutuo_parcela'
  origemId: string
  titulo: string
  subtitulo?: string
  valor: number
  valorPago?: number
  onClose: () => void
}

function fmtDateBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${(y ?? '').slice(2)}`
}

export function VinculosMovsPanel({ origem, origemId, titulo, subtitulo, valor, valorPago = 0, onClose }: Props) {
  const { data: concs = [] } = useConciliacoes()
  const { data: movs = [] } = useMovimentacoes()
  const { data: contas = [] } = useContasBancarias()

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const contaById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of contas) m.set(c.id, c.nome)
    return m
  }, [contas])

  // Encontra todos os links que apontam para este item
  const links = useMemo(() => {
    const result: Array<{ mov: any; valorAplicado: number; conc: any; observacao: string | null }> = []
    for (const conc of (concs as any[])) {
      const linksDaConc = (conc.conciliacao_parcelas ?? [])
      for (const l of linksDaConc) {
        let match = false
        if (origem === 'parcela' && l.parcela_id === origemId) match = true
        else if (origem === 'medicao' && l.medicao_id === origemId) match = true
        else if (origem === 'mutuo_parcela' && l.mutuo_parcela_id === origemId) match = true
        if (match) {
          const mov = (movs as any[]).find(m => m.id === conc.movimentacao_id)
          if (mov) {
            result.push({ mov, valorAplicado: Number(l.valor_aplicado), conc, observacao: l.observacao ?? null })
          }
        }
      }
    }
    result.sort((a, b) => (a.mov.data ?? '').localeCompare(b.mov.data ?? ''))
    return result
  }, [concs, movs, origem, origemId])

  const totalAplicado = links.reduce((s, l) => s + l.valorAplicado, 0)
  const saldo = valor - (valorPago || 0)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-[95vw] bg-card border-l shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b p-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">
              {origem === 'parcela' ? 'Parcela' : origem === 'medicao' ? 'Medição' : 'Parcela de Mútuo'}
            </p>
            <p className="text-sm font-semibold truncate mt-0.5" title={titulo}>{titulo}</p>
            {subtitulo && <p className="text-[11px] text-muted-foreground">{subtitulo}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resumo */}
        <div className="border-b p-4 space-y-1.5 bg-muted/30">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Valor total</span>
            <span className="font-mono font-semibold">{formatCurrency(valor)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total aplicado via movs</span>
            <span className="font-mono font-semibold text-emerald-600">{formatCurrency(totalAplicado)}</span>
          </div>
          <div className={`flex justify-between text-sm font-bold pt-1 border-t ${
            Math.abs(saldo) < 0.01 ? 'text-emerald-600' :
            saldo > 0 ? 'text-amber-600' : 'text-red-600'
          }`}>
            <span>Saldo restante</span>
            <span className="font-mono">{formatCurrency(saldo)}</span>
          </div>
        </div>

        {/* Lista de movs */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {links.length} Movimento{links.length !== 1 ? 's' : ''} Vinculado{links.length !== 1 ? 's' : ''}
            </p>
          </div>

          {links.length === 0 ? (
            <div className="rounded-md bg-muted/40 p-6 text-center">
              <Calendar className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum movimento bancário vinculado</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Esta parcela ainda não foi paga via extrato bancário
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map(({ mov, valorAplicado, conc, observacao }, i) => {
                const isSaida = mov.tipo === 'saida'
                return (
                  <div key={conc.id + i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {isSaida ? <ArrowUpCircle className="h-3 w-3 text-red-500" /> : <ArrowDownCircle className="h-3 w-3 text-emerald-500" />}
                          <span>{isSaida ? 'Saída' : 'Entrada'}</span>
                          <span>·</span>
                          <span>{fmtDateBr(mov.data)}</span>
                          <span>·</span>
                          <span>{contaById.get(mov.conta_id) ?? 'Conta'}</span>
                        </div>
                        <p className="text-xs font-medium truncate mt-0.5" title={mov.descricao}>
                          {mov.descricao}
                        </p>
                        {mov.categoria && (
                          <p className="text-[10px] text-muted-foreground">{mov.categoria}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono font-bold text-emerald-600">
                          {formatCurrency(valorAplicado)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          de {formatCurrency(Number(mov.valor))}
                        </p>
                      </div>
                    </div>
                    {observacao && (
                      <p className="mt-2 text-[11px] italic text-emerald-700 bg-emerald-500/5 rounded px-2 py-1">
                        📝 {observacao}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-end">
                      <Link to="/conciliacao"
                        className="text-[10px] inline-flex items-center gap-1 text-primary hover:underline">
                        Ver no extrato <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
