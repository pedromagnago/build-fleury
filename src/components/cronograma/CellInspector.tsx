/**
 * Inspetor de Célula do Fluxo de Caixa
 *
 * Modal único que substitui popovers/tooltips/drilldowns separados. Mostra a
 * composição hierárquica (Etapa → Fornecedor → Item/Parcela) de qualquer
 * célula do fluxo, com ações:
 * - Adicionar à simulação (override volátil, persistido em localStorage)
 * - Salvar no real (UPDATE direto na tabela correspondente)
 * - Abrir pedido (link externo / modal)
 * - Excluir parcela (com proteções)
 */
import { useState, useMemo } from 'react'
import { X, ChevronRight, ChevronDown, ExternalLink, Edit3, Save, Sparkles, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { CashFlowEvent } from '@/hooks/useCashFlowEvents'

export type Override = { newDate?: string; newValue?: number }

interface Props {
  bucketLabel: string
  events: CashFlowEvent[]
  /** Override aplicado se houver — usado para mostrar valores simulados */
  overrides?: Record<string, Override>
  /** Adiciona override volátil (simulação) */
  onAddOverride?: (eventId: string, override: Override) => void
  /** Remove override (volta ao real) */
  onClearOverride?: (eventId: string) => void
  onClose: () => void
}

type EventType = 'entrada' | 'firme' | 'bruto'

export function CellInspector({ bucketLabel, events, overrides = {}, onAddOverride, onClearOverride, onClose }: Props) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValor, setEditValor] = useState<string>('')
  const [editData, setEditData] = useState<string>('')
  const [tab, setTab] = useState<EventType>('firme')

  // Agrupa por tipo, depois por etapa, depois por FORNECEDOR (sublabel mantém a hierarquia visível)
  const grouped = useMemo(() => {
    const out: Record<EventType, Map<string, Map<string, CashFlowEvent[]>>> = {
      entrada: new Map(), firme: new Map(), bruto: new Map(),
    }
    for (const ev of events) {
      const tipo = ev.type
      const etapa = ev.meta.etapa || 'Sem etapa'
      const sub = ev.meta.forn || ev.meta.cat || ev.meta.item || 'Outros'
      if (!out[tipo].has(etapa)) out[tipo].set(etapa, new Map())
      const m = out[tipo].get(etapa)!
      if (!m.has(sub)) m.set(sub, [])
      m.get(sub)!.push(ev)
    }
    // Ordena dentro de cada subgrupo por pedidoNumero/parcelaNumero
    for (const tipo of ['entrada','firme','bruto'] as const) {
      for (const subs of out[tipo].values()) {
        for (const arr of subs.values()) {
          arr.sort((a, b) => {
            const pa = a.meta.pedidoNumero ?? 0
            const pb = b.meta.pedidoNumero ?? 0
            if (pa !== pb) return pa - pb
            return (a.meta.parcelaNumero ?? 0) - (b.meta.parcelaNumero ?? 0)
          })
        }
      }
    }
    return out
  }, [events])

  const totaisPorTipo: Record<EventType, number> = {
    entrada: 0, firme: 0, bruto: 0,
  }
  for (const ev of events) totaisPorTipo[ev.type] += ev.valor

  const tabsDisponiveis: EventType[] = (['entrada', 'firme', 'bruto'] as const).filter(t => totaisPorTipo[t] > 0)
  const tabAtiva: EventType = tabsDisponiveis.includes(tab) ? tab : (tabsDisponiveis[0] ?? 'firme')

  const startEdit = (ev: CashFlowEvent) => {
    setEditingId(ev.id)
    const ov = overrides[ev.id]
    setEditValor(String(ov?.newValue ?? ev.valor))
    setEditData(ov?.newDate ?? ev.date)
  }

  const aplicarSimulacao = (ev: CashFlowEvent) => {
    if (!onAddOverride) return
    const v = parseFloat(editValor)
    onAddOverride(ev.id, {
      newValue: !isNaN(v) && Math.abs(v - ev.valor) > 0.005 ? v : undefined,
      newDate: editData !== ev.date ? editData : undefined,
    })
    setEditingId(null)
    toast.success('Adicionado à simulação')
  }

  const salvarNoReal = async (ev: CashFlowEvent) => {
    const v = parseFloat(editValor)
    const updates: Record<string, any> = {}
    const newDate = editData !== ev.date ? editData : null
    const newValue = !isNaN(v) && Math.abs(v - ev.valor) > 0.005 ? v : null

    try {
      if (ev.id.startsWith('par-')) {
        const id = ev.id.replace('par-', '')
        const { data: parc } = await supabase.from('parcelas').select('status').eq('id', id).single()
        const isPaga = parc?.status === 'paga' || parc?.status === 'parcialmente_paga'
        if (newDate) {
          if (isPaga) updates.data_pagamento_real = newDate
          else updates.data_vencimento = newDate
        }
        if (newValue !== null) updates.valor = newValue
        if (Object.keys(updates).length === 0) { toast.info('Nada a salvar'); return }
        const { error } = await supabase.from('parcelas').update(updates).eq('id', id)
        if (error) throw error
      } else if (ev.id.startsWith('mutpar-')) {
        const id = ev.id.replace('mutpar-', '')
        if (newDate) updates.data_vencimento = newDate
        if (newValue !== null) updates.valor = newValue
        const { error } = await supabase.from('mutuo_parcelas').update(updates).eq('id', id)
        if (error) throw error
      } else if (ev.id.startsWith('mutcap-')) {
        const id = ev.id.replace('mutcap-', '')
        if (newDate) updates.data_captacao = newDate
        if (newValue !== null) updates.valor_captado = newValue
        const { error } = await supabase.from('mutuos').update(updates).eq('id', id)
        if (error) throw error
      } else if (ev.id.startsWith('med-') && !ev.id.includes('-srv-')) {
        const id = ev.id.replace('med-', '')
        if (newDate) updates.data_prevista = newDate
        if (newValue !== null) updates.valor_planejado = newValue
        const { error } = await supabase.from('medicoes').update(updates).eq('id', id)
        if (error) throw error
      } else if (ev.id.startsWith('pedsol-')) {
        const m = ev.id.match(/^pedsol-([0-9a-f-]{36})-(\d+)$/i)
        const pedidoId = m?.[1]
        if (pedidoId && newDate) {
          const { error } = await supabase.from('pedidos').update({ data_entrega_prevista: newDate }).eq('id', pedidoId)
          if (error) throw error
        }
      } else {
        toast.error('Este tipo de evento não pode ser editado diretamente.')
        return
      }
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['medicoes'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      onClearOverride?.(ev.id)
      setEditingId(null)
      toast.success('Salvo no projeto real')
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message)
    }
  }

  const excluirParcela = async (ev: CashFlowEvent) => {
    if (!ev.id.startsWith('par-') && !ev.id.startsWith('mutpar-')) return
    if (!window.confirm('Excluir esta parcela do projeto? Ação irreversível.')) return
    try {
      if (ev.id.startsWith('par-')) {
        await supabase.from('parcelas').delete().eq('id', ev.id.replace('par-', ''))
      } else {
        await supabase.from('mutuo_parcelas').delete().eq('id', ev.id.replace('mutpar-', ''))
      }
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['mutuos'] })
      toast.success('Parcela excluída')
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + e.message)
    }
  }

  const linkExternoPara = (ev: CashFlowEvent): { url: string; label: string } | null => {
    // Quando temos pedidoNumero, busca mais precisa
    const searchTerm = ev.meta.pedidoNumero != null ? `#${ev.meta.pedidoNumero}` : ev.meta.desc
    const search = `?search=${encodeURIComponent(searchTerm)}`
    if (ev.id.startsWith('par-')) {
      // Para parcelas com pedido, abre em Compras (pra ver o pedido inteiro), senão Pagamentos
      return ev.meta.pedidoNumero != null
        ? { url: `/compras${search}`, label: `Pedido #${ev.meta.pedidoNumero}` }
        : { url: `/pagamentos${search}`, label: 'Pagamentos' }
    }
    if (ev.id.startsWith('mutpar-')) return { url: `/pagamentos${search}`, label: 'Pagamentos' }
    if (ev.id.startsWith('mutcap-')) return { url: `/mutuos${search}`, label: 'Capital & Mútuos' }
    if (ev.id.startsWith('pedsol-')) return { url: `/compras${search}`, label: 'Compras' }
    if (ev.id.startsWith('med-')) return { url: `/cronograma?tab=medicoes&search=${encodeURIComponent(ev.meta.desc)}`, label: 'Medições' }
    return null
  }

  const labelTab = (t: EventType) =>
    t === 'entrada' ? 'Entradas' : t === 'firme' ? 'Saídas Firmes' : 'Saídas Planejadas'
  const corTab = (t: EventType) =>
    t === 'entrada' ? 'text-emerald-600' : t === 'firme' ? 'text-red-500' : 'text-slate-500'

  const grupos = grouped[tabAtiva]

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Inspetor de Célula</p>
            <h3 className="text-base font-bold">{bucketLabel}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {events.length} evento(s) · Total saídas: {formatCurrency(totaisPorTipo.firme + totaisPorTipo.bruto)} · Total entradas: {formatCurrency(totaisPorTipo.entrada)}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs por tipo */}
        {tabsDisponiveis.length > 1 && (
          <div className="flex border-b bg-muted/20 px-4 text-[11px]">
            {tabsDisponiveis.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 font-bold border-b-2 transition-colors ${
                  tabAtiva === t ? `border-primary ${corTab(t)}` : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {labelTab(t)} · {formatCurrency(totaisPorTipo[t])}
              </button>
            ))}
          </div>
        )}

        {/* Lista hierárquica */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {grupos.size === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">Sem eventos neste tipo.</p>
          )}
          {Array.from(grupos.entries())
            .map(([etapa, subs]) => {
              const totalEt = Array.from(subs.values()).reduce((s, arr) => s + arr.reduce((ss, e) => ss + e.valor, 0), 0)
              return { etapa, subs, totalEt }
            })
            .sort((a, b) => b.totalEt - a.totalEt)
            .map(({ etapa, subs, totalEt }) => {
              const etKey = `et-${etapa}`
              const etOpen = expanded[etKey] ?? true
              return (
                <div key={etapa} className="rounded-lg border bg-card overflow-hidden">
                  <button onClick={() => setExpanded(p => ({ ...p, [etKey]: !etOpen }))}
                    className="flex items-center justify-between w-full border-b px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {etOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <p className="text-xs font-bold uppercase tracking-wider truncate">{etapa}</p>
                    </div>
                    <p className={`text-xs font-mono font-bold tabular-nums shrink-0 ${corTab(tabAtiva)}`}>{formatCurrency(totalEt)}</p>
                  </button>

                  {etOpen && (
                    <div className="divide-y">
                      {Array.from(subs.entries())
                        .sort((a, b) => b[1].reduce((s, e) => s + e.valor, 0) - a[1].reduce((s, e) => s + e.valor, 0))
                        .map(([sub, evs]) => {
                          const subKey = `${etKey}-${sub}`
                          const subOpen = expanded[subKey] ?? (evs.length === 1)
                          const subTotal = evs.reduce((s, e) => s + e.valor, 0)
                          return (
                            <div key={sub}>
                              <button onClick={() => setExpanded(p => ({ ...p, [subKey]: !subOpen }))}
                                className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {subOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                                  <p className="font-semibold truncate">{sub}</p>
                                  <span className="text-[10px] text-muted-foreground shrink-0">({evs.length})</span>
                                </div>
                                <p className="font-mono tabular-nums shrink-0">{formatCurrency(subTotal)}</p>
                              </button>

                              {subOpen && (
                                <div className="bg-muted/5 border-t">
                                  {evs.map(ev => {
                                    const ov = overrides[ev.id]
                                    const isModified = ov && (ov.newDate || ov.newValue !== undefined)
                                    const isEditing = editingId === ev.id
                                    const link = linkExternoPara(ev)
                                    // Linha PRINCIPAL: descrição do item específico (não a desc genérica "Parc 1 — FORN")
                                    const tituloPrincipal = ev.meta.item || ev.meta.desc
                                    // Sublabel rico com rastreamento do pedido e parcela
                                    const partes: string[] = []
                                    if (ev.meta.pedidoNumero != null) partes.push(`Pedido #${ev.meta.pedidoNumero}`)
                                    if (ev.meta.parcelaNumero != null) {
                                      partes.push(ev.meta.parcelaTotal ? `Parc ${ev.meta.parcelaNumero}/${ev.meta.parcelaTotal}` : `Parc ${ev.meta.parcelaNumero}`)
                                    }
                                    if (ev.meta.parcelaTipo === 'adiantamento') partes.push('Adiantamento')
                                    const venc = ev.meta.dataVencimento
                                    const dataMostrar = venc && venc !== ev.date
                                      ? `Pago ${new Date(ev.date + 'T00:00:00').toLocaleDateString('pt-BR')} · Venc ${new Date(venc + 'T00:00:00').toLocaleDateString('pt-BR')}`
                                      : new Date(ev.date + 'T00:00:00').toLocaleDateString('pt-BR')
                                    return (
                                      <div key={ev.id} className={`px-3 py-2 border-b last:border-0 ${isModified ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                                        <div className="flex items-start justify-between gap-2 text-[11px]">
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium" title={tituloPrincipal}>
                                              {isModified && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />}
                                              {tituloPrincipal}
                                            </p>
                                            {partes.length > 0 && (
                                              <p className="text-[10px] text-muted-foreground flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                                                {partes.map((p, i) => (
                                                  <span key={i} className={i === 0 ? 'font-semibold text-blue-600' : ''}>{p}</span>
                                                ))}
                                              </p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground">
                                              {dataMostrar}
                                              {isModified && ov.newDate && (
                                                <span className="text-amber-600 ml-1">→ {new Date(ov.newDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                              )}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <p className="font-mono tabular-nums text-xs font-bold">
                                              {formatCurrency(ev.valor)}
                                              {isModified && ov.newValue !== undefined && (
                                                <span className="block text-[9px] text-amber-600">→ {formatCurrency(ov.newValue)}</span>
                                              )}
                                            </p>
                                            {!isEditing && (
                                              <button onClick={() => startEdit(ev)} className="p-1 rounded hover:bg-primary/10 text-primary" title="Editar">
                                                <Edit3 className="h-3 w-3" />
                                              </button>
                                            )}
                                            {link && (
                                              <button onClick={() => window.open(link.url, '_blank')} className="p-1 rounded hover:bg-blue-500/10 text-blue-500" title={`Abrir em ${link.label}`}>
                                                <ExternalLink className="h-3 w-3" />
                                              </button>
                                            )}
                                            {(ev.id.startsWith('par-') || ev.id.startsWith('mutpar-')) && (
                                              <button onClick={() => excluirParcela(ev)} className="p-1 rounded hover:bg-red-500/10 text-red-500" title="Excluir parcela">
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        {/* Editor inline */}
                                        {isEditing && (
                                          <div className="mt-2 rounded-md border bg-background p-2 space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                              <div>
                                                <label className="text-[9px] uppercase font-bold text-muted-foreground block mb-0.5">Valor (R$)</label>
                                                <input type="number" step="0.01" value={editValor} onChange={e => setEditValor(e.target.value)}
                                                  className="w-full rounded border bg-background px-2 py-1 text-xs text-right font-mono" />
                                              </div>
                                              <div>
                                                <label className="text-[9px] uppercase font-bold text-muted-foreground block mb-0.5">Data</label>
                                                <input type="date" value={editData} onChange={e => setEditData(e.target.value)}
                                                  className="w-full rounded border bg-background px-2 py-1 text-xs" />
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button onClick={() => aplicarSimulacao(ev)}
                                                className="flex-1 flex items-center justify-center gap-1 rounded-md bg-amber-500 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600">
                                                <Sparkles className="h-3 w-3" /> Adicionar à simulação
                                              </button>
                                              <button onClick={() => salvarNoReal(ev)}
                                                className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90">
                                                <Save className="h-3 w-3" /> Salvar no projeto
                                              </button>
                                              <button onClick={() => setEditingId(null)}
                                                className="rounded border px-2 py-1.5 text-[11px] hover:bg-muted">
                                                Cancelar
                                              </button>
                                            </div>
                                            {isModified && onClearOverride && (
                                              <button onClick={() => { onClearOverride(ev.id); setEditingId(null) }}
                                                className="text-[10px] text-muted-foreground hover:text-foreground underline">
                                                Remover simulação (volta ao valor real)
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        {/* Footer com explicação */}
        <div className="border-t bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="font-bold text-amber-600">Adicionar à simulação</span>: previsão volátil, vai pra fila do botão "Aplicar Simulação".
          <span className="ml-2 font-bold text-primary">Salvar no projeto</span>: grava direto no banco.
        </div>
      </div>
    </div>
  )
}
