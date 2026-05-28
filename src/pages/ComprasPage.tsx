import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConferenciaPedidos } from '@/components/compras/ConferenciaPedidos'
import { MatrizCompras } from '@/components/compras/MatrizCompras'
import { usePedidosConformidade } from '@/hooks/usePedidos'
import {
  useItensCompra, useFornecedores, useCreateItemCompra, useUpdateItemCompra, useDeleteItemCompra,
  usePedidoItens,
  useCreateFornecedor, useUpdateFornecedor, useDeleteFornecedor,
  usePedidos, useCreatePedidoLote, useUpdatePedido, useDeletePedido,
  type ItemCompra, type Pedido, type Fornecedor,
} from '@/hooks/useCompras'
import { useParcelas, useCreateParcela } from '@/hooks/useFinanceiro'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
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
  ShoppingCart, Plus, X, Check, Pencil, Package, Truck, Users, Copy,
  Search, BarChart3, ChevronDown, ChevronRight, CalendarClock, Trash2, Boxes,
  AlertTriangle, Loader2, CalendarDays, CheckCircle2,
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

type Tab = 'itens' | 'pedidos' | 'matriz' | 'fornecedores' | 'curva_abc' | 'por_fornecedor' | 'conferencia' | 'conf_cronograma'

export default function Compras() {
  const { restartTour } = useTour('compras', pageTours.compras)

  const [searchParams] = useSearchParams()
  const initialEtapa = searchParams.get('etapa')
  const [tab, setTab] = useState<Tab>('itens')
  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  // Badge "em risco" para a aba de conferência de cronograma
  const { data: conformidade = [] } = usePedidosConformidade()
  const atRiskCount = conformidade.filter(
    i => i.status_conformidade === 'risco' || i.status_conformidade === 'critico'
  ).length

  const TABS: Array<{ key: Tab; label: string; icon: typeof Package; badge?: number }> = [
    { key: 'itens',            label: 'Itens',                  icon: Package },
    { key: 'pedidos',          label: 'Pedidos',                icon: Truck },
    { key: 'matriz',           label: 'Matriz',                 icon: Boxes },
    { key: 'conferencia',      label: 'Conferência',            icon: BarChart3 },
    { key: 'conf_cronograma',  label: 'Conf. Cronograma',       icon: CalendarClock, badge: atRiskCount || undefined },
    { key: 'fornecedores',     label: 'Parceiros',              icon: Users },
    { key: 'curva_abc',        label: 'Curva ABC',              icon: BarChart3 },
    { key: 'por_fornecedor',   label: 'Por Parceiro',           icon: Users },
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
            className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search (not for charts) */}
      {(tab === 'itens' || tab === 'pedidos' || tab === 'matriz' || tab === 'fornecedores' || tab === 'conferencia' || tab === 'conf_cronograma') && (
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

      {tab === 'itens'           && <ItensTab search={search} filterEtapa={initialEtapa} />}
      {tab === 'pedidos'         && <PedidosTab search={search} />}
      {tab === 'matriz'          && <MatrizCompras search={search} />}
      {tab === 'conferencia'     && <ConferenciaWBSTab search={search} />}
      {tab === 'conf_cronograma' && <ConferenciaPedidos search={search} />}
      {tab === 'fornecedores'    && <FornecedoresTab search={search} />}
      {tab === 'curva_abc'       && <CurvaABCTab />}
      {tab === 'por_fornecedor'  && <PorFornecedorTab />}
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
  const { data: pedidoItens = [] } = usePedidoItens()
  const createItem = useCreateItemCompra()
  const updateItem = useUpdateItemCompra()
  const deleteItem = useDeleteItemCompra()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inlineField, setInlineField] = useState<{ id: string; field: string; value: string } | null>(null)
  // Drill-down: item de orçamento selecionado pra ver detalhes de consumo
  const [drillDownItemId, setDrillDownItemId] = useState<string | null>(null)
  const selection = useSelection()

  // Pós-migration: consumo é derivado de pedido_itens agrupado por item_compra_id.
  // Antes a tabela usava pedido.valor_total_real direto, o que sobre-contava em
  // pedidos novos (1 NF = N itens compartilham o mesmo valor_total no header).
  const consumoPorItem = useMemo(() => {
    const map = new Map<string, {
      qtd_planejada: number       // pedidos não-cancelados, qtd ainda não recebida
      qtd_recebida: number        // SUM(qtd_recebida) em não-cancelados
      valor_comprometido: number  // SUM(valor_total_real) em não-cancelados
      valor_recebido: number      // SUM(qtd_recebida × valor_unitario_real) em não-cancelados
      ocorrencias: number         // quantos pedido_itens existem
    }>()
    for (const pi of pedidoItens) {
      const ped = pi.pedidos
      if (!ped || ped.status === 'cancelado') continue
      const k = pi.item_compra_id
      const entry = map.get(k) ?? { qtd_planejada: 0, qtd_recebida: 0, valor_comprometido: 0, valor_recebido: 0, ocorrencias: 0 }
      const qtd = Number(pi.qtd ?? 0)
      const qtdRec = Number(pi.qtd_recebida ?? 0)
      const vu = Number(pi.valor_unitario_real ?? 0)
      // fora_orcamento: pedido_itens criados como SOBRA de "Consumir previsão" com
      // estouro permitido. Contam pra qtd_recebida (cosmético) e valor_recebido
      // (pagamento real via NF), mas NÃO inflam o valor_comprometido do item orçado.
      const foraOrcamento = (pi as { fora_orcamento?: boolean }).fora_orcamento === true
      entry.qtd_recebida += qtdRec
      if (!foraOrcamento) entry.qtd_planejada += Math.max(qtd - qtdRec, 0)
      if (!foraOrcamento) entry.valor_comprometido += Number(pi.valor_total_real ?? 0)
      entry.valor_recebido += qtdRec * vu
      entry.ocorrencias += 1
      map.set(k, entry)
    }
    return map
  }, [pedidoItens])

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
        <MiniCard label="% Consumido" value={`${totals.orcado > 0 ? ((totals.consumido / totals.orcado) * 100).toFixed(0) : 0}%`} accent="amber" />
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
          <table className="tbl-bf w-full text-sm">
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
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Soma comprometida em pedidos não-cancelados (planejado + recebido)">Comprometido</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Quantidade efetivamente recebida via NF (qtd_recebida) / quantidade total orçada">Recebido (qtd)</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pago</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => {
                // Consumo derivado de pedido_itens (fonte de verdade pós-migration).
                const consumo = consumoPorItem.get(item.id) ?? { qtd_planejada: 0, qtd_recebida: 0, valor_comprometido: 0, valor_recebido: 0, ocorrencias: 0 }
                const itemComprometido = consumo.valor_comprometido
                const itemPago = parcelas.filter(p => p.item_compra_id === item.id).reduce((s, p) => s + (p.valor_pago || 0), 0)
                const saldoReal = item.valor_total_orcado - itemComprometido
                const qtdTotal = item.qtd_total ?? 0
                const qtdRecebida = consumo.qtd_recebida
                const pctRecebido = qtdTotal > 0 ? (qtdRecebida / qtdTotal) * 100 : 0
                const duplicadoSuspeito = qtdTotal > 0 && qtdRecebida > qtdTotal + 0.001
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
                  <td className="px-3 py-2.5 text-right text-xs text-amber-500">{formatCurrency(itemComprometido)}</td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {qtdTotal > 0 ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className={`font-mono text-[10px] ${duplicadoSuspeito ? 'text-red-600 font-bold' : pctRecebido >= 99.9 ? 'text-emerald-600' : pctRecebido > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {formatNumber(qtdRecebida, 2, 2)} / {formatNumber(qtdTotal, 2, 2)}
                        </span>
                        {duplicadoSuspeito && (
                          <span className="text-red-600" title={`Atenção: recebido (${qtdRecebida}) excede orçado (${qtdTotal}). Possível duplicação.`}>⚠</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-blue-500 font-medium">{formatCurrency(itemPago)}</td>
                  <td className={`px-3 py-2.5 text-right text-xs font-medium ${saldoReal >= 0 ? '' : 'text-red-500'}`}>{formatCurrency(saldoReal)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => setDrillDownItemId(item.id)}
                        className="rounded-md p-1 hover:bg-accent text-foreground"
                        title="Ver pedidos e consumo detalhado deste item"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
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

      {/* Drill-down: detalha o consumo do item — todos os pedidos, NFs, recebido, saldo */}
      {drillDownItemId && (() => {
        const item = itens.find(i => i.id === drillDownItemId)
        if (!item) return null
        const linhasDoItem = pedidoItens.filter((pi: any) => pi.item_compra_id === drillDownItemId)
        const ativas = linhasDoItem.filter((pi: any) => pi.pedidos?.status !== 'cancelado')
        const canceladas = linhasDoItem.filter((pi: any) => pi.pedidos?.status === 'cancelado')
        const totQtd = ativas.reduce((s, pi: any) => s + Number(pi.qtd ?? 0), 0)
        const totQtdRec = ativas.reduce((s, pi: any) => s + Number(pi.qtd_recebida ?? 0), 0)
        const totValor = ativas.reduce((s, pi: any) => s + Number(pi.valor_total_real ?? 0), 0)
        const totRecebido = ativas.reduce((s, pi: any) => s + Number(pi.qtd_recebida ?? 0) * Number(pi.valor_unitario_real ?? 0), 0)
        // Cobertura de previsão: pedidos is_previsao_orcamento=true ganham
        // valor_coberto_por_realizacao quando NFs externas abatem o saldo
        // financeiro. Pago vem da soma de parcelas.valor_pago.
        // Em ambos os casos somamos só uma vez por pedido (a query traz
        // repetido por pedido_item).
        const pedidosVistos = new Set<string>()
        const totCoberto = ativas.reduce((s, pi: any) => {
          const pid = pi.pedido_id
          if (!pid || pedidosVistos.has(pid)) return s
          pedidosVistos.add(pid)
          if (pi.pedidos?.is_previsao_orcamento !== true) return s
          return s + Number(pi.pedidos?.valor_coberto_por_realizacao ?? 0)
        }, 0)
        const pedidosVistosPago = new Set<string>()
        const totPago = ativas.reduce((s, pi: any) => {
          const pid = pi.pedido_id
          if (!pid || pedidosVistosPago.has(pid)) return s
          pedidosVistosPago.add(pid)
          const parcelas = (pi.pedidos?.parcelas ?? []) as Array<{ valor_pago: number | null }>
          return s + parcelas.reduce((acc, p) => acc + Number(p.valor_pago ?? 0), 0)
        }, 0)
        const qtdOrc = item.qtd_total ?? 0
        // Só conta como duplicação se qtd recebida (consumo físico) excede orçada.
        // Previsões com qtd=1 fictícia não disparam esse alerta — qtd fictícia + qtd real
        // somariam falso positivo. Ignora qtd dos pedidos previsão na soma.
        const totQtdRecFisico = ativas.reduce((s, pi: any) => {
          if (pi.pedidos?.is_previsao_orcamento === true) return s
          return s + Number(pi.qtd_recebida ?? 0)
        }, 0)
        const excedeOrcamento = qtdOrc > 0 && totQtdRecFisico > qtdOrc + 0.001
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDrillDownItemId(null)}>
            <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-card border-b px-5 py-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold">{item.descricao}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{item.codigo}</span>
                    {item.etapa_nome && <> · {item.etapa_nome}</>}
                    {item.fornecedor_nome && <> · {item.fornecedor_nome}</>}
                  </p>
                </div>
                <button onClick={() => setDrillDownItemId(null)} className="rounded-md p-1 hover:bg-accent">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Resumo numérico — comparação direta orçado vs comprometido vs recebido */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="rounded-md border bg-muted/10 p-2">
                    <p className="text-[9px] uppercase text-muted-foreground">Qtd orçada</p>
                    <p className="font-bold text-sm">{formatNumber(qtdOrc, 2, 2)} {item.unidade ?? ''}</p>
                  </div>
                  <div className="rounded-md border bg-muted/10 p-2">
                    <p className="text-[9px] uppercase text-muted-foreground">Qtd comprometida</p>
                    <p className="font-bold text-sm text-amber-600">{formatNumber(totQtd, 2, 2)}</p>
                  </div>
                  <div className={`rounded-md border p-2 ${excedeOrcamento ? 'border-red-500/40 bg-red-500/5' : 'bg-muted/10'}`}>
                    <p className="text-[9px] uppercase text-muted-foreground">Qtd recebida</p>
                    <p className={`font-bold text-sm ${excedeOrcamento ? 'text-red-600' : totQtdRec > 0 ? 'text-emerald-600' : ''}`}>
                      {formatNumber(totQtdRec, 2, 2)}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/10 p-2">
                    <p className="text-[9px] uppercase text-muted-foreground">Saldo planejado</p>
                    <p className="font-bold text-sm">{formatNumber(Math.max(totQtd - totQtdRec, 0), 2, 2)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/10 p-2">
                    <p className="text-[9px] uppercase text-muted-foreground">Saldo orçamento</p>
                    <p className={`font-bold text-sm ${(qtdOrc - totQtd) < 0 ? 'text-red-600' : 'text-foreground'}`}>
                      {formatNumber(qtdOrc - totQtd, 2, 2)}
                    </p>
                  </div>
                </div>

                {excedeOrcamento && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Possível duplicação:</strong> a quantidade física recebida ({formatNumber(totQtdRecFisico, 2, 2)}) excede a orçada ({formatNumber(qtdOrc, 2, 2)}).
                      Verifique se alguma NF foi aplicada duas vezes ou se o orçamento precisa ser ajustado.
                    </div>
                  </div>
                )}
                {/* Resumo financeiro do item — mostra total contratado, já pago, coberto por
                    NFs externas e saldo efetivo a pagar (total - pago - coberto).
                    Aparece quando há pelo menos 1 previsão com cobertura. */}
                {totCoberto > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <div className="flex items-center gap-1.5 mb-1.5 font-bold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Previsões financeiras com cobertura por NFs externas
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Total contratado</p>
                        <p className="font-mono font-bold">{formatCurrency(totValor)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Já pago</p>
                        <p className="font-mono font-bold text-blue-700">−{formatCurrency(totPago)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Coberto por NFs</p>
                        <p className="font-mono font-bold text-amber-700">−{formatCurrency(totCoberto)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Saldo efetivo a pagar</p>
                        <p className="font-mono font-bold text-emerald-700">{formatCurrency(Math.max(totValor - totPago - totCoberto, 0))}</p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Parcelas individuais não foram alteradas pra preservar conciliações. O saldo efetivo desconta pagamentos já realizados e cobertura por NFs externas.
                    </p>
                  </div>
                )}

                {/* Lista de pedidos ativos com este item */}
                {ativas.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Pedido</th>
                          <th className="px-2 py-1.5 text-left">Fornecedor</th>
                          <th className="px-2 py-1.5 text-center">Status</th>
                          <th className="px-2 py-1.5 text-right">Qtd</th>
                          <th className="px-2 py-1.5 text-right">Qtd receb.</th>
                          <th className="px-2 py-1.5 text-right">Valor unit.</th>
                          <th className="px-2 py-1.5 text-right">Valor total</th>
                          <th className="px-2 py-1.5 text-left">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {ativas.map((pi: any) => {
                          const ped = pi.pedidos
                          const numero = ped?.numero_pedido ?? '?'
                          const isNF = !!ped?.nf_origem_id
                          const isPrev = ped?.is_previsao_orcamento === true
                          const coberto = isPrev ? Number(ped?.valor_coberto_por_realizacao ?? 0) : 0
                          return (
                            <tr key={pi.id} className="hover:bg-muted/20">
                              <td className="px-2 py-1.5 font-mono">
                                #{numero}
                                {isPrev && (
                                  <span className="ml-1 text-[8px] rounded bg-amber-500/20 text-amber-800 px-1 py-0.5 font-semibold uppercase">prev</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 truncate max-w-[150px]">{ped?.fornecedores?.nome ?? '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="rounded px-1 py-0.5 text-[9px] capitalize bg-muted">{(ped?.status ?? '').replace('_', ' ')}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono">{formatNumber(Number(pi.qtd ?? 0), 2, 2)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">{formatNumber(Number(pi.qtd_recebida ?? 0), 2, 2)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(Number(pi.valor_unitario_real ?? 0))}</td>
                              <td className="px-2 py-1.5 text-right font-mono font-medium">
                                {formatCurrency(Number(pi.valor_total_real ?? 0))}
                                {coberto > 0 && (
                                  <div className="text-[9px] text-amber-700 font-normal" title="Valor coberto por NFs externas (saldo a pagar efetivo é total − pago − coberto)">
                                    −{formatCurrency(coberto)} coberto
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-[10px]">
                                {isNF ? <span className="text-blue-600">via NF</span> : <span className="text-muted-foreground">manual</span>}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-primary/5 font-bold">
                          <td colSpan={3} className="px-2 py-1.5 text-right">Total ativo</td>
                          <td className="px-2 py-1.5 text-right font-mono">{formatNumber(totQtd, 2, 2)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{formatNumber(totQtdRec, 2, 2)}</td>
                          <td className="px-2 py-1.5 text-right">—</td>
                          <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(totValor)}</td>
                          <td className="px-2 py-1.5 text-[10px] text-muted-foreground">recebido R$ {formatNumber(totRecebido, 2, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
                    Nenhum pedido ativo deste item ainda. Saldo orçado integral.
                  </div>
                )}

                {canceladas.length > 0 && (
                  <details className="rounded-md border bg-muted/5">
                    <summary className="cursor-pointer px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/20">
                      + {canceladas.length} pedido(s) cancelado(s) (não contam no consumo)
                    </summary>
                    <div className="border-t divide-y text-[10px] max-h-32 overflow-y-auto">
                      {canceladas.map((pi: any) => (
                        <div key={pi.id} className="px-3 py-1 flex items-center justify-between gap-2 text-muted-foreground">
                          <span className="font-mono">#{pi.pedidos?.numero_pedido ?? '?'}</span>
                          <span>{formatNumber(Number(pi.qtd ?? 0), 2, 2)} × {formatCurrency(Number(pi.valor_unitario_real ?? 0))}</span>
                          <span className="line-through">{formatCurrency(Number(pi.valor_total_real ?? 0))}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )
      })()}
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
  const { data: parcelasAll = [] } = useParcelas()
  // createPedido not used directly — bulk creation handled by createPedidoLote
  const updatePedido = useUpdatePedido()
  const deletePedido = useDeletePedido()

  const selection = useSelection()

  const { data: etapas = [] } = useEtapas()
  const [showForm, setShowForm] = useState(false)
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pedidoViewMode, setPedidoViewMode] = useState<'pedido' | 'etapa'>('pedido')
  const [expandedCascade, setExpandedCascade] = useState<Record<string, boolean>>({})
  const [expandedParcelas, setExpandedParcelas] = useState<Set<string>>(new Set())
  // PR 3.4: pedidos colapsados por padrão. Set guarda os EXPANDIDOS (vazio = todos colapsados).
  const [expandedPedidos, setExpandedPedidos] = useState<Set<string>>(new Set())
  const toggleCascade = (k: string) => setExpandedCascade(p => ({ ...p, [k]: !p[k] }))
  const toggleParcelas = (k: string) => setExpandedParcelas(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const togglePedido = (k: string) => setExpandedPedidos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const expandirTodosPedidos = () => setExpandedPedidos(new Set(grouped.map(g => g.name)))
  const colapsarTodosPedidos = () => setExpandedPedidos(new Set())
  // PR 3.4: filtros da aba Pedidos
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroFornecedor, setFiltroFornecedor] = useState<string>('')
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'nf' | 'manual' | 'livre'>('todos')
  const [filtroSemParcela, setFiltroSemParcela] = useState(false)

  // ── Gerar parcelas inline ───────────────────────────────────────────────────
  type GerarDialog = {
    pedido: Pedido
    dataBase: string
    parcelas: ReturnType<typeof gerarParcelas>
    loading: boolean
    nfDate: string | null
  }
  const [gerarDialog, setGerarDialog] = useState<GerarDialog | null>(null)
  const [fetchingParcelaId, setFetchingParcelaId] = useState<string | null>(null)
  const [bulkGerandoParcelas, setBulkGerandoParcelas] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const createParcela = useCreateParcela()

  // Pedidos que têm ao menos uma parcela com pagamento — usados pelo filtro "Sem vínculo"
  const pedidosComPagamento = useMemo(() => {
    const s = new Set<string>()
    parcelasAll.forEach((pa: any) => {
      if (Number(pa.valor_pago) > 0 && pa.pedido_id) s.add(pa.pedido_id)
    })
    return s
  }, [parcelasAll])

  // Pedidos que têm ao menos uma parcela gerada (independente de pagamento)
  const pedidosComParcela = useMemo(() => {
    const s = new Set<string>()
    parcelasAll.forEach((pa: any) => { if (pa.pedido_id) s.add(pa.pedido_id) })
    return s
  }, [parcelasAll])

  // ── Handlers: gerar parcelas inline ────────────────────────────────────────
  const iniciarGerar = async (p: Pedido) => {
    setFetchingParcelaId(p.id)
    let dataBase = p.data_entrega_real || ''
    let nfDate: string | null = null
    if (!dataBase && p.nf_origem_id) {
      const { data } = await supabase.from('recepcao_docs').select('data_emissao').eq('id', p.nf_origem_id).single()
      if (data?.data_emissao) { nfDate = data.data_emissao; dataBase = data.data_emissao }
    }
    if (!dataBase) dataBase = new Date().toISOString().split('T')[0]!
    const parc = gerarParcelas({
      pedidoId: p.id,
      companyId: currentCompany?.id ?? '',
      valorTotal: Number(p.valor_total_real || 0),
      condPagamento: p.cond_pagamento || '0',
      dataEntrega: new Date(dataBase + 'T12:00:00'),
    })
    setFetchingParcelaId(null)
    setGerarDialog({ pedido: p, dataBase, parcelas: parc, loading: false, nfDate })
  }

  const onGerarDataChange = (novaData: string) => {
    if (!gerarDialog) return
    const parc = gerarParcelas({
      pedidoId: gerarDialog.pedido.id,
      companyId: currentCompany?.id ?? '',
      valorTotal: Number(gerarDialog.pedido.valor_total_real || 0),
      condPagamento: gerarDialog.pedido.cond_pagamento || '0',
      dataEntrega: new Date(novaData + 'T12:00:00'),
    })
    setGerarDialog({ ...gerarDialog, dataBase: novaData, parcelas: parc })
  }

  const gerarParcelasBulk = async () => {
    const pedidosSemParc = filtered.filter(p => !pedidosComParcela.has(p.id))
    if (pedidosSemParc.length === 0) return
    setBulkGerandoParcelas(true)
    setBulkConfirm(false)
    try {
      const todasParcelas: any[] = []
      for (const p of pedidosSemParc) {
        const dataBase = p.data_entrega_real || new Date().toISOString().split('T')[0]
        const parcelas = gerarParcelas({
          pedidoId: p.id,
          companyId: currentCompany?.id ?? '',
          valorTotal: Number(p.valor_total_real || 0),
          condPagamento: p.cond_pagamento || '0',
          dataEntrega: new Date(dataBase + 'T12:00:00'),
        })
        for (const parc of parcelas) {
          todasParcelas.push({ ...parc, tipo: 'contratual', data_prevista_pagamento: parc.data_vencimento })
        }
      }
      const { error } = await supabase.from('parcelas').insert(todasParcelas)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success(`${todasParcelas.length} parcela(s) criadas para ${pedidosSemParc.length} pedido(s)`)
      setFiltroSemParcela(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBulkGerandoParcelas(false)
    }
  }

  const confirmarGerar = async () => {
    if (!gerarDialog) return
    setGerarDialog(s => s ? { ...s, loading: true } : null)
    try {
      if (gerarDialog.nfDate && !gerarDialog.pedido.data_entrega_real) {
        await updatePedido.mutateAsync({ id: gerarDialog.pedido.id, data_entrega_real: gerarDialog.nfDate })
      }
      for (const parc of gerarDialog.parcelas) {
        await createParcela.mutateAsync({ ...parc, tipo: 'contratual', data_prevista_pagamento: parc.data_vencimento } as any)
      }
      toast.success(`${gerarDialog.parcelas.length} parcela(s) criada(s) — Pedido #${gerarDialog.pedido.numero_pedido}`)
      setGerarDialog(null)
    } catch { setGerarDialog(s => s ? { ...s, loading: false } : null) }
  }

  const emptyGlobal = { fornecedor_id: '', cond_pagamento: '', data_entrega_prevista: '', status: 'planejado' as Pedido['status'], observacoes: '', is_previsao_orcamento: false }
  const [globalForm, setGlobalForm] = useState(emptyGlobal)
  const [condFromForn, setCondFromForn] = useState(false)

  const handleFornecedorChange = (fornId: string) => {
    const forn = fornecedores.find(f => f.id === fornId)
    const condPadrao = forn?.cond_pagamento_padrao || ''
    setGlobalForm(p => ({
      ...p,
      fornecedor_id: fornId,
      // Auto-fill only if user hasn't manually typed a condition
      ...((!p.cond_pagamento || condFromForn) ? { cond_pagamento: condPadrao } : {}),
    }))
    setCondFromForn(!!condPadrao)
  }

  // ─── New: Etapa-based item selector ───
  const [etapaFilter, setEtapaFilter] = useState<string>('')
  
  interface LoteItem {
    id: string
    item_compra_id: string
    casas_lote: string
    valor_unitario_real: string
    /** Override aplicado quando edita pedido existente: respeita valor_total_real salvo
     *  até o usuário mexer em casas_lote ou valor_unitario_real. */
    valor_total_real_override?: number | null
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
    setLoteItems(prev => prev.map(i => {
      if (i.item_compra_id !== itemCompraId) return i
      // Quando user altera casas_lote ou valor_unitario, limpa override → volta a calcular
      const clearOverride = (field === 'casas_lote' || field === 'valor_unitario_real')
      return { ...i, [field]: value, ...(clearOverride ? { valor_total_real_override: null } : {}) }
    }))
  }

  const removeLoteItem = (itemCompraId: string) => {
    setLoteItems(prev => prev.filter(i => i.item_compra_id !== itemCompraId))
  }

  // -- Auto-calculate valor_total do lote
  const calculatedItems = useMemo(() => {
    return loteItems.map(li => {
      const selectedItem = itens.find((i) => i.id === li.item_compra_id)
      const casasLote = parseFloat(li.casas_lote?.replace(',', '.') || '0') || 0
      const qtdPorCasa = selectedItem?.qtd_por_casa ?? 0
      const precoUnit = parseBRL(li.valor_unitario_real)
      const qtdLoteCalc = Math.round(casasLote * qtdPorCasa * 100) / 100
      // Se houver override salvo (edição de pedido com valor_total_real divergente do
      // calculado), respeita o override até o usuário tocar em casas_lote ou valor_unit.
      // Isso evita que pedidos com valor_total_real "manualmente ajustado" tenham seu
      // total recalculado e exibido errado na UI.
      const calcDoLote = Math.round(qtdLoteCalc * precoUnit * 100) / 100
      const valorTotalCalc = (li.valor_total_real_override != null && li.valor_total_real_override > 0)
        ? li.valor_total_real_override
        : calcDoLote

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

  // -- Editable parcelas state
  interface EditableParcela { id: string; numero_parcela: number; valor: string; data_vencimento: string; status: string; descricao: string; tipo?: 'contratual' | 'adiantamento'; valor_pago?: number }
  const [editableParcelas, setEditableParcelas] = useState<EditableParcela[]>([])
  const [parcelasManuallyEdited, setParcelasManuallyEdited] = useState(false)
  const adiantamentos = editableParcelas.filter(p => p.tipo === 'adiantamento')
  const contratuaisEditaveis = editableParcelas.filter(p => p.tipo !== 'adiantamento')
  const totalAdiantado = adiantamentos.reduce((s, p) => s + parseBRL(p.valor), 0)
  const saldoAParcelarContratual = Math.max(0, valorTotalLote - totalAdiantado)

  // Auto-generate parcelas when conditions change (unless manually edited)
  useEffect(() => {
    if (parcelasManuallyEdited) return
    if (valorTotalLote <= 0 || !globalForm.cond_pagamento || !globalForm.data_entrega_prevista) {
      setEditableParcelas([])
      return
    }
    const generated = gerarParcelas({
      pedidoId: 'preview', companyId: 'preview',
      valorTotal: valorTotalLote,
      condPagamento: globalForm.cond_pagamento,
      dataEntrega: localDate(globalForm.data_entrega_prevista),
    })
    setEditableParcelas(generated.map(p => ({
      id: crypto.randomUUID(),
      numero_parcela: p.numero_parcela,
      valor: toBRLInput(p.valor),
      data_vencimento: p.data_vencimento,
      status: p.status,
      descricao: '',
    })))
  }, [valorTotalLote, globalForm.cond_pagamento, globalForm.data_entrega_prevista])

  const parcelaSoma = editableParcelas.reduce((s, p) => s + parseBRL(p.valor), 0)
  const parcelaDiff = Math.abs(parcelaSoma - valorTotalLote)
  const parcelasOk = parcelaDiff <= 0.01

  const redistributeLinear = () => {
    if (valorTotalLote <= 0 || !globalForm.cond_pagamento || !globalForm.data_entrega_prevista) return
    // Distribui APENAS o saldo após adiantamentos sobre as contratuais — adiantamentos ficam intactos.
    const valorAParcelar = Math.max(0, valorTotalLote - totalAdiantado)
    const generated = gerarParcelas({
      pedidoId: 'preview', companyId: 'preview',
      valorTotal: valorAParcelar,
      condPagamento: globalForm.cond_pagamento,
      dataEntrega: localDate(globalForm.data_entrega_prevista),
    })
    const novasContratuais = generated.map(p => ({
      id: crypto.randomUUID(),
      numero_parcela: p.numero_parcela,
      valor: toBRLInput(p.valor),
      data_vencimento: p.data_vencimento,
      status: p.status,
      descricao: '',
      tipo: 'contratual' as const,
    }))
    setEditableParcelas([...adiantamentos, ...novasContratuais])
    setParcelasManuallyEdited(false)
  }

  const addParcela = () => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => [...prev, {
      id: crypto.randomUUID(),
      numero_parcela: prev.length + 1,
      valor: '0,00',
      data_vencimento: globalForm.data_entrega_prevista || new Date().toISOString().slice(0, 10),
      status: 'futura',
      descricao: '',
    }])
  }

  const removeParcela = (id: string) => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => prev.filter(p => p.id !== id).map((p, i) => ({ ...p, numero_parcela: i + 1 })))
  }

  const updateParcela = (id: string, field: 'valor' | 'data_vencimento' | 'descricao', value: string) => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const startEdit = async (p: Pedido) => {
    setEditingPedido(p)
    setCondFromForn(false)
    setGlobalForm({
      fornecedor_id: p.fornecedor_id ?? '',
      cond_pagamento: p.cond_pagamento ?? '',
      data_entrega_prevista: p.data_entrega_prevista ?? '',
      status: p.status,
      observacoes: p.observacoes ?? '',
      is_previsao_orcamento: p.is_previsao_orcamento === true,
    })
    // Pós-migration split_pedidos_header_e_itens: pedido pode ter N linhas em
    // pedido_itens. Se vieram via JOIN do usePedidos (p.itens populado), monta
    // o loteItems com todas as linhas. Senão, cai pro legacy (1 linha via
    // p.item_compra_id) — caso comum em pedidos antigos sem o JOIN.
    const itensDoPedido = (p.itens && p.itens.length > 0) ? p.itens : null
    if (itensDoPedido) {
      setLoteItems(itensDoPedido.map(pi => {
        const it = itens.find(i => i.id === pi.item_compra_id)
        const calcAuto = (pi.casas_lote ?? 0) * (it?.qtd_por_casa ?? 0) * (pi.valor_unitario_real ?? 0)
        const valorSalvo = Number(pi.valor_total_real ?? 0)
        const temOverride = valorSalvo > 0 && Math.abs(calcAuto - valorSalvo) > 0.5
        return {
          id: pi.id,
          item_compra_id: pi.item_compra_id,
          casas_lote: pi.casas_lote != null ? pi.casas_lote.toString() : '',
          valor_unitario_real: pi.valor_unitario_real ? toBRLInput(pi.valor_unitario_real) : '',
          valor_total_real_override: temOverride ? valorSalvo : null,
        }
      }))
      // Filtra pela etapa do PRIMEIRO item (UI legada usa etapaFilter como contexto único)
      const primeiroItem = itens.find(i => i.id === itensDoPedido[0]!.item_compra_id)
      if (primeiroItem) setEtapaFilter(primeiroItem.etapa_id)
    } else {
      const item = itens.find(i => i.id === p.item_compra_id)
      const calcAuto = (p.casas_lote ?? 0) * (item?.qtd_por_casa ?? 0) * (p.valor_unitario_real ?? 0)
      const valorSalvo = Number(p.valor_total_real ?? 0)
      const temOverride = valorSalvo > 0 && Math.abs(calcAuto - valorSalvo) > 0.5
      setLoteItems([{
        id: crypto.randomUUID(),
        item_compra_id: p.item_compra_id,
        casas_lote: p.casas_lote?.toString() ?? '',
        valor_unitario_real: p.valor_unitario_real ? toBRLInput(p.valor_unitario_real) : '',
        valor_total_real_override: temOverride ? valorSalvo : null,
      }])
      if (item) setEtapaFilter(item.etapa_id)
    }

    // Fetch existing parcelas for this pedido
    const { data: existingParcelas } = await supabase.from('parcelas').select('*').eq('pedido_id', p.id).order('numero_parcela', { ascending: true })
    if (existingParcelas && existingParcelas.length > 0) {
      setEditableParcelas(existingParcelas.map((ep: any) => ({
        id: ep.id,
        numero_parcela: ep.numero_parcela,
        valor: toBRLInput(ep.valor),
        data_vencimento: ep.data_vencimento,
        status: ep.status,
        descricao: ep.descricao ?? '',
        tipo: ep.tipo ?? 'contratual',
        valor_pago: Number(ep.valor_pago || 0),
      })))
      setParcelasManuallyEdited(true)
    } else {
      setEditableParcelas([])
    }

    setShowForm(true)
  }

  const duplicatePedido = (p: Pedido) => {
    setEditingPedido(null)
    setCondFromForn(false)
    setParcelasManuallyEdited(false)
    setGlobalForm({
      fornecedor_id: p.fornecedor_id ?? '',
      cond_pagamento: p.cond_pagamento ?? '',
      data_entrega_prevista: '',
      status: 'planejado',
      observacoes: '',
      is_previsao_orcamento: p.is_previsao_orcamento === true,
    })
    setLoteItems([{
      id: crypto.randomUUID(),
      item_compra_id: p.item_compra_id,
      casas_lote: p.casas_lote?.toString() ?? '',
      valor_unitario_real: p.valor_unitario_real ? toBRLInput(p.valor_unitario_real) : '',
    }])
    const item = itens.find(i => i.id === p.item_compra_id)
    if (item) setEtapaFilter(item.etapa_id)
    setShowForm(true)
    toast.info(`Pedido #${p.numero_pedido} duplicado. Revise a data de entrega e salve.`)
  }

  const resetForm = () => {
    setGlobalForm(emptyGlobal)
    setCondFromForn(false)
    setEditableParcelas([])
    setParcelasManuallyEdited(false)
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

        casas_lote: li.casasLote || null,
        qtd_lote: li.qtdLoteCalc || null,
        valor_unitario_real: li.precoUnit || null,
        valor_total_real: li.valorTotalCalc || null,
        fornecedor_id: globalForm.fornecedor_id || null,
        cond_pagamento: globalForm.cond_pagamento || null,
        data_entrega_prevista: globalForm.data_entrega_prevista || null,
        status: globalForm.status,
        observacoes: globalForm.observacoes || null,
        is_previsao_orcamento: globalForm.is_previsao_orcamento === true,
      }
      await updatePedido.mutateAsync({ id: editingPedido.id, ...payload })

      const condChanged = editingPedido.cond_pagamento !== globalForm.cond_pagamento
      const dateChanged = editingPedido.data_entrega_prevista !== globalForm.data_entrega_prevista
      const valorChanged = (editingPedido.valor_total_real ?? 0) !== li.valorTotalCalc

      const parcelasOk = Math.abs(editableParcelas.reduce((s, p) => s + parseBRL(p.valor), 0) - li.valorTotalCalc) <= 0.01

      // Detecta diff real entre editableParcelas e o que esta no banco — cobre o caso
      // do botao "Redistribuir saldo" (zera parcelasManuallyEdited) e qualquer outro
      // fluxo que altere parcelas sem setar a flag.
      const { data: existingParcelasCheck } = await supabase
        .from('parcelas').select('id, numero_parcela, valor, data_vencimento, descricao, tipo')
        .eq('pedido_id', editingPedido.id)
      const editKey = (l: { numero_parcela: number; valor: string | number; data_vencimento: string }) =>
        `${l.numero_parcela}|${(typeof l.valor === 'string' ? parseBRL(l.valor) : Number(l.valor)).toFixed(2)}|${l.data_vencimento}`
      const dbKeys = new Set((existingParcelasCheck || []).map(p => editKey({ numero_parcela: p.numero_parcela, valor: p.valor as any, data_vencimento: p.data_vencimento })))
      const editKeys = new Set(editableParcelas.map(ep => editKey(ep)))
      const parcelasDiffer = dbKeys.size !== editKeys.size ||
        Array.from(editKeys).some(k => !dbKeys.has(k)) ||
        Array.from(dbKeys).some(k => !editKeys.has(k))

      if ((condChanged || dateChanged || valorChanged || parcelasManuallyEdited || parcelasDiffer) && li.valorTotalCalc > 0 && globalForm.cond_pagamento && globalForm.data_entrega_prevista) {
        // Se estiver com erro na soma manual e tentou alterar as parcelas
        if (!parcelasOk) {
          toast.error('A soma das parcelas deve ser igual ao total para salvar a alteração financeira.')
          return
        }

        const { data: existingParcelas } = await supabase
          .from('parcelas')
          .select('id, status, valor_pago')
          .eq('pedido_id', editingPedido.id)

        // Protege parcelas que ja tem baixa real (status pago, valor_pago > 0)
        // ou link polimorfico em conciliacao_parcelas. NAO protege por FK legada
        // mb.parcela_id — esse ponteiro denormalizado eh limpado antes do delete
        // (a fonte da verdade do vinculo eh conciliacao_parcelas).
        const parcelaIds = (existingParcelas || []).map(p => p.id)
        const { data: comLinks } = parcelaIds.length > 0
          ? await supabase.from('conciliacao_parcelas').select('parcela_id').in('parcela_id', parcelaIds)
          : { data: [] as any[] }
        const idsComLink = new Set((comLinks || []).map((l: any) => l.parcela_id))
        const protegidas = (existingParcelas || []).filter(p =>
          p.status === 'paga' || p.status === 'parcialmente_paga' ||
          Number(p.valor_pago || 0) > 0 || idsComLink.has(p.id)
        )
        const deletaveis = (existingParcelas || []).filter(p => !protegidas.find(pr => pr.id === p.id))

        if (protegidas.length === (existingParcelas || []).length && (existingParcelas || []).length > 0) {
          toast.error('Todas as parcelas já têm baixa ou conciliação. Não é possível alterar parcelas.')
        } else {
          const shouldUpdate = deletaveis.length === 0 || confirm(`${deletaveis.length} parcela(s) futura(s) serão substituídas. ${protegidas.length} parcela(s) com baixa/conciliação serão preservadas. Continuar?`)
          if (shouldUpdate) {
            if (deletaveis.length > 0) {
              const delIds = deletaveis.map(p => p.id)
              // 1) Limpa ponteiro legado mb.parcela_id se houver — evita FK violation.
              // O vinculo real (se houver) esta em conciliacao_parcelas e ja foi
              // capturado em idsComLink; quem chegou aqui nao tem link ativo.
              await supabase.from('movimentacoes_bancarias').update({ parcela_id: null }).in('parcela_id', delIds)
              const { error: delErr } = await supabase.from('parcelas').delete().in('id', delIds)
              if (delErr) {
                toast.error('Erro ao remover parcelas antigas: ' + delErr.message)
                return
              }
            }
            const parcelasParaInserir = editableParcelas
              .filter(ep => ep.status !== 'paga' && !protegidas.find(pr => pr.id === ep.id))
              .map((ep) => ({
                company_id: currentCompany.id,
                pedido_id: editingPedido.id,
                numero_parcela: ep.numero_parcela,
                valor: parseBRL(ep.valor),
                data_vencimento: ep.data_vencimento,
                status: 'futura',
                descricao: ep.descricao || null,
              }))

            if (parcelasParaInserir.length > 0) {
              const { error: insErr } = await supabase.from('parcelas').insert(parcelasParaInserir)
              if (insErr) {
                toast.error('Erro ao inserir parcelas: ' + insErr.message)
                return
              }
              toast.success(`Parcelas atualizadas (${parcelasParaInserir.length})`)
            }
            qc.invalidateQueries({ queryKey: ['parcelas'] })
          }
        }
      }
    } else {
      // Lote insert
      const validItems = calculatedItems.filter(li => li.item_compra_id && li.valorTotalCalc > 0)
      if (validItems.length === 0) {
        toast.error('Nenhum item válido com valor maior que zero inserido.')
        return
      }

      // 1. Inserir todos os itens de pedido
      let finalCond = globalForm.cond_pagamento || null
      if (!finalCond && globalForm.fornecedor_id) {
        const forn = fornecedores.find(f => f.id === globalForm.fornecedor_id)
        finalCond = forn?.cond_pagamento_padrao || 'à vista'
      } else if (!finalCond) {
        finalCond = 'à vista'
      }

      const payloads = validItems.map(li => {
        let finalDate = globalForm.data_entrega_prevista || null
        if (!finalDate) {
          const itemObj = itens.find(i => i.id === li.item_compra_id)
          const etapaObj = etapas.find(e => e.id === itemObj?.etapa_id)
          if (etapaObj?.data_inicio_plan) {
            finalDate = etapaObj.data_inicio_plan
          } else {
            const d30 = new Date()
            d30.setDate(d30.getDate() + 30)
            finalDate = d30.toISOString().split('T')[0]!
          }
        }
        
        return {
          item_compra_id: li.item_compra_id,
          casas_lote: li.casasLote || null,
          qtd_lote: li.qtdLoteCalc || null,
          valor_unitario_real: li.precoUnit || null,
          valor_total_real: li.valorTotalCalc || null,
          fornecedor_id: globalForm.fornecedor_id || null,
          cond_pagamento: finalCond,
          data_entrega_prevista: finalDate,
          status: globalForm.status,
          is_previsao_orcamento: globalForm.is_previsao_orcamento === true,
        }
      })

      const createdPedidos = await createPedidoLote.mutateAsync(payloads)

      // 2. Insert parcelas from editable state (distributed proportionally across pedidos)
      if (editableParcelas.length > 0 && createdPedidos && createdPedidos.length > 0) {
        const allParcelas: Array<{ company_id: string; pedido_id: string; numero_parcela: number; valor: number; data_vencimento: string; status: string; descricao: string | null }> = []

        if (createdPedidos.length === 1) {
          // Single pedido: use edited parcelas directly
          for (const ep of editableParcelas) {
            allParcelas.push({
              company_id: currentCompany.id,
              pedido_id: createdPedidos[0]!.id,
              numero_parcela: ep.numero_parcela,
              valor: parseBRL(ep.valor),
              data_vencimento: ep.data_vencimento,
              status: 'futura',
              descricao: ep.descricao || null,
            })
          }
        } else {
          // Multi-pedido: distribute proportionally per pedido
          for (const p of createdPedidos) {
            const ratio = valorTotalLote > 0 ? (p.valor_total_real || 0) / valorTotalLote : 0
            editableParcelas.forEach((ep, i) => {
              allParcelas.push({
                company_id: currentCompany.id,
                pedido_id: p.id,
                numero_parcela: i + 1,
                valor: Math.round(parseBRL(ep.valor) * ratio * 100) / 100,
                data_vencimento: ep.data_vencimento,
                status: 'futura',
                descricao: ep.descricao || null,
              })
            })
          }
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
    parcialmente_pago: 'bg-amber-500/10 text-amber-600',
    pago: 'bg-green-500/10 text-green-600',
    cancelado: 'bg-red-500/10 text-red-500',
  }
  const statusLabel = (s: string | null | undefined): string => {
    switch (s) {
      case 'planejado':         return 'Plan.'
      case 'pedido_enviado':    return 'Enviado'
      case 'entregue':          return 'Entregue'
      case 'parcialmente_pago': return 'Parc. pago'
      case 'pago':              return 'Pago'
      case 'cancelado':         return 'Cancelado'
      default:                  return s ?? '—'
    }
  }

  const filtered = pedidos.filter((p) => {
    const s = search.toLowerCase()
    if (s) {
      const matchTxt =
        (p.item_descricao ?? '').toLowerCase().includes(s) ||
        (p.item_codigo ?? '').toLowerCase().includes(s) ||
        (p.fornecedor_nome ?? '').toLowerCase().includes(s) ||
        (p.numero_pedido?.toString() ?? '').includes(s) ||
        (p.itens ?? []).some(pi =>
          (pi.item_descricao ?? '').toLowerCase().includes(s) ||
          (pi.item_codigo ?? '').toLowerCase().includes(s)
        )
      if (!matchTxt) return false
    }
    if (filtroStatus && p.status !== filtroStatus) return false
    if (filtroFornecedor && p.fornecedor_id !== filtroFornecedor) return false
    if (filtroOrigem === 'nf' && !p.nf_origem_id) return false
    if (filtroOrigem === 'manual' && p.nf_origem_id) return false
    if (filtroOrigem === 'livre') {
      if (p.nf_origem_id) return false
      if (pedidosComPagamento.has(p.id)) return false
      if ((p.itens ?? []).some(pi => Number(pi.qtd_recebida) > 0)) return false
    }
    if (filtroSemParcela && pedidosComParcela.has(p.id)) return false
    return true
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
      // Agrega quantidade e recebido somando todos os pedido_itens dos pedidos do grupo
      const allItens = items.flatMap(p => p.itens ?? [])
      const totalQtd = allItens.reduce((s, pi) => s + Number(pi.qtd ?? 0), 0)
      const totalRecebida = allItens.reduce((s, pi) => s + Number(pi.qtd_recebida ?? 0), 0)
      const pctRecebido = totalQtd > 0 ? (totalRecebida / totalQtd) * 100 : 0
      const totalItensDistintos = allItens.length || items.length
      const temNF = items.some(p => !!p.nf_origem_id)
      const groupPedidoIds = new Set(items.map(p => p.id))
      const parcsDoGrupo = (parcelasAll as any[]).filter(par => par.pedido_id && groupPedidoIds.has(par.pedido_id))
      const temConciliacao = parcsDoGrupo.some(par => (par.conciliacao_parcelas?.length ?? 0) > 0)
      const temRecepcaoNF = allItens.some(pi => Number(pi.qtd_recebida ?? 0) > 0)
      return {
         name,
         items,
         numero: items[0]?.numero_pedido ?? 0,
         created_at: items[0]?.created_at ?? '',
         fornecedor: items[0]?.fornecedor_nome,
         cond_pagamento: items[0]?.cond_pagamento,
         data_entrega: items[0]?.data_entrega_prevista,
         status: items[0]?.status ?? 'planejado',
         total: items.reduce((sum, i) => sum + (i.valor_total_real ?? 0), 0),
         totalQtd,
         totalRecebida,
         pctRecebido,
         totalItensDistintos,
         temNF,
         temConciliacao,
         temRecepcaoNF,
      }
    }).sort((a, b) => {
      if (a.numero !== b.numero) return b.numero - a.numero
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filtered])

  const totals = useMemo(() => {
    const valor = filtered.reduce((acc, p) => acc + (p.valor_total_real ?? 0), 0)
    // Fix #03: casas cobertas = max(casas_lote) por item, limitado ao total do projeto
    const qtdCasasProjeto = currentCompany?.qtd_casas ?? 64
    const casasPorItem = new Map<string, number>()
    filtered.forEach(p => {
      const cur = casasPorItem.get(p.item_compra_id) ?? 0
      casasPorItem.set(p.item_compra_id, Math.min(cur + (p.casas_lote ?? 0), qtdCasasProjeto))
    })
    // Média ponderada de cobertura: quantos itens únicos e até quantas casas cada
    const maxCasas = casasPorItem.size > 0
      ? Math.max(...Array.from(casasPorItem.values()))
      : 0
    return { valor, casas: Math.min(maxCasas, qtdCasasProjeto) }
  }, [filtered, currentCompany])

  // #18: Cascade grouping: Etapa → Item → Pedidos
  const cascadeGrouped = useMemo(() => {
    const etapaMap = new Map<string, {
      etapa: { id: string; codigo?: string; nome: string };
      itemMap: Map<string, { item: ItemCompra; pedidos: Pedido[] }>;
    }>()

    filtered.forEach(p => {
      const item = itens.find(i => i.id === p.item_compra_id)
      if (!item) return
      const etapa = etapas.find(e => e.id === item.etapa_id)
      if (!etapa) return

      if (!etapaMap.has(etapa.id)) etapaMap.set(etapa.id, { etapa: { id: etapa.id, codigo: etapa.codigo, nome: etapa.nome }, itemMap: new Map() })
      const eg = etapaMap.get(etapa.id)!
      if (!eg.itemMap.has(item.id)) eg.itemMap.set(item.id, { item, pedidos: [] })
      eg.itemMap.get(item.id)!.pedidos.push(p)
    })

    // Helper: agrega qtd, qtd_recebida e valor a partir de pedido.itens[] (ou fallback legacy)
    const agregaPedido = (p: Pedido) => {
      if (p.itens && p.itens.length > 0) {
        return p.itens.reduce(
          (acc, pi) => ({
            qtd: acc.qtd + Number(pi.qtd ?? 0),
            recebida: acc.recebida + Number(pi.qtd_recebida ?? 0),
            valor: acc.valor + Number(pi.valor_total_real ?? 0),
          }),
          { qtd: 0, recebida: 0, valor: 0 }
        )
      }
      return {
        qtd: Number(p.qtd_lote ?? 0),
        recebida: p.status === 'entregue' || p.status === 'pago' || p.status === 'parcialmente_pago' ? Number(p.qtd_lote ?? 0) : 0,
        valor: Number(p.valor_total_real ?? 0),
      }
    }

    return Array.from(etapaMap.values())
      .map(eg => {
        const items = Array.from(eg.itemMap.values())
          .map(ig => {
            const agg = ig.pedidos.reduce(
              (acc, p) => {
                const a = agregaPedido(p)
                return { qtd: acc.qtd + a.qtd, recebida: acc.recebida + a.recebida, valor: acc.valor + a.valor }
              },
              { qtd: 0, recebida: 0, valor: 0 }
            )
            return {
              ...ig,
              totalQtd: agg.qtd,
              totalRecebida: agg.recebida,
              totalValor: agg.valor,
              pctRecebido: agg.qtd > 0 ? (agg.recebida / agg.qtd) * 100 : 0,
            }
          })
          .sort((a, b) => (a.item.codigo ?? '').localeCompare(b.item.codigo ?? ''))
        const totQtd = items.reduce((s, ig) => s + ig.totalQtd, 0)
        const totRec = items.reduce((s, ig) => s + ig.totalRecebida, 0)
        const totVal = items.reduce((s, ig) => s + ig.totalValor, 0)
        return {
          ...eg.etapa,
          items,
          total: totVal,
          totalQtd: totQtd,
          totalRecebida: totRec,
          pctRecebido: totQtd > 0 ? (totRec / totQtd) * 100 : 0,
        }
      })
      .sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? ''))
  }, [filtered, itens, etapas])

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
        <MiniCard label="Itens sem pedido" value={String((() => {
          // Respeita o filtro de busca: quando ha busca, conta apenas itens cujo
          // descricao/codigo/fornecedor/etapa case com a busca; sem busca, conta todos.
          const s = search.toLowerCase()
          const itensFiltrados = !s ? itens : itens.filter(i =>
            ((i as any).descricao ?? '').toLowerCase().includes(s) ||
            ((i as any).codigo ?? '').toLowerCase().includes(s) ||
            ((i as any).fornecedor_nome ?? '').toLowerCase().includes(s) ||
            ((i as any).etapa_nome ?? '').toLowerCase().includes(s)
          )
          return itensFiltrados.filter((i) => !pedidos.some((p) => p.item_compra_id === i.id)).length
        })())} accent="amber" />
      </div>

      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
          <button
            onClick={() => setPedidoViewMode('pedido')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${pedidoViewMode === 'pedido' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Truck className="h-3 w-3" /> Por Pedido
          </button>
          <button
            onClick={() => setPedidoViewMode('etapa')}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${pedidoViewMode === 'etapa' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Package className="h-3 w-3" /> Por Etapa (Cascata)
          </button>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Pedido
        </button>
      </div>

      {/* Filtros — só pra view Por Pedido (cascata tem seus próprios) */}
      {pedidoViewMode === 'pedido' && (
        <div className="mb-3 flex items-center gap-2 flex-wrap text-xs">
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="rounded border bg-background px-2 py-1">
            <option value="">Status: todos</option>
            <option value="planejado">Planejado</option>
            <option value="pedido_enviado">Enviado</option>
            <option value="parcialmente_entregue">Parc. entregue</option>
            <option value="entregue">Entregue</option>
            <option value="parcialmente_pago">Parc. pago</option>
            <option value="pago">Pago</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} className="rounded border bg-background px-2 py-1 max-w-[200px]">
            <option value="">Fornecedor: todos</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value as any)} className="rounded border bg-background px-2 py-1">
            <option value="todos">Origem: todos</option>
            <option value="nf">Via NF</option>
            <option value="manual">Manual</option>
            <option value="livre">Sem vínculo</option>
          </select>
          <button
            onClick={() => setFiltroSemParcela(v => !v)}
            className={`rounded border px-2 py-1 text-[11px] transition-colors ${filtroSemParcela ? 'bg-amber-500 text-white border-amber-500 font-semibold' : 'hover:bg-muted text-muted-foreground'}`}
            title="Mostrar apenas pedidos sem parcela gerada"
          >
            ⚠ Sem parcela
          </button>
          {filtroSemParcela && filtered.some(p => !pedidosComParcela.has(p.id)) && (
            bulkConfirm ? (
              <span className="flex items-center gap-1.5 rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 text-[11px]">
                <span className="text-amber-800 dark:text-amber-300">Gerar para {filtered.filter(p => !pedidosComParcela.has(p.id)).length} pedido(s)?</span>
                <button onClick={gerarParcelasBulk} disabled={bulkGerandoParcelas} className="font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                  {bulkGerandoParcelas ? 'Gerando…' : 'Confirmar'}
                </button>
                <button onClick={() => setBulkConfirm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </span>
            ) : (
              <button
                onClick={() => setBulkConfirm(true)}
                disabled={bulkGerandoParcelas}
                className="flex items-center gap-1 rounded border border-amber-400 bg-amber-500 text-white px-2 py-1 text-[11px] font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {bulkGerandoParcelas
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Gerando…</>
                  : <><CalendarDays className="h-3 w-3" /> Gerar parcelas ({filtered.filter(p => !pedidosComParcela.has(p.id)).length})</>}
              </button>
            )
          )}
          {(filtroStatus || filtroFornecedor || filtroOrigem !== 'todos' || filtroSemParcela) && (
            <button onClick={() => { setFiltroStatus(''); setFiltroFornecedor(''); setFiltroOrigem('todos'); setFiltroSemParcela(false) }} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">Limpar filtros</button>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} pedido(s)</span>
          <button onClick={expandirTodosPedidos} className="rounded border px-2 py-1 text-[11px] hover:bg-muted" title="Expandir todos os pedidos visíveis"><ChevronDown className="inline h-3 w-3" /> Expandir todos</button>
          <button onClick={colapsarTodosPedidos} className="rounded border px-2 py-1 text-[11px] hover:bg-muted" title="Colapsar todos os pedidos"><ChevronRight className="inline h-3 w-3" /> Colapsar todos</button>
        </div>
      )}

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
                  <label className={LABEL}>Nº Pedido</label>
                  <input type="text" disabled value={editingPedido ? `#${editingPedido.numero_pedido}` : 'Automático'} className={`${INPUT} bg-muted text-muted-foreground cursor-not-allowed`} />
                </div>
                <div>
                  <label className={LABEL}>Fornecedor</label>
                  <select value={globalForm.fornecedor_id} onChange={(e) => handleFornecedorChange(e.target.value)} className={INPUT}>
                    <option value="">Selecione</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Data Entrega Prevista</label>
                  <input type="date" value={globalForm.data_entrega_prevista} onChange={(e) => setGlobalForm((p) => ({ ...p, data_entrega_prevista: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Cond. Pagamento {condFromForn && globalForm.cond_pagamento && <span className="text-[10px] text-muted-foreground font-normal">(padrão do fornecedor)</span>}</label>
                  <input type="text" value={globalForm.cond_pagamento} onChange={(e) => { setGlobalForm((p) => ({ ...p, cond_pagamento: e.target.value })); setCondFromForn(false) }} placeholder="30/60" className={INPUT} />
                </div>
              </div>
              {/* Status + Observações (edit only) */}
              {editingPedido && (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={LABEL}>Status</label>
                    <select value={globalForm.status} onChange={(e) => setGlobalForm(p => ({ ...p, status: e.target.value as Pedido['status'] }))} className={INPUT}>
                      <option value="planejado">Planejado</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="entregue">Entregue</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Observações</label>
                    <textarea value={globalForm.observacoes} onChange={(e) => setGlobalForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Notas sobre este pedido..." className={`${INPUT} min-h-[60px] resize-y`} />
                  </div>
                </div>
              )}
              {/* Toggle: pedido só de previsão financeira (qtd fictícia, NFs consomem por VALOR).
                  Use quando o pedido é placeholder pra fluxo de caixa (contrato/lote completo
                  registrado como qtd=1 + valor alto) e NFs reais do mesmo item devem abater o
                  saldo financeiro sem mexer na "quantidade entregue". */}
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={globalForm.is_previsao_orcamento === true}
                    onChange={(e) => setGlobalForm(p => ({ ...p, is_previsao_orcamento: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                  />
                  <div className="text-[11px]">
                    <div className="font-semibold text-amber-800">Pedido só de previsão financeira</div>
                    <div className="text-muted-foreground mt-0.5">
                      Marque quando este pedido é apenas <strong>placeholder de fluxo de caixa</strong> (contrato/lote
                      registrado como qtd=1 + valor alto). NFs reais do mesmo item vão abater do <strong>saldo financeiro</strong> em
                      vez de consumir a quantidade fictícia. Não toca em parcelas já pagas/conciliadas.
                    </div>
                  </div>
                </label>
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
                           <input type="number" step="any" value={li.casas_lote} onChange={(e) => updateLoteItem(li.item_compra_id, 'casas_lote', e.target.value)} className={INPUT} />
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

            {/* Editable Parcelas */}
            {editableParcelas.length > 0 && (
              <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                {/* Resumo: total / adiantado / a parcelar */}
                {adiantamentos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 rounded-md bg-background/60 p-2 text-[11px]">
                    <div>
                      <p className="text-[9px] uppercase text-muted-foreground font-bold">Total Pedido</p>
                      <p className="font-bold tabular-nums">{formatCurrency(valorTotalLote)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-blue-600 font-bold">Adiantado</p>
                      <p className="font-bold text-blue-600 tabular-nums">{formatCurrency(totalAdiantado)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-amber-600 font-bold">Saldo a Parcelar</p>
                      <p className="font-bold text-amber-600 tabular-nums">{formatCurrency(saldoAParcelarContratual)}</p>
                    </div>
                  </div>
                )}

                {/* Adiantamentos (read-only) */}
                {adiantamentos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                      Adiantamentos pagos ({adiantamentos.length}) — fora do cronograma
                    </p>
                    <div className="space-y-1">
                      {adiantamentos.map(p => (
                        <div key={p.id} className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-xs">
                          <span className="rounded bg-blue-500/20 px-1.5 text-[9px] font-bold text-blue-700">ADI</span>
                          <span className="w-24 font-mono text-right tabular-nums">{formatCurrency(parseBRL(p.valor))}</span>
                          <span className="text-muted-foreground">{p.data_vencimento}</span>
                          <span className="flex-1 truncate text-muted-foreground">{p.descricao || '—'}</span>
                          <span className="text-emerald-600 font-bold">PAGO</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contratuais (editáveis) */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Parcelas contratuais ({contratuaisEditaveis.length}x)
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={redistributeLinear} className="rounded border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                        title={adiantamentos.length > 0 ? `Redistribui ${formatCurrency(saldoAParcelarContratual)} sobre cond. de pagamento` : 'Redistribuir linearmente'}>
                        {adiantamentos.length > 0 ? 'Redistribuir saldo' : 'Redistribuir'}
                      </button>
                      <button type="button" onClick={addParcela} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10">
                        <Plus className="h-3 w-3" /> Parcela
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {contratuaisEditaveis.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 shadow-sm text-xs">
                        <span className="font-bold text-primary w-8 shrink-0">P{p.numero_parcela}</span>
                        <input
                          type="text"
                          value={p.valor}
                          onChange={e => updateParcela(p.id, 'valor', e.target.value)}
                          className="w-28 rounded border bg-background px-2 py-1 text-right font-mono text-xs focus:border-primary focus:outline-none"
                          placeholder="Valor"
                        />
                        <input
                          type="date"
                          value={p.data_vencimento}
                          onChange={e => updateParcela(p.id, 'data_vencimento', e.target.value)}
                          className="rounded border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                        <input
                          type="text"
                          value={p.descricao}
                          onChange={e => updateParcela(p.id, 'descricao', e.target.value)}
                          placeholder="Descrição (opcional)"
                          className="flex-1 min-w-[120px] rounded border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                        {p.status !== 'paga' && (p.valor_pago ?? 0) <= 0.005 && (
                          <button type="button" onClick={() => removeParcela(p.id)} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Soma vs Total */}
                <div className={`flex items-center gap-3 text-xs font-medium ${parcelasOk ? 'text-emerald-600' : 'text-red-500'}`}>
                  <span>Soma das parcelas: {formatCurrency(parcelaSoma)}</span>
                  <span>Total pedido: {formatCurrency(valorTotalLote)}</span>
                  {!parcelasOk && <span className="font-bold">Diferença: {formatCurrency(parcelaDiff)}</span>}
                  {parcelasOk && <Check className="h-3.5 w-3.5" />}
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
              <button type="submit" disabled={createPedidoLote.isPending || updatePedido.isPending || calculatedItems.length === 0 || (editableParcelas.length > 0 && !parcelasOk)} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50">
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

      {/* ── Dialog: gerar parcelas ───────────────────────────────────────────── */}
      {gerarDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-2xl border bg-card shadow-2xl p-5 space-y-4 mx-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold">Gerar parcelas</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pedido #{gerarDialog.pedido.numero_pedido} · {(gerarDialog.pedido as any).fornecedor_nome ?? ''}
                </p>
              </div>
              <button onClick={() => setGerarDialog(null)} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            {gerarDialog.nfDate && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                Data base obtida da NF de origem ({gerarDialog.nfDate})
              </div>
            )}
            {!gerarDialog.nfDate && !gerarDialog.pedido.data_entrega_real && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Sem data de entrada — usando hoje como base. Ajuste se necessário.
              </div>
            )}

            <div>
              <label className={LABEL}>Data de entrada (base dos vencimentos)</label>
              <input
                type="date"
                value={gerarDialog.dataBase}
                onChange={e => onGerarDataChange(e.target.value)}
                className={INPUT}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {gerarDialog.parcelas.length} parcela(s) · cond. {gerarDialog.pedido.cond_pagamento || '0 dias'}
              </div>
              {gerarDialog.parcelas.map(pa => (
                <div key={pa.numero_parcela} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">Parc. {pa.numero_parcela}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(pa.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(pa.valor)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setGerarDialog(null)} className="flex-1 rounded-lg border px-3 py-2 text-xs hover:bg-muted">Cancelar</button>
              <button
                onClick={confirmarGerar}
                disabled={gerarDialog.loading || !gerarDialog.dataBase || gerarDialog.parcelas.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {gerarDialog.loading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Criando…</>
                  : <><CheckCircle2 className="h-3.5 w-3.5" /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhum pedido encontrado" /> : pedidoViewMode === 'pedido' ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="tbl-bf w-full text-sm">
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
              {grouped.map(group => {
                const isExpanded = expandedPedidos.has(group.name)
                return (
                <React.Fragment key={group.name}>
                  {/* Header Row */}
                  <tr className={`bg-muted/30 font-semibold border-t ${isExpanded ? '' : 'hover:bg-muted/40 cursor-pointer'}`}
                      onClick={() => !isExpanded && togglePedido(group.name)}>
                    <td className="px-3 py-2 text-center border-b">
                      <button
                        onClick={e => { e.stopPropagation(); togglePedido(group.name) }}
                        className="rounded p-0.5 hover:bg-accent text-muted-foreground"
                        title={isExpanded ? 'Colapsar itens' : 'Expandir itens'}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 border-b" colSpan={2}>
                      <div className="flex items-center gap-2 flex-wrap">
                         <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                           {group.name}
                         </span>
                         <span className="text-[10px] text-muted-foreground">{group.fornecedor ?? '—'}</span>
                         {/* Chip resumo dos itens — visível principalmente quando colapsado */}
                         <span className="text-[9px] rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                           {group.totalItensDistintos} {group.totalItensDistintos === 1 ? 'item' : 'itens'}
                         </span>
                         {group.totalQtd > 0 && (
                           <span className={`text-[9px] rounded px-1.5 py-0.5 font-mono ${
                             group.pctRecebido >= 99.9 ? 'bg-emerald-500/15 text-emerald-700' :
                             group.pctRecebido > 0 ? 'bg-amber-500/15 text-amber-700' :
                             'bg-muted text-muted-foreground'
                           }`} title={`${formatNumber(group.totalRecebida, 2, 2)} de ${formatNumber(group.totalQtd, 2, 2)} un recebido`}>
                             {Math.round(group.pctRecebido)}% receb.
                           </span>
                         )}
                         {group.temNF && (
                           <span className="text-[9px] rounded bg-blue-500/15 text-blue-700 px-1.5 py-0.5" title="Pedido criado/consumido via NF">via NF</span>
                         )}
                         {group.temRecepcaoNF && !group.temNF && (
                           <span className="text-[9px] rounded bg-blue-500/10 text-blue-600 px-1.5 py-0.5" title="Itens recebidos via NF aplicada">NF recebida</span>
                         )}
                         {group.temConciliacao && (
                           <span className="text-[9px] rounded bg-violet-500/15 text-violet-700 px-1.5 py-0.5" title="Possui parcelas conciliadas com movimentação bancária">conciliado</span>
                         )}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b" colSpan={3}>
                       <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>Cond: <span className="font-mono text-foreground">{group.cond_pagamento ?? '—'}</span></span>
                          <span className="opacity-50">|</span>
                          <span>Entr: <span className="text-foreground">{group.data_entrega ? localDate(group.data_entrega).toLocaleDateString('pt-BR') : '—'}</span></span>
                          <span className="opacity-50">|</span>
                          <span className={`rounded-full px-2 py-0.5 font-bold ${statusColors[group.status] ?? ''}`}>{statusLabel(group.status)}</span>
                       </div>
                    </td>
                    <td className="px-3 py-2 text-right border-b text-primary tracking-tight font-bold">
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                          const groupPedidoIds = group.items.map(p => p.id)
                          const parcs = (parcelasAll as any[]).filter(par => par.pedido_id && groupPedidoIds.includes(par.pedido_id))
                          if (parcs.length === 0) return null
                          const isOpen = expandedParcelas.has(group.name)
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleParcelas(group.name) }}
                              className={`text-[9px] rounded border px-1.5 py-0.5 font-mono shrink-0 ${isOpen ? 'bg-primary/15 text-primary border-primary/40' : 'text-muted-foreground hover:bg-muted'}`}
                              title="Ver parcelas formadas"
                            >
                              {isOpen ? '▾' : '▸'} {parcs.length} parc.
                            </button>
                          )
                        })()}
                        <span>{formatCurrency(group.total)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b" colSpan={1}></td>
                  </tr>

                  {/* Linha expansivel das parcelas formadas */}
                  {expandedParcelas.has(group.name) && (() => {
                    const groupPedidoIds = group.items.map(p => p.id)
                    const parcs = (parcelasAll as any[])
                      .filter(par => par.pedido_id && groupPedidoIds.includes(par.pedido_id))
                      .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0))
                    if (parcs.length === 0) return null
                    const todayStr = new Date().toISOString().split('T')[0]!
                    return (
                      <tr className="bg-blue-500/5 border-b">
                        <td colSpan={8} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="font-bold text-blue-700 mr-1">Parcelas:</span>
                            {parcs.map((par: any) => {
                              const isPaga = par.status === 'paga' || (Number(par.valor_pago || 0) >= Number(par.valor) - 0.005 && Number(par.valor) > 0)
                              const isParcial = !isPaga && Number(par.valor_pago || 0) > 0
                              const isVencida = !isPaga && par.data_vencimento < todayStr
                              const cor = isPaga ? 'bg-emerald-500/15 text-emerald-700' :
                                          isParcial ? 'bg-blue-500/15 text-blue-700' :
                                          isVencida ? 'bg-red-500/15 text-red-700' :
                                          'bg-amber-500/10 text-amber-700'
                              const tipo = par.tipo === 'adiantamento' ? 'ADI' : 'P'
                              return (
                                <span key={par.id} className={`rounded px-1.5 py-0.5 font-mono ${cor}`}
                                  title={`${tipo}${par.numero_parcela} · Venc ${par.data_vencimento} · ${formatCurrency(par.valor)}${par.valor_pago > 0 ? ` (pago ${formatCurrency(par.valor_pago)})` : ''} · ${par.status}`}>
                                  {tipo}{par.numero_parcela} {formatCurrency(par.valor)} · {localDate(par.data_vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )
                  })()}

                  {/* Children Rows — pós-migration split: 1 row por pedido_item.
                      Pedidos com .itens[] populado (do JOIN) desdobram em N linhas.
                      Pedidos legacy ainda sem pedido_itens carregados caem no
                      array vazio e renderizam 1 linha com dados do header.
                      Ações (editar/duplicar/excluir) ficam na PRIMEIRA linha de
                      cada pedido — são escopo de pedido, não de item.
                      Só renderiza quando expandido (PR 3.4a). */}
                  {isExpanded && group.items.flatMap(p => {
                    const itensDoPedido = (p.itens && p.itens.length > 0)
                      ? p.itens
                      : [{
                          id: p.id,
                          item_compra_id: p.item_compra_id,
                          item_descricao: p.item_descricao,
                          item_codigo: p.item_codigo,
                          casas_lote: p.casas_lote,
                          qtd: p.qtd_lote ?? 0,
                          valor_total_real: p.valor_total_real ?? 0,
                          qtd_recebida: 0,
                          ordem: 1,
                        }]
                    return itensDoPedido.map((pi: any, idx: number) => {
                      const isPrimeira = idx === 0
                      const totalItens = itensDoPedido.length
                      const recebidoOk = pi.qtd_recebida != null && pi.qtd > 0 && Math.abs(pi.qtd_recebida - pi.qtd) <= 0.001
                      const recebidoParcial = pi.qtd_recebida != null && pi.qtd_recebida > 0 && pi.qtd_recebida < pi.qtd
                      return (
                        <tr key={`${p.id}-${pi.id ?? idx}`} className="group/row hover:bg-muted/10 text-muted-foreground border-b border-border/40 last:border-0">
                          <td className="px-3 py-2 text-center">
                            {isPrimeira && (
                              <input type="checkbox" checked={selection.isSelected(p.id)}
                                onChange={() => selection.toggle(p.id)}
                                className="h-3 w-3 rounded accent-primary" />
                            )}
                          </td>
                          <td className="px-3 py-2 pl-6" colSpan={2}>
                            <div className="flex items-center gap-1.5">
                              {totalItens > 1 && (
                                <span className="font-mono text-[9px] text-muted-foreground bg-muted/40 rounded px-1">{idx + 1}/{totalItens}</span>
                              )}
                              <div className="text-xs font-medium text-foreground truncate">{pi.item_descricao ?? '—'}</div>
                              {recebidoOk && (
                                <span className="text-[9px] rounded bg-emerald-500/15 text-emerald-700 px-1" title="Item totalmente recebido (qtd_recebida = qtd)">✓ recebido</span>
                              )}
                              {recebidoParcial && (
                                <span className="text-[9px] rounded bg-amber-500/15 text-amber-700 px-1" title={`Recebido ${pi.qtd_recebida}/${pi.qtd}`}>{Math.round((pi.qtd_recebida / pi.qtd) * 100)}% recebido</span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] opacity-70">{pi.item_codigo ?? ''}</div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs" colSpan={2}>{pi.casas_lote ? `${formatNumber(Number(pi.casas_lote), 2, 2)} unid.` : ''}</td>
                          <td className="px-3 py-2 text-right text-xs font-mono">{pi.qtd ? `${formatNumber(Number(pi.qtd), 2, 2)} unid.` : ''}</td>
                          <td className="px-3 py-2 text-right text-xs font-medium">{pi.valor_total_real != null ? formatCurrency(pi.valor_total_real) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {isPrimeira && (
                              <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                                {!pedidosComParcela.has(p.id) && (
                                  <button
                                    onClick={() => iniciarGerar(p)}
                                    disabled={fetchingParcelaId === p.id}
                                    className="rounded-md p-1 hover:bg-amber-500/10 text-amber-600"
                                    title="Gerar parcelas para este pedido"
                                  >
                                    {fetchingParcelaId === p.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <CalendarDays className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                <button onClick={() => startEdit(p)} className="rounded-md p-1 hover:bg-accent text-foreground" title="Editar">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => duplicatePedido(p)} className="rounded-md p-1 hover:bg-accent text-foreground" title="Duplicar">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setConfirmDelete(p.id)} className="rounded-md p-1 hover:bg-destructive/10 text-destructive" title="Excluir">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })}
                </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* #18: Cascade View — Etapa → Item → Pedidos.
              Headers de etapa e item agora carregam qtd / recebida / % e cor de status. */
        <div className="space-y-2">
          {cascadeGrouped.map(etapaG => {
            const etapaKey = `et-${etapaG.id}`
            const etapaCor = etapaG.pctRecebido >= 99.9 ? 'bg-emerald-500/15 text-emerald-700'
              : etapaG.pctRecebido > 0 ? 'bg-amber-500/15 text-amber-700'
              : 'bg-muted text-muted-foreground'
            return (
              <div key={etapaG.id} className="rounded-xl border bg-card">
                <button
                  onClick={() => toggleCascade(etapaKey)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors"
                >
                  {expandedCascade[etapaKey] ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{etapaG.codigo}</span>
                  <span className="text-sm font-semibold truncate flex-1">{etapaG.nome}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{etapaG.items.length} {etapaG.items.length === 1 ? 'item' : 'itens'}</span>
                  {etapaG.totalQtd > 0 && (
                    <span className={`text-[10px] rounded px-1.5 py-0.5 font-mono shrink-0 ${etapaCor}`}
                      title={`${formatNumber(etapaG.totalRecebida, 2, 2)} de ${formatNumber(etapaG.totalQtd, 2, 2)} un recebido`}>
                      {Math.round(etapaG.pctRecebido)}% receb.
                    </span>
                  )}
                  <span className="text-sm font-bold text-primary shrink-0 w-24 text-right">{formatCurrency(etapaG.total)}</span>
                </button>

                {expandedCascade[etapaKey] && (
                  <div className="border-t divide-y divide-border/40">
                    {etapaG.items.map(ig => {
                      const { item, pedidos: itemPedidos } = ig
                      const itemKey = `it-${item.id}`
                      const itemCor = ig.pctRecebido >= 99.9 ? 'bg-emerald-500/15 text-emerald-700'
                        : ig.pctRecebido > 0 ? 'bg-amber-500/15 text-amber-700'
                        : 'bg-muted text-muted-foreground'
                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => toggleCascade(itemKey)}
                            className="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-muted/10 transition-colors"
                          >
                            {expandedCascade[itemKey] ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{item.codigo}</span>
                            <span className="text-xs font-medium truncate flex-1">{item.descricao}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{itemPedidos.length} ped.</span>
                            {ig.totalQtd > 0 && (
                              <span className={`text-[9px] rounded px-1.5 py-0.5 font-mono shrink-0 ${itemCor}`}
                                title={`${formatNumber(ig.totalRecebida, 2, 2)} / ${formatNumber(ig.totalQtd, 2, 2)} un`}>
                                {Math.round(ig.pctRecebido)}%
                              </span>
                            )}
                            <span className="text-xs font-semibold text-amber-600 shrink-0 w-24 text-right">{formatCurrency(ig.totalValor)}</span>
                          </button>

                          {expandedCascade[itemKey] && (
                            <div className="px-7 pb-2">
                              <table className="tbl-bf w-full text-xs">
                                <thead>
                                  <tr className="text-[9px] uppercase text-muted-foreground">
                                    <th className="py-1 text-left">Nº</th>
                                    <th className="py-1 text-left">Fornecedor</th>
                                    <th className="py-1 text-left">Cond.</th>
                                    <th className="py-1 text-right">Casas</th>
                                    <th className="py-1 text-right">Valor</th>
                                    <th className="py-1 text-center">Status</th>
                                    <th className="py-1 text-center w-16">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                  {itemPedidos.map(p => (
                                    <tr key={p.id} className="group/row hover:bg-muted/10">
                                      <td className="py-1.5 font-mono text-primary font-bold">#{p.numero_pedido ?? '?'}</td>
                                      <td className="py-1.5 truncate max-w-[150px]">{p.fornecedor_nome ?? '—'}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{p.cond_pagamento ?? '—'}</td>
                                      <td className="py-1.5 text-right">{p.casas_lote ? formatNumber(Number(p.casas_lote), 2, 2) : '—'}</td>
                                      <td className="py-1.5 text-right font-medium">{p.valor_total_real != null ? formatCurrency(p.valor_total_real) : '—'}</td>
                                      <td className="py-1.5 text-center">
                                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusColors[p.status] ?? ''}`}>
                                          {statusLabel(p.status)}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-center">
                                        <div className="flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                                          <button onClick={() => startEdit(p)} className="rounded p-0.5 hover:bg-accent text-foreground" title="Editar"><Pencil className="h-3 w-3" /></button>
                                          <button onClick={() => duplicatePedido(p)} className="rounded p-0.5 hover:bg-accent text-foreground" title="Duplicar"><Copy className="h-3 w-3" /></button>
                                          <button onClick={() => setConfirmDelete(p.id)} className="rounded p-0.5 hover:bg-destructive/10 text-destructive" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
  const updateFornecedor = useUpdateFornecedor()
  const deleteFornecedor = useDeleteFornecedor()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const emptyForm = { nome: '', cnpj: '', contato: '', cond_pagamento_padrao: '', tipo: 'fornecedor' as 'fornecedor' | 'cliente' | 'ambos' }
  const [form, setForm] = useState(emptyForm)
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'fornecedor' | 'cliente' | 'ambos'>('todos')

  const selection = useSelection()

  const startEdit = (f: Fornecedor) => {
    setEditingId(f.id)
    setForm({
      nome: f.nome ?? '',
      cnpj: f.cnpj ?? '',
      contato: f.contato ?? '',
      cond_pagamento_padrao: f.cond_pagamento_padrao ?? '',
      tipo: (f.tipo ?? 'fornecedor') as 'fornecedor' | 'cliente' | 'ambos',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      contato: form.contato || null,
      cond_pagamento_padrao: form.cond_pagamento_padrao || null,
      tipo: form.tipo,
    }
    if (editingId) {
      await updateFornecedor.mutateAsync({ id: editingId, ...payload } as any)
    } else {
      await createFornecedor.mutateAsync(payload as any)
    }
    closeForm()
  }

  const handleDelete = async (f: Fornecedor) => {
    if (!confirm(`Excluir "${f.nome}"? Pedidos/itens que referenciam este parceiro terão o vínculo removido.`)) return
    await deleteFornecedor.mutateAsync(f.id)
  }

  const filtered = fornecedores.filter((f) => {
    if (tipoFiltro !== 'todos' && (f.tipo ?? 'fornecedor') !== tipoFiltro) return false
    const hay = search.toLowerCase()
    return f.nome.toLowerCase().includes(hay) || (f.cnpj ?? '').includes(search)
  })

  const tipoBadge = (t: string) => {
    if (t === 'cliente') return { label: 'Cliente', cls: 'bg-blue-500/10 text-blue-600' }
    if (t === 'ambos') return { label: 'Ambos', cls: 'bg-purple-500/10 text-purple-600' }
    return { label: 'Fornecedor', cls: 'bg-slate-500/10 text-slate-600' }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-lg border bg-card p-0.5 text-xs">
          {(['todos', 'fornecedor', 'cliente', 'ambos'] as const).map(t => (
            <button key={t} onClick={() => setTipoFiltro(t)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                tipoFiltro === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}>
              {t === 'todos' ? 'Todos' : t === 'fornecedor' ? 'Fornecedores' : t === 'cliente' ? 'Clientes' : 'Ambos'}
            </button>
          ))}
        </div>
        <button
          onClick={() => { if (showForm) { closeForm() } else { setEditingId(null); setForm(emptyForm); setShowForm(true) } }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo Parceiro
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="mb-3 text-sm font-semibold">{editingId ? 'Editar Parceiro' : 'Novo Parceiro'}</div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className={LABEL}>Nome *</label><input type="text" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className={INPUT} /></div>
              <div>
                <label className={LABEL}>Tipo *</label>
                <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as any }))} className={INPUT}>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="cliente">Cliente</option>
                  <option value="ambos">Ambos (Fornecedor + Cliente)</option>
                </select>
              </div>
              <div><label className={LABEL}>CNPJ</label><input type="text" value={form.cnpj} onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Contato</label><input type="text" value={form.contato} onChange={(e) => setForm((p) => ({ ...p, contato: e.target.value }))} className={INPUT} /></div>
              <div className="md:col-span-2"><label className={LABEL}>Cond. Pagamento</label><input type="text" value={form.cond_pagamento_padrao} onChange={(e) => setForm((p) => ({ ...p, cond_pagamento_padrao: e.target.value }))} placeholder="30/60/90" className={INPUT} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeForm} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />{editingId ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhum parceiro" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="tbl-bf w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">
                  <input type="checkbox"
                    checked={selection.count === filtered.length && filtered.length > 0}
                    onChange={() => selection.toggleAll(filtered.map(f => f.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parceiro</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CNPJ</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contato</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condição</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((f) => {
                const tb = tipoBadge(f.tipo ?? 'fornecedor')
                const isEditing = editingId === f.id
                return (
                <tr key={f.id} className={`group hover:bg-muted/20 ${isEditing ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={selection.isSelected(f.id)}
                      onChange={() => selection.toggle(f.id)}
                      className="h-3.5 w-3.5 rounded accent-primary" />
                  </td>
                  <td className="px-3 py-2.5 font-medium">{f.nome}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${tb.cls}`}>{tb.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.cnpj ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.contato ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{f.cond_pagamento_padrao ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        title="Editar"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        title="Excluir"
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
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
// CONFERÊNCIA WBS TAB — #17 Orçado vs Pedido vs Saldo
// ═══════════════════════════════════════════════════════════════

function ConferenciaWBSTab({ search }: { search: string }) {
  const { data: itens = [], isLoading } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()
  const { data: parcelas = [] } = useParcelas()
  const [expandedEtapas, setExpandedEtapas] = useState<Record<string, boolean>>({})

  const toggleEtapa = (id: string) => setExpandedEtapas(p => ({ ...p, [id]: !p[id] }))

  const data = useMemo(() => {
    // Build pedido and pago spend per item
    const statsPorItem = new Map<string, { totalPedido: number; qtdPedidos: number; totalPago: number }>()
    pedidos.forEach(p => {
      const prev = statsPorItem.get(p.item_compra_id) || { totalPedido: 0, qtdPedidos: 0, totalPago: 0 }
      prev.totalPedido += Number(p.valor_total_real || 0)
      prev.qtdPedidos += 1
      statsPorItem.set(p.item_compra_id, prev)
    })

    parcelas.forEach(p => {
      if (!p.item_compra_id || p.status !== 'paga') return
      const prev = statsPorItem.get(p.item_compra_id) || { totalPedido: 0, qtdPedidos: 0, totalPago: 0 }
      prev.totalPago += Number(p.valor_pago || 0)
      statsPorItem.set(p.item_compra_id, prev)
    })

    // Group by etapa
    const etapaMap = new Map<string, { etapa: typeof etapas[0]; items: Array<typeof itens[0] & { totalPedido: number; qtdPedidos: number; totalPago: number; saldo: number; pctUsado: number }> }>()

    itens.forEach(item => {
      const s = search.toLowerCase()
      if (s && !(item.descricao ?? '').toLowerCase().includes(s) && !(item.codigo ?? '').toLowerCase().includes(s)) return

      const etapa = etapas.find(e => e.id === item.etapa_id)
      if (!etapa) return

      if (!etapaMap.has(etapa.id)) etapaMap.set(etapa.id, { etapa, items: [] })
      const ped = statsPorItem.get(item.id) || { totalPedido: 0, qtdPedidos: 0, totalPago: 0 }
      const saldo = item.valor_total_orcado - ped.totalPedido
      const pctUsado = item.valor_total_orcado > 0 ? (ped.totalPedido / item.valor_total_orcado) * 100 : 0

      etapaMap.get(etapa.id)!.items.push({
        ...item,
        ...ped,
        saldo,
        pctUsado,
      })
    })

    // Sort etapas by codigo
    return Array.from(etapaMap.values()).sort((a, b) => (a.etapa.codigo ?? '').localeCompare(b.etapa.codigo ?? ''))
  }, [itens, pedidos, etapas, search])

  // Totals
  const totals = useMemo(() => {
    let orcado = 0, pedido = 0, saldo = 0, pago = 0
    data.forEach(g => g.items.forEach(i => { orcado += i.valor_total_orcado; pedido += i.totalPedido; saldo += i.saldo; pago += i.totalPago }))
    return { orcado, pedido, saldo, pago }
  }, [data])

  if (isLoading) return <Spinner />

  return (
    <>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniCard label="Itens WBS" value={String(itens.length)} />
        <MiniCard label="Orçado Total" value={formatCurrency(totals.orcado)} />
        <MiniCard label="Pedido Total" value={formatCurrency(totals.pedido)} accent="amber" />
        <MiniCard label="Total Pago" value={formatCurrency(totals.pago)} accent="blue" />
        <MiniCard label="Saldo Disponível" value={formatCurrency(totals.saldo)} accent={totals.saldo >= 0 ? 'emerald' : 'red'} />
      </div>

      {data.length === 0 ? <EmptyState msg="Nenhum item encontrado" /> : (
        <div className="space-y-2">
          {data.map(group => {
            const etTotal = group.items.reduce((s, i) => s + i.valor_total_orcado, 0)
            const etPedido = group.items.reduce((s, i) => s + i.totalPedido, 0)
            const etPago = group.items.reduce((s, i) => s + i.totalPago, 0)
            const etSaldo = etTotal - etPedido
            const hasFuro = group.items.some(i => i.saldo < 0)

            return (
              <div key={group.etapa.id} className={`rounded-xl border bg-card ${hasFuro ? 'border-red-300' : ''}`}>
                <button
                  onClick={() => toggleEtapa(group.etapa.id)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors"
                >
                  {expandedEtapas[group.etapa.id] ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{group.etapa.codigo}</span>
                      <span className="text-sm font-semibold truncate">{group.etapa.nome}</span>
                      <span className="text-[10px] text-muted-foreground">({group.items.length} itens)</span>
                      {hasFuro && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-600">⚠ ESTOURO</span>}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${etPedido > etTotal ? 'bg-red-500' : etPedido > etTotal * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, etTotal > 0 ? (etPedido / etTotal) * 100 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{etTotal > 0 ? ((etPedido / etTotal) * 100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex gap-4 shrink-0 text-xs">
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Orçado</p>
                      <p className="font-medium">{formatCurrency(etTotal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Pedido</p>
                      <p className="font-medium text-amber-600">{formatCurrency(etPedido)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Pago</p>
                      <p className="font-medium text-blue-600">{formatCurrency(etPago)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Saldo</p>
                      <p className={`font-bold ${etSaldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(etSaldo)}</p>
                    </div>
                  </div>
                </button>

                {expandedEtapas[group.etapa.id] && (
                  <div className="border-t px-3 pb-2">
                    <table className="tbl-bf w-full text-xs">
                      <thead>
                        <tr className="text-[9px] uppercase text-muted-foreground">
                          <th className="py-1.5 text-left">Código</th>
                          <th className="py-1.5 text-left">Descrição</th>
                          <th className="py-1.5 text-center">Pedidos</th>
                          <th className="py-1.5 text-right">Orçado</th>
                          <th className="py-1.5 text-right">Pedido</th>
                          <th className="py-1.5 text-right">Pago</th>
                          <th className="py-1.5 text-right">Saldo</th>
                          <th className="py-1.5 text-right">Uso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {group.items.map(item => (
                          <tr key={item.id} className={`${item.saldo < 0 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                            <td className="py-1.5 font-mono text-[10px] text-muted-foreground">{item.codigo}</td>
                            <td className="py-1.5 max-w-[200px] truncate">{item.descricao}</td>
                            <td className="py-1.5 text-center font-mono">{item.qtdPedidos || '—'}</td>
                            <td className="py-1.5 text-right">{formatCurrency(item.valor_total_orcado)}</td>
                            <td className="py-1.5 text-right text-amber-600">{item.totalPedido > 0 ? formatCurrency(item.totalPedido) : '—'}</td>
                            <td className="py-1.5 text-right text-blue-600">{item.totalPago > 0 ? formatCurrency(item.totalPago) : '—'}</td>
                            <td className={`py-1.5 text-right font-bold ${item.saldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {formatCurrency(item.saldo)}
                            </td>
                            <td className="py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${item.pctUsado > 100 ? 'bg-red-500' : item.pctUsado > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(100, item.pctUsado)}%` }}
                                  />
                                </div>
                                <span className={`text-[9px] font-mono ${item.pctUsado > 100 ? 'text-red-600 font-bold' : ''}`}>{item.pctUsado.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
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
          <table className="tbl-bf w-full text-sm">
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
  const [search, setSearch] = useState('')

  const groups = useMemo(() => {
    // Seed por itens (fornecedor preferencial do orcamento)
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

    // Inclui fornecedores que so tem PEDIDOS (sem item proprio) — caso BRUNO MARKLEWSKI
    pedidos.forEach((p) => {
      const fid = p.fornecedor_id ?? '__sem_fornecedor__'
      if (!map.has(fid)) {
        const forn = fornecedores.find((f) => f.id === fid) ?? null
        map.set(fid, { fornecedor: forn, itens: [], totalOrcado: 0, totalConsumido: 0 })
      }
    })

    // Enrich with parcela / pedido info
    return [...map.entries()].map(([fid, g]) => {
      const fornPedidos = pedidos.filter((p) => (p.fornecedor_id ?? '__sem_fornecedor__') === fid)
      const pedidoIds = new Set(fornPedidos.map((p) => p.id))
      const totalPedidos = fornPedidos.reduce((s, p) => s + Number(p.valor_total_real ?? 0), 0)

      const fornParcelas = parcelas.filter((p) => p.pedido_id && pedidoIds.has(p.pedido_id))
      const totalPago = fornParcelas.filter((p) => p.status === 'paga').reduce((s, p) => s + p.valor_pago, 0)
      const pendente = fornParcelas.filter((p) => p.status !== 'paga').reduce((s, p) => s + p.valor - p.valor_pago, 0)

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
        totalPedidos,
        qtdPedidos: fornPedidos.length,
        totalPago,
        pendente,
        proxVenc: proxVenc ? proxVenc.data_vencimento : null,
      }
    })
    // Ordena por relevancia: o que tem maior valor (orcado OU pedidos)
    .sort((a, b) => Math.max(b.totalOrcado, b.totalPedidos) - Math.max(a.totalOrcado, a.totalPedidos))
  }, [itens, parcelas, pedidos, fornecedores])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return groups
    return groups.filter(g => g.nome.toLowerCase().includes(q))
  }, [groups, search])

  if (isLoading) return <Spinner />
  if (groups.length === 0) return <EmptyState msg="Sem dados de fornecedores" />

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar parceiro por nome…"
          className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {filtered.length}/{groups.length}
          </span>
        )}
      </div>
      {filtered.length === 0 && search && (
        <EmptyState msg={`Nenhum parceiro encontrado para "${search}"`} />
      )}
      {filtered.map((g) => (
        <div key={g.id} className="rounded-xl border bg-card transition-shadow hover:shadow-sm">
          <button
            onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            {expandedId === g.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1">
              <h4 className="text-sm font-semibold">{g.nome}</h4>
              <p className="text-[10px] text-muted-foreground">
                {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                {g.qtdPedidos > 0 && ` · ${g.qtdPedidos} ${g.qtdPedidos === 1 ? 'pedido' : 'pedidos'}`}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">{g.itens.length === 0 ? 'Pedidos' : 'Orçado'}</p>
                <p className="font-medium">{formatCurrency(g.itens.length === 0 ? g.totalPedidos : g.totalOrcado)}</p>
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
              <table className="tbl-bf w-full text-xs">
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
              {/* Pedidos do parceiro (incluindo aqueles cujo item nao tem fornecedor preferencial) */}
              {g.qtdPedidos > 0 && (
                <div className="mt-3">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1">Pedidos ({g.qtdPedidos})</p>
                  <table className="tbl-bf w-full text-xs">
                    <thead>
                      <tr className="text-[9px] uppercase text-muted-foreground">
                        <th className="py-1 text-left">#</th>
                        <th className="py-1 text-left">Item</th>
                        <th className="py-1 text-left">Status</th>
                        <th className="py-1 text-right">Valor</th>
                        <th className="py-1 text-right">Entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {pedidos
                        .filter(p => (p.fornecedor_id ?? '__sem_fornecedor__') === g.id)
                        .sort((a, b) => (b.numero_pedido ?? 0) - (a.numero_pedido ?? 0))
                        .slice(0, 50)
                        .map(p => {
                          const it = itens.find(i => i.id === p.item_compra_id)
                          return (
                            <tr key={p.id}>
                              <td className="py-1.5 font-mono text-[10px]">#{p.numero_pedido ?? '—'}</td>
                              <td className="max-w-[180px] truncate py-1.5">{it?.descricao ?? p.item_descricao ?? '—'}</td>
                              <td className="py-1.5 text-muted-foreground text-[10px]">{p.status}</td>
                              <td className="py-1.5 text-right">{formatCurrency(Number(p.valor_total_real ?? 0))}</td>
                              <td className="py-1.5 text-right text-[10px] text-muted-foreground">{p.data_entrega_prevista ? localDate(p.data_entrega_prevista).toLocaleDateString('pt-BR') : '—'}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
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
