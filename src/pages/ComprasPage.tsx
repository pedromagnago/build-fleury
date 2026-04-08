import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  useItensCompra, useFornecedores, useCreateItemCompra, useUpdateItemCompra, useDeleteItemCompra,
  useCreateFornecedor, usePedidos, useCreatePedidoLote, useUpdatePedido, useDeletePedido,
  type ItemCompra, type Pedido, type Fornecedor,
} from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { gerarParcelas, localDate } from '@/lib/parcelas'
import { toast } from 'sonner'
import GerarPedidosWizard from '@/components/GerarPedidosWizard'
import BulkActionBar from '@/components/BulkActionBar'
import PedidosBulkActions from '@/components/PedidosBulkActions'
import ComprasBulkActions from '@/components/ComprasBulkActions'
import FornecedoresBulkActions from '@/components/FornecedoresBulkActions'
import { useSelection } from '@/hooks/useSelection'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, Legend,
} from 'recharts'
import {
  ShoppingCart, Plus, X, Check, Pencil, Package, Truck, Users,
  Search, BarChart3, ChevronDown, ChevronRight, CalendarClock, Trash2, Boxes,
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

/** Parse Brazilian currency input: "1.234,56" → 1234.56 */
function parseBRL(v: string): number {
  const cleaned = v.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

/** Format number for input display: 1234.56 → "1234,56" */
function toBRLInput(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type Tab = 'itens' | 'pedidos' | 'fornecedores' | 'curva_abc' | 'por_fornecedor'

export default function Compras() {
  const { restartTour } = useTour('compras', pageTours.compras)

  const [searchParams] = useSearchParams()
  const initialEtapa = searchParams.get('etapa')
  const [tab, setTab] = useState<Tab>('itens')
  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  const TABS: Array<{ key: Tab; label: string; icon: typeof Package }> = [
    { key: 'itens', label: 'Itens', icon: Package },
    { key: 'pedidos', label: 'Pedidos', icon: Truck },
    { key: 'fornecedores', label: 'Fornecedores', icon: Users },
    { key: 'curva_abc', label: 'Curva ABC', icon: BarChart3 },
    { key: 'por_fornecedor', label: 'Por Fornecedor', icon: Users },
  ]

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader title="Compras" description="Itens, pedidos, fornecedores e análises" icon={ShoppingCart} onHelp={restartTour} />
        <button
          onClick={() => setShowWizard(true)}
          className="mt-1 flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          <Boxes className="h-4 w-4" /> Gerar Pedidos Automáticos
        </button>
      </div>

      {showWizard && <GerarPedidosWizard onClose={() => setShowWizard(false)} />}

      {/* Tabs */}
      <div id="tour-compras-tabs" className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search (not for charts) */}
      {(tab === 'itens' || tab === 'pedidos' || tab === 'fornecedores') && (
        <div className="mb-4 flex gap-3">
          <div id="tour-compras-filters" className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className={`${INPUT} pl-9`}
            />
          </div>
        </div>
      )}

      {tab === 'itens' && <ItensTab search={search} filterEtapa={initialEtapa} />}
      {tab === 'pedidos' && <PedidosTab search={search} />}
      {tab === 'fornecedores' && <FornecedoresTab search={search} />}
      {tab === 'curva_abc' && <CurvaABCTab />}
      {tab === 'por_fornecedor' && <PorFornecedorTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ITENS TAB — with inline edit support
// ═══════════════════════════════════════════════════════════════

function ItensTab({ search, filterEtapa }: { search: string; filterEtapa: string | null }) {
  const { data: itens = [], isLoading } = useItensCompra()
  const { data: etapas = [] } = useEtapas()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const createItem = useCreateItemCompra()
  const updateItem = useUpdateItemCompra()
  const deleteItem = useDeleteItemCompra()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inlineField, setInlineField] = useState<{ id: string; field: string; value: string } | null>(null)
  const selection = useSelection()

  const [form, setForm] = useState({
    codigo: '', descricao: '', tipo: 'MATERIAL' as string, etapa_id: filterEtapa ?? '',
    categoria: '', unidade: '', qtd_por_casa: '', qtd_total: '',
    custo_unitario_orcado: '', valor_total_orcado: '', fornecedor_id: '', cond_pagamento: '',
  })

  const resetForm = () => {
    setForm({
      codigo: '', descricao: '', tipo: 'MATERIAL', etapa_id: filterEtapa ?? '',
      categoria: '', unidade: '', qtd_por_casa: '', qtd_total: '',
      custo_unitario_orcado: '', valor_total_orcado: '', fornecedor_id: '', cond_pagamento: '',
    })
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (item: ItemCompra) => {
    setForm({
      codigo: item.codigo, descricao: item.descricao, tipo: item.tipo,
      etapa_id: item.etapa_id, categoria: item.categoria ?? '',
      unidade: item.unidade ?? '', qtd_por_casa: item.qtd_por_casa?.toString() ?? '',
      qtd_total: item.qtd_total?.toString() ?? '',
      custo_unitario_orcado: toBRLInput(item.custo_unitario_orcado),
      valor_total_orcado: toBRLInput(item.valor_total_orcado),
      fornecedor_id: item.fornecedor_id ?? '', cond_pagamento: item.cond_pagamento ?? '',
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const custoUnit = parseBRL(form.custo_unitario_orcado)
    const valorTotal = parseBRL(form.valor_total_orcado)
    const payload = {
      codigo: form.codigo, descricao: form.descricao, tipo: form.tipo as ItemCompra['tipo'],
      etapa_id: form.etapa_id, categoria: form.categoria || null,
      unidade: form.unidade || null,
      qtd_por_casa: form.qtd_por_casa ? parseFloat(form.qtd_por_casa) : null,
      qtd_total: form.qtd_total ? parseFloat(form.qtd_total) : null,
      custo_unitario_orcado: custoUnit,
      valor_total_orcado: valorTotal,
      // valor_saldo: GENERATED ALWAYS — auto-calculated by PostgreSQL
      fornecedor_id: form.fornecedor_id || null,
      cond_pagamento: form.cond_pagamento || null,
    }
    if (editingId) {
      await updateItem.mutateAsync({ id: editingId, ...payload })
    } else {
      await createItem.mutateAsync(payload)
    }
    resetForm()
  }

  // -- Inline edit save
  const saveInline = useCallback(async () => {
    if (!inlineField) return
    const { id, field, value } = inlineField
    const item = itens.find((i) => i.id === id)
    if (!item) return

    const updates: Partial<ItemCompra> = {}
    if (field === 'fornecedor_id') {
      updates.fornecedor_id = value || null
    } else if (field === 'custo_unitario_orcado') {
      const v = parseBRL(value)
      updates.custo_unitario_orcado = v
      updates.valor_total_orcado = v * (item.qtd_total ?? 0)
      // valor_saldo: GENERATED ALWAYS — auto-calculated by PostgreSQL
    } else if (field === 'cond_pagamento') {
      updates.cond_pagamento = value || null
    }
    await updateItem.mutateAsync({ id, ...updates })
    setInlineField(null)
  }, [inlineField, itens, updateItem])

  const filtered = itens.filter((i) => {
    const matchSearch = i.descricao.toLowerCase().includes(search.toLowerCase()) ||
      i.codigo.toLowerCase().includes(search.toLowerCase())
    const matchEtapa = filterEtapa ? i.etapa_id === filterEtapa : true
    return matchSearch && matchEtapa
  })

  const totals = filtered.reduce(
    (acc, i) => {
      const itemConsumido = pedidos.filter(p => p.item_compra_id === i.id).reduce((s, p) => s + (p.valor_total_real || 0), 0)
      const pago = parcelas.filter(p => p.item_compra_id === i.id).reduce((s, p) => s + (p.valor_pago || 0), 0)
      return { orcado: acc.orcado + i.valor_total_orcado, consumido: acc.consumido + itemConsumido, pago: acc.pago + pago }
    },
    { orcado: 0, consumido: 0, pago: 0 }
  )

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniCard label="Itens" value={String(filtered.length)} />
        <MiniCard label="Orçado" value={formatCurrency(totals.orcado)} />
        <MiniCard label="Consumido" value={formatCurrency(totals.consumido)} accent="amber" />
        <MiniCard label="Pago" value={formatCurrency(totals.pago)} accent="blue" />
        <MiniCard label="Saldo" value={formatCurrency(totals.orcado - totals.consumido)} accent={totals.orcado - totals.consumido >= 0 ? 'emerald' : 'red'} />
      </div>

      <div className="mb-4 flex justify-end">
        <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Item
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? 'Editar Item' : 'Novo Item'}</h3>
            <button onClick={resetForm} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Código *</label><input type="text" value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} required className={INPUT} /></div>
              <div className="md:col-span-2"><label className={LABEL}>Descrição *</label><input type="text" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} required className={INPUT} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div><label className={LABEL}>Tipo</label><select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={INPUT}><option value="MATERIAL">Material</option><option value="MAO_DE_OBRA">Mão de Obra</option><option value="EQUIPAMENTO">Equipamento</option></select></div>
              <div><label className={LABEL}>Etapa *</label><select value={form.etapa_id} onChange={(e) => setForm((p) => ({ ...p, etapa_id: e.target.value }))} required className={INPUT}><option value="">Selecione</option>{etapas.map((e) => <option key={e.id} value={e.id}>{e.codigo} - {e.nome}</option>)}</select></div>
              <div><label className={LABEL}>Unidade</label><input type="text" value={form.unidade} onChange={(e) => setForm((p) => ({ ...p, unidade: e.target.value }))} placeholder="un, m²" className={INPUT} /></div>
              <div><label className={LABEL}>Fornecedor</label><select value={form.fornecedor_id} onChange={(e) => setForm((p) => ({ ...p, fornecedor_id: e.target.value }))} className={INPUT}><option value="">Nenhum</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div><label className={LABEL}>Qtd/Casa</label><input type="number" step="0.01" value={form.qtd_por_casa} onChange={(e) => setForm((p) => ({ ...p, qtd_por_casa: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Qtd Total</label><input type="number" step="0.01" value={form.qtd_total} onChange={(e) => setForm((p) => ({ ...p, qtd_total: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Custo Unit. (R$)</label><input type="text" value={form.custo_unitario_orcado} onChange={(e) => setForm((p) => ({ ...p, custo_unitario_orcado: e.target.value }))} placeholder="0,00" className={INPUT} /></div>
              <div><label className={LABEL}>Valor Total (R$)</label><input type="text" value={form.valor_total_orcado} onChange={(e) => setForm((p) => ({ ...p, valor_total_orcado: e.target.value }))} placeholder="0,00" className={INPUT} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />{editingId ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhum item encontrado" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2.5 text-center">
                  <input type="checkbox"
                    checked={selection.count === filtered.length && filtered.length > 0}
                    onChange={() => selection.toggleAll(filtered.map(i => i.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Código</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orçado</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Consumido</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pago</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => {
                const itemConsumido = pedidos.filter(p => p.item_compra_id === item.id).reduce((s, p) => s + (p.valor_total_real || 0), 0)
                const itemPago = parcelas.filter(p => p.item_compra_id === item.id).reduce((s, p) => s + (p.valor_pago || 0), 0)
                const saldoReal = item.valor_total_orcado - itemConsumido
                return (
                <tr key={item.id} className="group hover:bg-muted/20">
                  <td className="px-2 py-2.5 text-center">
                    <input type="checkbox" checked={selection.isSelected(item.id)}
                      onChange={() => selection.toggle(item.id)}
                      className="h-3.5 w-3.5 rounded accent-primary" />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{item.codigo}</td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-xs font-medium">{item.descricao}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      item.tipo === 'MATERIAL' ? 'bg-blue-500/10 text-blue-600' :
                      item.tipo === 'MAO_DE_OBRA' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-orange-500/10 text-orange-600'
                    }`}>{item.tipo === 'MAO_DE_OBRA' ? 'M.O.' : item.tipo === 'MATERIAL' ? 'MAT' : 'EQP'}</span>
                  </td>
                  {/* Inline editable fornecedor */}
                  <td className="px-3 py-2.5">
                    {inlineField?.id === item.id && inlineField.field === 'fornecedor_id' ? (
                      <select value={inlineField.value} onChange={(e) => setInlineField({ ...inlineField, value: e.target.value })} onBlur={saveInline} autoFocus className="rounded border bg-background px-1 py-0.5 text-xs">
                        <option value="">—</option>
                        {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setInlineField({ id: item.id, field: 'fornecedor_id', value: item.fornecedor_id ?? '' })} className="text-left text-xs text-muted-foreground hover:text-foreground">
                        {item.fornecedor_nome ?? <span className="italic text-muted-foreground/50">Definir</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">{formatCurrency(item.valor_total_orcado)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-amber-500">{formatCurrency(itemConsumido)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-blue-500 font-medium">{formatCurrency(itemPago)}</td>
                  <td className={`px-3 py-2.5 text-right text-xs font-medium ${saldoReal >= 0 ? '' : 'text-red-500'}`}>{formatCurrency(saldoReal)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => startEdit(item)} className="rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (window.confirm(`Excluir "${item.descricao}"? Pedidos e parcelas vinculados serão removidos.`)) deleteItem.mutate(item.id) }} className="rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 text-red-500" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <ComprasBulkActions itens={itens} selectedIds={selection.selected} onDone={selection.clear} />
      </BulkActionBar>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// PEDIDOS TAB — with auto parcela generation + preview + edit + delete
// ═══════════════════════════════════════════════════════════════

function PedidosTab({ search }: { search: string }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: pedidos = [], isLoading } = usePedidos()
  const { data: itens = [] } = useItensCompra()
  const { data: fornecedores = [] } = useFornecedores()
  // createPedido not used directly — bulk creation handled by createPedidoLote
  const updatePedido = useUpdatePedido()
  const deletePedido = useDeletePedido()
  
  const selection = useSelection()

  const { data: etapas = [] } = useEtapas()
  const [showForm, setShowForm] = useState(false)
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const emptyGlobal = { numero_pedido: '', fornecedor_id: '', cond_pagamento: '', data_entrega_prevista: '', status: 'planejado' as Pedido['status'] }
  const [globalForm, setGlobalForm] = useState(emptyGlobal)

  // ─── New: Etapa-based item selector ───
  const [etapaFilter, setEtapaFilter] = useState<string>('')
  
  interface LoteItem {
    id: string
    item_compra_id: string
    casas_lote: string
    valor_unitario_real: string
  }
  const [loteItems, setLoteItems] = useState<LoteItem[]>([])

  // Items filtered by selected etapa
  const itensForEtapa = useMemo(() => {
    if (!etapaFilter) return []
    return itens.filter(i => i.etapa_id === etapaFilter)
  }, [itens, etapaFilter])

  const createPedidoLote = useCreatePedidoLote()

  // Toggle an item in/out of the loteItems list (checkbox behavior)
  const toggleItemInLote = useCallback((itemId: string) => {
    setLoteItems(prev => {
      const exists = prev.find(li => li.item_compra_id === itemId)
      if (exists) return prev.filter(li => li.item_compra_id !== itemId)
      const item = itens.find(i => i.id === itemId)
      return [...prev, {
        id: crypto.randomUUID(),
        item_compra_id: itemId,
        casas_lote: '',
        valor_unitario_real: item?.custo_unitario_orcado ? toBRLInput(item.custo_unitario_orcado) : '',
      }]
    })
  }, [itens])

  // Select/deselect all items of current etapa
  const toggleAllEtapaItems = useCallback(() => {
    const allSelected = itensForEtapa.every(i => loteItems.some(li => li.item_compra_id === i.id))
    if (allSelected) {
      // Remove all of this etapa
      const etapaItemIds = new Set(itensForEtapa.map(i => i.id))
      setLoteItems(prev => prev.filter(li => !etapaItemIds.has(li.item_compra_id)))
    } else {
      // Add missing ones
      setLoteItems(prev => {
        const existing = new Set(prev.map(li => li.item_compra_id))
        const newItems = itensForEtapa
          .filter(i => !existing.has(i.id))
          .map(i => ({
            id: crypto.randomUUID(),
            item_compra_id: i.id,
            casas_lote: '',
            valor_unitario_real: i.custo_unitario_orcado ? toBRLInput(i.custo_unitario_orcado) : '',
          }))
        return [...prev, ...newItems]
      })
    }
  }, [itensForEtapa, loteItems])

  const updateLoteItem = (itemCompraId: string, field: keyof LoteItem, value: string) => {
    setLoteItems(prev => prev.map(i => i.item_compra_id === itemCompraId ? { ...i, [field]: value } : i))
  }

  const removeLoteItem = (itemCompraId: string) => {
    setLoteItems(prev => prev.filter(i => i.item_compra_id !== itemCompraId))
  }

  // -- Auto-calculate valor_total do lote
  const calculatedItems = useMemo(() => {
    return loteItems.map(li => {
      const selectedItem = itens.find((i) => i.id === li.item_compra_id)
      const casasLote = parseInt(li.casas_lote) || 0
      const qtdPorCasa = selectedItem?.qtd_por_casa ?? 0
      const precoUnit = parseBRL(li.valor_unitario_real)
      const qtdLoteCalc = casasLote * qtdPorCasa
      const valorTotalCalc = qtdLoteCalc * precoUnit

      let used = 0
      if (selectedItem) {
        used = pedidos
          .filter((p) => p.item_compra_id === selectedItem.id && p.id !== editingPedido?.id)
          .reduce((s, p) => s + (p.casas_lote ?? 0), 0)
      }
      const remaining = selectedItem ? (currentCompany?.qtd_casas ?? 64) - used : 0

      return {
        ...li,
        selectedItem,
        qtdPorCasa,
        casasLote,
        precoUnit,
        qtdLoteCalc,
        valorTotalCalc,
        used,
        remaining
      }
    })
  }, [loteItems, itens, pedidos, currentCompany, editingPedido])

  const valorTotalLote = calculatedItems.reduce((acc, curr) => acc + curr.valorTotalCalc, 0)

  // -- Parcela preview
  const parcelaPreview = useMemo(() => {
    if (valorTotalLote <= 0 || !globalForm.cond_pagamento || !globalForm.data_entrega_prevista) return []
    return gerarParcelas({
      pedidoId: 'preview',
      companyId: 'preview',
      valorTotal: valorTotalLote,
      condPagamento: globalForm.cond_pagamento,
      dataEntrega: localDate(globalForm.data_entrega_prevista),
    })
  }, [valorTotalLote, globalForm.cond_pagamento, globalForm.data_entrega_prevista])

  const startEdit = (p: Pedido) => {
    setEditingPedido(p)
    setGlobalForm({
      numero_pedido: p.numero_pedido?.toString() ?? '',
      fornecedor_id: p.fornecedor_id ?? '',
      cond_pagamento: p.cond_pagamento ?? '',
      data_entrega_prevista: p.data_entrega_prevista ?? '',
      status: p.status,
    })
    setLoteItems([{
      id: crypto.randomUUID(),
      item_compra_id: p.item_compra_id,
      casas_lote: p.casas_lote?.toString() ?? '',
      valor_unitario_real: p.valor_unitario_real ? toBRLInput(p.valor_unitario_real) : ''
    }])
    // Set etapa filter to item's etapa
    const item = itens.find(i => i.id === p.item_compra_id)
    if (item) setEtapaFilter(item.etapa_id)
    setShowForm(true)
  }

  const resetForm = () => {
    setGlobalForm(emptyGlobal)
    setLoteItems([])
    setEtapaFilter('')
    setEditingPedido(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentCompany) return

    if (editingPedido) {
      // Editar um item único
      const li = calculatedItems[0]!
      const payload = {
        item_compra_id: li.item_compra_id,
        numero_pedido: globalForm.numero_pedido ? Number(globalForm.numero_pedido) : null,
        casas_lote: li.casasLote || null,
        qtd_lote: li.qtdLoteCalc || null,
        valor_unitario_real: li.precoUnit || null,
        valor_total_real: li.valorTotalCalc || null,
        fornecedor_id: globalForm.fornecedor_id || null,
        cond_pagamento: globalForm.cond_pagamento || null,
        data_entrega_prevista: globalForm.data_entrega_prevista || null,
        status: globalForm.status,
      }
      await updatePedido.mutateAsync({ id: editingPedido.id, ...payload })

      const condChanged = editingPedido.cond_pagamento !== globalForm.cond_pagamento
      const dateChanged = editingPedido.data_entrega_prevista !== globalForm.data_entrega_prevista
      const valorChanged = (editingPedido.valor_total_real ?? 0) !== li.valorTotalCalc

      if ((condChanged || dateChanged || valorChanged) && li.valorTotalCalc > 0 && globalForm.cond_pagamento && globalForm.data_entrega_prevista) {
        await supabase.from('parcelas').delete().eq('pedido_id', editingPedido.id).neq('status', 'paga')
        const parcelas = gerarParcelas({
          pedidoId: editingPedido.id,
          companyId: currentCompany.id,
          valorTotal: li.valorTotalCalc,
          condPagamento: globalForm.cond_pagamento,
          dataEntrega: localDate(globalForm.data_entrega_prevista),
        })
        if (parcelas.length > 0) {
          await supabase.from('parcelas').insert(parcelas)
          toast.success(`Parcelas regeneradas (${parcelas.length})`)
        }
        qc.invalidateQueries({ queryKey: ['parcelas'] })
      }
    } else {
      // Lote insert
      const validItems = calculatedItems.filter(li => li.item_compra_id && li.valorTotalCalc > 0)
      if (validItems.length === 0) {
        toast.error('Nenhum item válido com valor maior que zero inserido.')
        return
      }

      // 1. Inserir todos os itens de pedido
      const payloads = validItems.map(li => ({
        item_compra_id: li.item_compra_id,
        numero_pedido: globalForm.numero_pedido ? Number(globalForm.numero_pedido) : null,
        casas_lote: li.casasLote || null,
        qtd_lote: li.qtdLoteCalc || null,
        valor_unitario_real: li.precoUnit || null,
        valor_total_real: li.valorTotalCalc || null,
        fornecedor_id: globalForm.fornecedor_id || null,
        cond_pagamento: globalForm.cond_pagamento || null,
        data_entrega_prevista: globalForm.data_entrega_prevista || null,
        status: globalForm.status,
      }))

      const createdPedidos = await createPedidoLote.mutateAsync(payloads)

      // 2. Gerar parcelas proporcionais
      if (globalForm.cond_pagamento && globalForm.data_entrega_prevista && createdPedidos && createdPedidos.length > 0) {
        let allParcelas: ReturnType<typeof gerarParcelas> = []
        for (const p of createdPedidos) {
          const parcelas = gerarParcelas({
            pedidoId: p.id,
            companyId: currentCompany.id,
            valorTotal: p.valor_total_real || 0,
            condPagamento: p.cond_pagamento!,
            dataEntrega: localDate(p.data_entrega_prevista!),
          })
          allParcelas = allParcelas.concat(parcelas)
        }
        if (allParcelas.length > 0) {
          const { error } = await supabase.from('parcelas').insert(allParcelas)
          if (error) {
            toast.error('Pedidos criados mas erro ao gerar parcelas: ' + error.message)
          } else {
            toast.success(`Lote de pedidos criado com ${allParcelas.length} parcela(s) gerada(s)`)
            qc.invalidateQueries({ queryKey: ['parcelas'] })
          }
        }
      }
    }

    resetForm()
  }

  const handleDelete = async (id: string) => {
    await deletePedido.mutateAsync(id)
    setConfirmDelete(null)
  }

  const statusColors: Record<string, string> = {
    planejado: 'bg-slate-500/10 text-slate-500',
    pedido_enviado: 'bg-blue-500/10 text-blue-500',
    entregue: 'bg-emerald-500/10 text-emerald-500',
    pago: 'bg-green-500/10 text-green-600',
  }

  const filtered = pedidos.filter((p) => {
    const s = search.toLowerCase()
    return (
      (p.item_descricao ?? '').toLowerCase().includes(s) ||
      (p.item_codigo ?? '').toLowerCase().includes(s) ||
      (p.fornecedor_nome ?? '').toLowerCase().includes(s) ||
      (p.numero_pedido?.toString() ?? '').includes(s)
    )
  })

  const grouped = useMemo(() => {
    const map = new Map<string, Pedido[]>()
    filtered.forEach(p => {
      const isNull = p.numero_pedido == null || p.numero_pedido === 0
      const g = isNull ? `S/ Pedido (${p.id})` : `Pedido #${p.numero_pedido}`
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    })
    
    return Array.from(map.entries()).map(([name, items]) => {
      return { 
         name, 
         items,
         numero: items[0]?.numero_pedido ?? 0,
         created_at: items[0]?.created_at ?? '',
         fornecedor: items[0]?.fornecedor_nome,
         cond_pagamento: items[0]?.cond_pagamento,
         data_entrega: items[0]?.data_entrega_prevista,
         status: items[0]?.status ?? 'planejado',
         total: items.reduce((sum, i) => sum + (i.valor_total_real ?? 0), 0)
      }
    }).sort((a, b) => {
      if (a.numero !== b.numero) return b.numero - a.numero
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filtered])

  const totals = filtered.reduce((acc, p) => ({ valor: acc.valor + (p.valor_total_real ?? 0), casas: acc.casas + (p.casas_lote ?? 0) }), { valor: 0, casas: 0 })

  // Etapas that have items
  const etapasComItens = useMemo(() => {
    const etapaIds = new Set(itens.map(i => i.etapa_id))
    return etapas.filter(e => etapaIds.has(e.id))
  }, [etapas, itens])

  return (
    <>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniCard label="Pedidos" value={String(new Set(filtered.map(p => p.numero_pedido)).size)} />
        <MiniCard label="Casas cobertas" value={String(totals.casas)} />
        <MiniCard label="Valor total" value={formatCurrency(totals.valor)} accent="emerald" />
        <MiniCard label="Itens sem pedido" value={String(itens.filter((i) => !pedidos.some((p) => p.item_compra_id === i.id)).length)} accent="amber" />
      </div>

      <div className="mb-4 flex justify-end">
        <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Pedido
        </button>
      </div>

      {/* Enhanced form with etapa-based item picker */}
      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingPedido ? 'Editar Pedido' : 'Novo Pedido'}</h3>
            <button onClick={resetForm} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* ── Global fields ── */}
            <div className="mb-4 rounded-lg border border-primary/10 bg-muted/20 p-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className={LABEL}>Num. Pedido</label>
                  <input type="text" value={globalForm.numero_pedido} onChange={(e) => setGlobalForm((p) => ({ ...p, numero_pedido: e.target.value }))} placeholder="Ex: 1" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Fornecedor</label>
                  <select value={globalForm.fornecedor_id} onChange={(e) => setGlobalForm((p) => ({ ...p, fornecedor_id: e.target.value }))} className={INPUT}>
                    <option value="">Selecione</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Data Entrega Prevista</label>
                  <input type="date" value={globalForm.data_entrega_prevista} onChange={(e) => setGlobalForm((p) => ({ ...p, data_entrega_prevista: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Cond. Pagamento</label>
                  <input type="text" value={globalForm.cond_pagamento} onChange={(e) => setGlobalForm((p) => ({ ...p, cond_pagamento: e.target.value }))} placeholder="30/60" className={INPUT} />
                </div>
              </div>
            </div>

            {/* ── STEP 1: Etapa selector + Item checkboxes ── */}
            {!editingPedido && (
              <div className="rounded-lg border border-border/60 bg-background p-4">
                <div className="mb-3 flex items-center gap-3">
                  <label className={`${LABEL} mb-0 shrink-0`}>Selecionar Etapa</label>
                  <select
                    value={etapaFilter}
                    onChange={(e) => setEtapaFilter(e.target.value)}
                    className={`${INPUT} max-w-xs`}
                  >
                    <option value="">— Selecione uma etapa —</option>
                    {etapasComItens.map(e => (
                      <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>
                    ))}
                  </select>
                </div>

                {etapaFilter && itensForEtapa.length > 0 && (
                  <div className="rounded-lg border bg-muted/10">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={itensForEtapa.length > 0 && itensForEtapa.every(i => loteItems.some(li => li.item_compra_id === i.id))}
                        onChange={toggleAllEtapaItems}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Selecionar todos ({itensForEtapa.length} itens)
                      </span>
                    </div>
                    {/* Item list */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-border/30">
                      {itensForEtapa.map(item => {
                        const isChecked = loteItems.some(li => li.item_compra_id === item.id)
                        return (
                          <label
                            key={item.id}
                            className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/20 ${isChecked ? 'bg-primary/5' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleItemInLote(item.id)}
                              className="h-3.5 w-3.5 shrink-0 rounded accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-muted-foreground">{item.codigo}</span>
                                <span className="truncate text-xs font-medium">{item.descricao}</span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${
                                  item.tipo === 'MATERIAL' ? 'bg-blue-500/10 text-blue-600' :
                                  item.tipo === 'MAO_DE_OBRA' ? 'bg-amber-500/10 text-amber-600' :
                                  'bg-orange-500/10 text-orange-600'
                                }`}>{item.tipo === 'MAO_DE_OBRA' ? 'M.O.' : item.tipo === 'MATERIAL' ? 'MAT' : 'EQP'}</span>
                                {item.qtd_por_casa != null && <span>Qtd/casa: {item.qtd_por_casa}</span>}
                                {item.custo_unitario_orcado > 0 && <span>Custo: {formatCurrency(item.custo_unitario_orcado)}</span>}
                                {item.unidade && <span>{item.unidade}</span>}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
                {etapaFilter && itensForEtapa.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Nenhum item nesta etapa.</p>
                )}
              </div>
            )}

            {/* ── STEP 2: Selected items detail cards ── */}
            {calculatedItems.length > 0 && (
              <>
                <div className="flex items-center justify-between pl-1 pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {calculatedItems.length} ite{calculatedItems.length === 1 ? 'm' : 'ns'} selecionado{calculatedItems.length === 1 ? '' : 's'}
                  </h4>
                </div>

                <div className="space-y-3 pb-3">
                  {calculatedItems.map((li) => (
                    <div key={li.id} className="relative rounded-lg border border-border/60 bg-background p-4 shadow-sm transition-colors hover:border-primary/30">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{li.selectedItem?.codigo}</span>
                          <span className="text-xs font-semibold">{li.selectedItem?.descricao}</span>
                          {li.selectedItem?.etapa_nome && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">{li.selectedItem.etapa_nome}</span>
                          )}
                        </div>
                        {!editingPedido && (
                          <button type="button" onClick={() => removeLoteItem(li.item_compra_id)} className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover item">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-12 md:gap-4">
                        <div className="sm:col-span-3">
                           <label className={LABEL}>Casas do Lote</label>
                           <input type="number" value={li.casas_lote} onChange={(e) => updateLoteItem(li.item_compra_id, 'casas_lote', e.target.value)} className={INPUT} />
                           {li.selectedItem && (
                             <p className={`mt-1 text-[10px] leading-tight ${li.remaining <= 0 ? 'font-semibold text-red-500' : 'text-muted-foreground'}`}>
                               {li.remaining <= 0 ? '⚠ Lote cheio' : `${li.remaining} restantes (${li.used} usadas)`}
                             </p>
                           )}
                        </div>
                        <div className="sm:col-span-3">
                          <label className={LABEL}>Qtd (auto)</label>
                          <input type="text" readOnly value={li.qtdPorCasa ? `${li.casasLote} × ${li.qtdPorCasa} = ${li.qtdLoteCalc}` : '—'} className={`${INPUT} bg-muted/40 text-muted-foreground`} />
                        </div>
                        <div className="sm:col-span-3">
                           <label className={LABEL}>Valor Un. (R$)</label>
                           <input type="text" value={li.valor_unitario_real} onChange={(e) => updateLoteItem(li.item_compra_id, 'valor_unitario_real', e.target.value)} placeholder="0,00" className={INPUT} />
                           {li.selectedItem && li.selectedItem.custo_unitario_orcado > 0 && (
                             <p className="mt-1 text-[10px] text-muted-foreground">Orçado: {formatCurrency(li.selectedItem.custo_unitario_orcado)}</p>
                           )}
                        </div>
                        <div className="sm:col-span-3">
                          <label className={LABEL}>Total Item</label>
                          <input type="text" readOnly value={li.valorTotalCalc > 0 ? formatCurrency(li.valorTotalCalc) : '—'} className={`${INPUT} bg-primary/5 text-right font-semibold text-primary`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Auto-calc summary TOTAL */}
            {valorTotalLote > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
                <span className="text-sm font-semibold tracking-wide text-emerald-800 dark:text-emerald-400">TOTAL DO PEDIDO</span>
                <strong className="text-xl text-emerald-700 dark:text-emerald-400">{formatCurrency(valorTotalLote)}</strong>
              </div>
            )}

            {/* Parcela preview */}
            {parcelaPreview.length > 0 && (
              <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Preview de Parcelas Geradas ({parcelaPreview.length}x)
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {parcelaPreview.map((p, i) => (
                    <div key={i} className="flex items-center rounded-md border bg-card px-3 py-1.5 shadow-sm">
                      <span className="font-bold text-primary">P{p.numero_parcela}</span>
                      <span className="mx-2 text-muted-foreground opacity-50">|</span>
                      <span className="font-semibold">{formatCurrency(p.valor)}</span>
                      <span className="mx-2 text-muted-foreground">em</span>
                      <span className="font-medium text-foreground">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editingPedido && (
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div>
                  <label className={LABEL}>Status do Pedido</label>
                  <select value={globalForm.status} onChange={(e) => setGlobalForm((p) => ({ ...p, status: e.target.value as Pedido['status'] }))} className={INPUT}>
                    <option value="planejado">Planejado</option>
                    <option value="pedido_enviado">Enviado</option>
                    <option value="entregue">Entregue</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={resetForm} className="rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-accent/50">Cancelar</button>
              <button type="submit" disabled={createPedidoLote.isPending || updatePedido.isPending || calculatedItems.length === 0} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50">
                <Check className="h-4 w-4" />{editingPedido ? 'Salvar Alteração' : `Finalizar Pedido (${calculatedItems.length} ite${calculatedItems.length === 1 ? 'm' : 'ns'}) + Parcelas`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold">Excluir pedido?</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              O pedido será excluído (soft delete). Parcelas não pagas vinculadas também serão removidas. Parcelas já pagas serão mantidas.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deletePedido.isPending} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50">
                <Trash2 className="h-3 w-3" /> {deletePedido.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhum pedido encontrado" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">
                  <input type="checkbox"
                    checked={selection.count === filtered.length && filtered.length > 0}
                    onChange={() => selection.toggleAll(filtered.map(p => p.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th colSpan={2} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pedido / Fornecedor / Item</th>
                <th colSpan={3} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Infos / Casas / Qtd</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <React.Fragment key={group.name}>
                  {/* Header Row */}
                  <tr className="bg-muted/30 font-semibold border-t">
                    <td className="px-3 py-2 text-center border-b">
                    </td>
                    <td className="px-3 py-2 border-b" colSpan={2}>
                      <div className="flex items-center gap-2">
                         <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                           {group.name}
                         </span>
                         <span className="text-[10px] text-muted-foreground">{group.fornecedor ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b" colSpan={3}>
                       <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>Cond: <span className="font-mono text-foreground">{group.cond_pagamento ?? '—'}</span></span>
                          <span className="opacity-50">|</span>
                          <span>Entr: <span className="text-foreground">{group.data_entrega ? localDate(group.data_entrega).toLocaleDateString('pt-BR') : '—'}</span></span>
                          <span className="opacity-50">|</span>
                          <span className={`rounded-full px-2 py-0.5 font-bold ${statusColors[group.status] ?? ''}`}>{group.status === 'confirmado' ? 'Confirmado' : group.status === 'planejado' ? 'Plan.' : group.status.charAt(0).toUpperCase() + group.status.slice(1)}</span>
                       </div>
                    </td>
                    <td className="px-3 py-2 text-right border-b text-primary tracking-tight font-bold">{formatCurrency(group.total)}</td>
                    <td className="px-3 py-2 border-b" colSpan={1}></td>
                  </tr>

                  {/* Children Rows */}
                  {group.items.map(p => (
                    <tr key={p.id} className="group/row hover:bg-muted/10 text-muted-foreground border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={selection.isSelected(p.id)}
                          onChange={() => selection.toggle(p.id)}
                          className="h-3 w-3 rounded accent-primary" />
                      </td>
                      <td className="px-3 py-2 pl-6" colSpan={2}>
                        <div className="text-xs font-medium text-foreground">{p.item_descricao ?? '—'}</div>
                        <div className="font-mono text-[10px] opacity-70">{p.item_codigo ?? ''}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs" colSpan={2}>{p.casas_lote ? `${p.casas_lote} casas` : ''}</td>
                      <td className="px-3 py-2 text-right text-xs font-mono">{p.qtd_lote ? `${p.qtd_lote} unid.` : ''}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">{p.valor_total_real != null ? formatCurrency(p.valor_total_real) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                          <button onClick={() => startEdit(p)} className="rounded-md p-1 hover:bg-accent text-foreground" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete(p.id)} className="rounded-md p-1 hover:bg-destructive/10 text-destructive" title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <PedidosBulkActions
          pedidos={pedidos}
          selectedIds={selection.selected}
          onDone={selection.clear}
        />
      </BulkActionBar>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// FORNECEDORES TAB
// ═══════════════════════════════════════════════════════════════

function FornecedoresTab({ search }: { search: string }) {
  const { data: fornecedores = [], isLoading } = useFornecedores()
  const createFornecedor = useCreateFornecedor()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', cnpj: '', contato: '', cond_pagamento_padrao: '' })
  
  const selection = useSelection()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createFornecedor.mutateAsync({
      nome: form.nome, cnpj: form.cnpj || null,
      contato: form.contato || null, cond_pagamento_padrao: form.cond_pagamento_padrao || null,
    })
    setShowForm(false)
    setForm({ nome: '', cnpj: '', contato: '', cond_pagamento_padrao: '' })
  }

  const filtered = fornecedores.filter((f) =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.cnpj ?? '').includes(search)
  )

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Fornecedor
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className={LABEL}>Nome *</label><input type="text" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className={INPUT} /></div>
              <div><label className={LABEL}>CNPJ</label><input type="text" value={form.cnpj} onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Contato</label><input type="text" value={form.contato} onChange={(e) => setForm((p) => ({ ...p, contato: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Cond. Pagamento</label><input type="text" value={form.cond_pagamento_padrao} onChange={(e) => setForm((p) => ({ ...p, cond_pagamento_padrao: e.target.value }))} placeholder="30/60/90" className={INPUT} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Criar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhum fornecedor" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">
                  <input type="checkbox"
                    checked={selection.count === filtered.length && filtered.length > 0}
                    onChange={() => selection.toggleAll(filtered.map(f => f.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CNPJ</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contato</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condição</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((f) => (
                <tr key={f.id} className="group hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={selection.isSelected(f.id)}
                      onChange={() => selection.toggle(f.id)}
                      className="h-3.5 w-3.5 rounded accent-primary" />
                  </td>
                  <td className="px-3 py-2.5 font-medium">{f.nome}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.cnpj ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.contato ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{f.cond_pagamento_padrao ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <FornecedoresBulkActions
          fornecedores={fornecedores}
          selectedIds={selection.selected}
          onDone={selection.clear}
        />
      </BulkActionBar>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// CURVA ABC TAB — with ComposedChart
// ═══════════════════════════════════════════════════════════════

function CurvaABCTab() {
  const { data: itens = [], isLoading } = useItensCompra()

  const { rows, chartData } = useMemo(() => {
    if (!itens.length) return { rows: [], chartData: [] }

    const totalGeral = itens.reduce((s, i) => s + i.valor_total_orcado, 0)
    if (totalGeral === 0) return { rows: [], chartData: [] }

    // Sort descending by value
    const sorted = [...itens].sort((a, b) => b.valor_total_orcado - a.valor_total_orcado)

    let acum = 0
    const rows = sorted.map((item, idx) => {
      const pct = (item.valor_total_orcado / totalGeral) * 100
      acum += pct
      const classe = acum <= 80 ? 'A' : acum <= 95 ? 'B' : 'C'
      return {
        pos: idx + 1,
        id: item.id,
        codigo: item.codigo,
        descricao: item.descricao,
        etapa_nome: item.etapa_nome ?? '—',
        valor: item.valor_total_orcado,
        pct: Math.round(pct * 100) / 100,
        acum: Math.round(acum * 100) / 100,
        classe,
      }
    })

    const chartData = rows.slice(0, 30).map((r) => ({
      name: r.codigo || `#${r.pos}`,
      valor: r.valor,
      acumulado: r.acum,
    }))

    return { rows, chartData }
  }, [itens])

  const classeBadge = (c: string) => {
    if (c === 'A') return 'bg-red-500/10 text-red-600 font-bold'
    if (c === 'B') return 'bg-amber-500/10 text-amber-600 font-semibold'
    return 'bg-emerald-500/10 text-emerald-600'
  }

  if (isLoading) return <Spinner />

  return (
    <>
      {/* Chart */}
      {chartData.length > 0 && (
        <div className="mb-5 rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Curva ABC — Top 30 itens</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={50} />
                <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${v}%`} />
                <RTooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar yAxisId="left" dataKey="valor" fill="rgb(59 130 246 / 0.6)" radius={[2, 2, 0, 0]} name="Valor (R$)" />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="rgb(239 68 68)" strokeWidth={2} dot={false} name="% Acumulado" />
                <ReferenceLine yAxisId="right" y={80} stroke="rgb(239 68 68 / 0.4)" strokeDasharray="4 4" label={{ value: '80%', position: 'right', fontSize: 9 }} />
                <ReferenceLine yAxisId="right" y={95} stroke="rgb(245 158 11 / 0.4)" strokeDasharray="4 4" label={{ value: '95%', position: 'right', fontSize: 9 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? <EmptyState msg="Sem itens para análise ABC" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">% Total</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">% Acum.</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Classe</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{r.pos}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs font-medium">{r.codigo} — {r.descricao}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.etapa_nome}</td>
                  <td className="px-3 py-2 text-right text-xs">{formatCurrency(r.valor)}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.pct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-xs font-medium">{r.acum.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${classeBadge(r.classe)}`}>{r.classe}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// POR FORNECEDOR TAB
// ═══════════════════════════════════════════════════════════════

function PorFornecedorTab() {
  const { data: itens = [], isLoading } = useItensCompra()
  const { data: parcelas = [] } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: fornecedores = [] } = useFornecedores()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const groups = useMemo(() => {
    // Group items by fornecedor
    const map = new Map<string, { fornecedor: Fornecedor | null; itens: ItemCompra[]; totalOrcado: number; totalConsumido: number }>()

    itens.forEach((item) => {
      const fid = item.fornecedor_id ?? '__sem_fornecedor__'
      if (!map.has(fid)) {
        const forn = fornecedores.find((f) => f.id === fid) ?? null
        map.set(fid, { fornecedor: forn, itens: [], totalOrcado: 0, totalConsumido: 0 })
      }
      const g = map.get(fid)!
      g.itens.push(item)
      g.totalOrcado += item.valor_total_orcado
      g.totalConsumido += item.valor_consumido
    })

    // Enrich with parcela info
    return [...map.entries()].map(([fid, g]) => {
      // Find pedidos of this fornecedor
      const fornPedidos = pedidos.filter((p) => (p.fornecedor_id ?? '__sem_fornecedor__') === fid)
      const pedidoIds = new Set(fornPedidos.map((p) => p.id))

      // Find parcelas
      const fornParcelas = parcelas.filter((p) => p.pedido_id && pedidoIds.has(p.pedido_id))
      const totalPago = fornParcelas.filter((p) => p.status === 'paga').reduce((s, p) => s + p.valor_pago, 0)
      const pendente = fornParcelas.filter((p) => p.status !== 'paga').reduce((s, p) => s + p.valor - p.valor_pago, 0)

      // Next due date
      const today = new Date().toISOString().split('T')[0]!
      const proxVenc = fornParcelas
        .filter((p) => p.status !== 'paga' && p.data_vencimento >= today)
        .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))[0]

      return {
        id: fid,
        nome: g.fornecedor?.nome ?? 'Sem Fornecedor',
        itens: g.itens,
        totalOrcado: g.totalOrcado,
        totalConsumido: g.totalConsumido,
        totalPago,
        pendente,
        proxVenc: proxVenc ? proxVenc.data_vencimento : null,
      }
    }).sort((a, b) => b.totalOrcado - a.totalOrcado)
  }, [itens, parcelas, pedidos, fornecedores])

  if (isLoading) return <Spinner />
  if (groups.length === 0) return <EmptyState msg="Sem dados de fornecedores" />

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.id} className="rounded-xl border bg-card transition-shadow hover:shadow-sm">
          <button
            onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            {expandedId === g.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{g.nome}</h4>
              <p className="text-[10px] text-muted-foreground">{g.itens.length} itens</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Orçado</p>
                <p className="font-medium">{formatCurrency(g.totalOrcado)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Pago</p>
                <p className="font-medium text-emerald-500">{formatCurrency(g.totalPago)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Pendente</p>
                <p className="font-medium text-amber-500">{formatCurrency(g.pendente)}</p>
              </div>
              {g.proxVenc && (
                <div className="flex items-center gap-1 text-right">
                  <CalendarClock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{localDate(g.proxVenc).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </button>

          {expandedId === g.id && (
            <div className="border-t px-4 pb-3 pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] uppercase text-muted-foreground">
                    <th className="py-1 text-left">Código</th>
                    <th className="py-1 text-left">Descrição</th>
                    <th className="py-1 text-left">Tipo</th>
                    <th className="py-1 text-right">Orçado</th>
                    <th className="py-1 text-right">Consumido</th>
                    <th className="py-1 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {g.itens.map((i) => (
                    <tr key={i.id}>
                      <td className="py-1.5 font-mono text-[10px]">{i.codigo}</td>
                      <td className="max-w-[180px] truncate py-1.5">{i.descricao}</td>
                      <td className="py-1.5 text-muted-foreground">{i.tipo === 'MAO_DE_OBRA' ? 'M.O.' : i.tipo === 'MATERIAL' ? 'MAT' : 'EQP'}</td>
                      <td className="py-1.5 text-right">{formatCurrency(i.valor_total_orcado)}</td>
                      <td className="py-1.5 text-right text-amber-500">{formatCurrency(i.valor_consumido)}</td>
                      <td className={`py-1.5 text-right font-medium ${i.valor_saldo >= 0 ? '' : 'text-red-500'}`}>{formatCurrency(i.valor_saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared micro-components
// ═══════════════════════════════════════════════════════════════

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : ''
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Spinner() {
  return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}
