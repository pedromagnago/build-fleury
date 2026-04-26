import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { useConsolidarParcelas, type Parcela } from '@/hooks/useFinanceiro'
import { type Pedido } from '@/hooks/useCompras'
import {
  X, ArrowRight, CheckCircle2, Package, Users, Calendar, ChevronDown, ChevronRight,
} from 'lucide-react'

interface Props {
  pedidos: Pedido[]
  parcelas: Parcela[]
  onClose: () => void
  onDone: () => void
}

interface GrupoConsolidavel {
  key: string
  fornecedor_id: string
  fornecedor_nome: string
  data_entrega: string
  cond_pagamento: string
  pedidos: Pedido[]
  valor_total: number
  parcelas_atuais: number
}

export default function ConsolidarPedidosWizard({ pedidos, parcelas, onClose, onDone }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const consolidar = useConsolidarParcelas()

  // Agrupar pedidos por fornecedor + data_entrega + cond_pagamento
  const grupos: GrupoConsolidavel[] = useMemo(() => {
    const map = new Map<string, GrupoConsolidavel>()

    for (const ped of pedidos) {
      if (!ped.fornecedor_id || !ped.data_entrega_prevista) continue
      const cond = ped.cond_pagamento ?? ''
      const key = `${ped.fornecedor_id}|${ped.data_entrega_prevista}|${cond}`

      if (!map.has(key)) {
        map.set(key, {
          key,
          fornecedor_id: ped.fornecedor_id,
          fornecedor_nome: ped.fornecedor_nome ?? '—',
          data_entrega: ped.data_entrega_prevista,
          cond_pagamento: cond,
          pedidos: [],
          valor_total: 0,
          parcelas_atuais: 0,
        })
      }

      const g = map.get(key)!
      g.pedidos.push(ped)
      g.valor_total += Number(ped.valor_total_real ?? 0)
      g.parcelas_atuais += parcelas.filter(p =>
        p.pedido_id === ped.id && !p.deleted_at && p.status !== 'paga'
      ).length
    }

    // Só retornar grupos com 2+ pedidos (senão não faz sentido consolidar)
    return Array.from(map.values())
      .filter(g => g.pedidos.length >= 2)
      .sort((a, b) => b.valor_total - a.valor_total)
  }, [pedidos, parcelas])

  const selectedGrupos = grupos.filter(g => selectedKeys.has(g.key))
  const totalConsolidavel = selectedGrupos.reduce((s, g) => s + g.valor_total, 0)
  const totalPedidos = selectedGrupos.reduce((s, g) => s + g.pedidos.length, 0)

  const toggleGroup = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAll = () => setSelectedKeys(new Set(grupos.map(g => g.key)))
  const deselectAll = () => setSelectedKeys(new Set())

  // Gerar parcelas com base na condição de pagamento
  const gerarParcelas = (grupo: GrupoConsolidavel): Array<{ valor: number; data_vencimento: string; numero_parcela: number }> => {
    const cond = grupo.cond_pagamento
    if (!cond || cond.trim() === '') {
      return [{ valor: grupo.valor_total, data_vencimento: grupo.data_entrega, numero_parcela: 1 }]
    }

    const splits = cond.split('/').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (splits.length === 0) {
      return [{ valor: grupo.valor_total, data_vencimento: grupo.data_entrega, numero_parcela: 1 }]
    }

    const valorParcela = grupo.valor_total / splits.length
    return splits.map((dias, i) => {
      const dt = localDate(grupo.data_entrega)
      dt.setDate(dt.getDate() + dias)
      return {
        valor: Math.round(valorParcela * 100) / 100,
        data_vencimento: dt.toISOString().split('T')[0]!,
        numero_parcela: i + 1,
      }
    })
  }

  const handleConsolidar = async () => {
    try {
      for (const grupo of selectedGrupos) {
        const pedidoIds = grupo.pedidos.map(p => p.id)
        const novasParcelas = gerarParcelas(grupo)
        await consolidar.mutateAsync({ pedidoIds, parcelas: novasParcelas })
      }
      onDone()
    } catch {}
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Consolidar Pedidos</h3>
              <p className="text-xs text-muted-foreground">
                {step === 1 ? 'Selecione grupos para consolidar' : 'Confirme e execute a consolidação'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Step Indicator */}
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <span className={`rounded-full px-2 py-0.5 ${step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className={`rounded-full px-2 py-0.5 ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</span>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <>
              {grupos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-20 mb-3" />
                  <p className="text-sm font-medium">Nenhum grupo consolidável encontrado</p>
                  <p className="text-xs mt-1">Os pedidos precisam ter o mesmo fornecedor, data de entrega e condição de pagamento.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {grupos.length} grupo(s) encontrado(s) com pedidos consolidáveis
                    </p>
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-xs text-primary hover:underline font-medium">Selecionar todos</button>
                      <button onClick={deselectAll} className="text-xs text-muted-foreground hover:underline">Limpar</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {grupos.map(g => (
                      <div key={g.key} className={`rounded-xl border transition-all ${
                        selectedKeys.has(g.key) ? 'border-primary/40 bg-primary/5 shadow-sm' : 'hover:bg-muted/30'
                      }`}>
                        <div className="flex items-center gap-3 p-4">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(g.key)}
                            onChange={() => toggleGroup(g.key)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <button
                            onClick={() => setExpandedKey(expandedKey === g.key ? null : g.key)}
                            className="flex-shrink-0 text-muted-foreground"
                          >
                            {expandedKey === g.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-semibold truncate">{g.fornecedor_nome}</span>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                {g.pedidos.length} pedidos
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Entrega: {localDate(g.data_entrega).toLocaleDateString('pt-BR')}
                              </span>
                              {g.cond_pagamento && <span>Cond: {g.cond_pagamento}</span>}
                              <span>{g.parcelas_atuais} parcela(s) pendente(s)</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold">{formatCurrency(g.valor_total)}</p>
                          </div>
                        </div>

                        {expandedKey === g.key && (
                          <div className="border-t px-4 pb-3 pt-2 ml-11">
                            <table className="tbl-bf w-full text-xs">
                              <thead>
                                <tr className="text-[9px] uppercase text-muted-foreground">
                                  <th className="py-1 text-left">Pedido</th>
                                  <th className="py-1 text-left">Item</th>
                                  <th className="py-1 text-right">Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                {g.pedidos.map(p => (
                                  <tr key={p.id}>
                                    <td className="py-1.5">#{p.numero_pedido ?? '—'}</td>
                                    <td className="py-1.5 truncate max-w-[200px]">{p.item_descricao ?? '—'}</td>
                                    <td className="py-1.5 text-right font-medium">{formatCurrency(Number(p.valor_total_real ?? 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Resumo da Consolidação
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Grupos</p>
                    <p className="text-lg font-bold">{selectedGrupos.length}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Pedidos</p>
                    <p className="text-lg font-bold">{totalPedidos}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(totalConsolidavel)}</p>
                  </div>
                </div>
              </div>

              {selectedGrupos.map(g => {
                const novasParcelas = gerarParcelas(g)
                return (
                  <div key={g.key} className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold">{g.fornecedor_nome}</h4>
                        <p className="text-[10px] text-muted-foreground">
                          {g.pedidos.length} pedidos → {novasParcelas.length} parcela(s) consolidada(s)
                        </p>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(g.valor_total)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg bg-red-500/5 border border-red-500/10 p-2">
                        <p className="text-[9px] uppercase text-red-500 font-bold mb-1">Antes</p>
                        <p className="text-xs">{g.pedidos.length} pedidos × {g.parcelas_atuais} parcelas</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-2">
                        <p className="text-[9px] uppercase text-emerald-500 font-bold mb-1">Depois</p>
                        <p className="text-xs">{novasParcelas.length} parcela(s):</p>
                        <div className="mt-1 space-y-0.5">
                          {novasParcelas.map((p, i) => (
                            <div key={i} className="flex justify-between text-[10px]">
                              <span>P{p.numero_parcela} — {localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</span>
                              <span className="font-medium">{formatCurrency(p.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-between items-center border-t px-6 py-4">
          <div>
            {selectedKeys.size > 0 && step === 1 && (
              <p className="text-xs text-muted-foreground">
                {selectedKeys.size} grupo(s) · {totalPedidos} pedidos · {formatCurrency(totalConsolidavel)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
                Voltar
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
              Cancelar
            </button>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={selectedKeys.size === 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Próximo <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleConsolidar}
                disabled={consolidar.isPending}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {consolidar.isPending ? 'Consolidando...' : `Consolidar ${totalPedidos} Pedidos`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
