import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Trash2, DollarSign, Package, Check, X } from 'lucide-react'
import { useUpdateEtapa, type Etapa } from '@/hooks/useEtapas'
import { useCreateDistribuicao, useUpdateDistribuicao, useDeleteDistribuicao, type Distribuicao } from '@/hooks/useOperacional'
import type { ItemCompra, Pedido } from '@/hooks/useCompras'
import type { Parcela } from '@/hooks/useFinanceiro'
import FaturamentoCronogramaSection from './FaturamentoCronogramaSection'
import ItemCompraSection from './ItemCompraSection'

type StatusKey = 'futuro' | 'em_andamento' | 'concluido' | 'atrasado'

const STATUS_CFG: Record<StatusKey, { label: string; bg: string; text: string }> = {
  futuro: { label: 'Futuro', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500' },
  em_andamento: { label: 'Em Andamento', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600' },
  concluido: { label: 'Concluído', bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-600' },
  atrasado: { label: 'Atrasado', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-600' },
}
const STATUSES: StatusKey[] = ['futuro', 'em_andamento', 'atrasado', 'concluido']

type SortField = 'codigo' | 'nome' | 'status' | 'casas' | 'receita' | 'orcado' | 'consumido' | 'margem' | 'pago' | 'saldo' | 'pct'
type SortDir = 'asc' | 'desc'

interface WBSTableProps {
  etapas: Etapa[]
  itemsByEtapa: Map<string, ItemCompra[]>
  distByEtapa: Map<string, Distribuicao[]>
  pedidosByItem: Map<string, Pedido[]>
  parcelasByPedido: Map<string, Parcela[]>
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  expandedItems: Set<string>
  toggleItem: (id: string) => void
  onEdit: (e: Etapa) => void
  onDelete: (id: string) => void
  selection: { selected: Set<string>; toggle: (id: string) => void; toggleAll: (ids: string[]) => void; isSelected: (id: string) => boolean }
}

export default function WBSTable({ etapas, itemsByEtapa, distByEtapa, pedidosByItem, parcelasByPedido, expandedIds, toggleExpand, expandedItems, toggleItem, onEdit, onDelete, selection }: WBSTableProps) {
  const updateEtapa = useUpdateEtapa()
  const createDist = useCreateDistribuicao()
  const updateDist = useUpdateDistribuicao()
  const deleteDist = useDeleteDistribuicao()

  const [sortField, setSortField] = useState<SortField>('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp className="h-2.5 w-2.5 inline ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 inline ml-0.5" />
  }

  // Compute per-etapa financials
  const enriched = useMemo(() => etapas.map(etapa => {
    const items = itemsByEtapa.get(etapa.id) ?? []
    const dists = distByEtapa.get(etapa.id) ?? []
    const distReceita = dists.reduce((sum, d) => sum + (d.valor_liberado_faturamento || 0), 0)
    const receita = etapa.faturamento_valor_total || distReceita
    const orcado = items.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)
    let consumido = 0, pago = 0
    items.forEach(i => {
      const peds = pedidosByItem.get(i.id) ?? []
      peds.forEach(p => {
        consumido += (p.valor_total_real || 0)
        const parcs = parcelasByPedido.get(p.id) ?? []
        parcs.forEach(parc => pago += (parc.valor_pago || 0))
      })
    })
    const saldo = orcado - consumido
    const margem = receita - orcado
    const margemPct = receita > 0 ? ((receita - orcado) / receita) * 100 : 0
    const pct = orcado > 0 ? (consumido / orcado) * 100 : 0
    return { etapa, items, dists, receita, orcado, consumido, pago, saldo, margem, margemPct, pct }
  }), [etapas, itemsByEtapa, distByEtapa, pedidosByItem, parcelasByPedido])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...enriched]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const av = ({ codigo: a.etapa.codigo, nome: a.etapa.nome, status: a.etapa.status, casas: a.etapa.casas_total, receita: a.receita, orcado: a.orcado, consumido: a.consumido, margem: a.margem, pago: a.pago, saldo: a.saldo, pct: a.pct } as Record<string, any>)[sortField]
      const bv = ({ codigo: b.etapa.codigo, nome: b.etapa.nome, status: b.etapa.status, casas: b.etapa.casas_total, receita: b.receita, orcado: b.orcado, consumido: b.consumido, margem: b.margem, pago: b.pago, saldo: b.saldo, pct: b.pct } as Record<string, any>)[sortField]
      if (typeof av === 'string') return av.localeCompare(bv) * dir
      return ((av as number) - (bv as number)) * dir
    })
    return arr
  }, [enriched, sortField, sortDir])

  // Totals
  const totals = useMemo(() => enriched.reduce((t, r) => ({
    receita: t.receita + r.receita, orcado: t.orcado + r.orcado, consumido: t.consumido + r.consumido,
    pago: t.pago + r.pago, saldo: t.saldo + r.saldo, margem: t.margem + r.margem, items: t.items + r.items.length,
  }), { receita: 0, orcado: 0, consumido: 0, pago: 0, saldo: 0, margem: 0, items: 0 }), [enriched])

  const totalMargemPct = totals.receita > 0 ? ((totals.receita - totals.orcado) / totals.receita) * 100 : 0
  const totalPct = totals.orcado > 0 ? (totals.consumido / totals.orcado) * 100 : 0

  // Inline status edit
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)

  const handleStatusChange = (id: string, status: StatusKey) => {
    updateEtapa.mutate({ id, status })
    setEditingStatusId(null)
  }

  // Inline name edit
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const startNameEdit = (e: Etapa) => { setEditingNameId(e.id); setEditingName(e.nome) }
  const saveName = (id: string) => { updateEtapa.mutate({ id, nome: editingName }); setEditingNameId(null) }

  // Inline casas edit
  const [editingCasasId, setEditingCasasId] = useState<string | null>(null)
  const [editingCasas, setEditingCasas] = useState(0)

  const startCasasEdit = (e: Etapa) => { setEditingCasasId(e.id); setEditingCasas(e.casas_total) }
  const saveCasas = (id: string) => { updateEtapa.mutate({ id, casas_total: editingCasas }); setEditingCasasId(null) }

  const Th = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <div className={`p-2 cursor-pointer select-none hover:text-foreground ${className}`} onClick={() => toggleSort(field)}>
      {label}<SortIcon field={field} />
    </div>
  )

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[28px_32px_56px_1fr_90px_50px_90px_90px_90px_80px_52px_72px_72px_72px_44px_50px] border-b bg-muted/40 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="p-2 flex items-center justify-center">
          <input type="checkbox" checked={selection.selected.size === etapas.length && etapas.length > 0} onChange={() => selection.toggleAll(etapas.map(e => e.id))} className="h-3 w-3 rounded accent-primary cursor-pointer" />
        </div>
        <div className="p-2" />
        <Th field="codigo" label="Cód" />
        <Th field="nome" label="Nome" />
        <Th field="status" label="Status" className="text-center" />
        <Th field="casas" label="Casas" className="text-center" />
        <Th field="receita" label="Receita" className="text-right" />
        <Th field="orcado" label="Custo Orç." className="text-right" />
        <Th field="consumido" label="Consumido" className="text-right" />
        <Th field="margem" label="Margem" className="text-right" />
        <div className="p-2 text-center">%M</div>
        <Th field="pago" label="Pago" className="text-right" />
        <Th field="saldo" label="Saldo" className="text-right" />
        <Th field="pct" label="Exec" className="text-center" />
        <div className="p-2 text-center">Itens</div>
        <div className="p-2 text-center">Ações</div>
      </div>

      {/* Rows */}
      {sorted.map(({ etapa, items, dists, receita, orcado, consumido, pago, saldo, margem, margemPct, pct }) => {
        const exp = expandedIds.has(etapa.id)
        const cfg = STATUS_CFG[etapa.status]
        return (
          <div key={etapa.id}>
            <div className={`grid grid-cols-[28px_32px_56px_1fr_90px_50px_90px_90px_90px_80px_52px_72px_72px_72px_44px_50px] border-b hover:bg-muted/20 group cursor-pointer text-xs ${selection.isSelected(etapa.id) ? 'bg-primary/5' : ''}`} onClick={() => toggleExpand(etapa.id)}>
              {/* Checkbox */}
              <div className="p-2 flex items-center justify-center" onClick={e => { e.stopPropagation(); selection.toggle(etapa.id) }}>
                <input type="checkbox" checked={selection.isSelected(etapa.id)} onChange={() => selection.toggle(etapa.id)} className="h-3 w-3 rounded accent-primary cursor-pointer" />
              </div>
              {/* Expand */}
              <div className="p-2 flex items-center justify-center">
                {exp ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
              {/* Código */}
              <div className="p-2 flex items-center"><span className="font-mono text-[10px] text-muted-foreground">{etapa.codigo}</span></div>
              {/* Nome */}
              <div className="p-2 flex items-center" onClick={e => { e.stopPropagation(); if (editingNameId !== etapa.id) startNameEdit(etapa) }}>
                {editingNameId === etapa.id ? (
                  <div className="flex items-center gap-1 w-full">
                    <input value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(etapa.id); if (e.key === 'Escape') setEditingNameId(null) }} className="flex-1 border rounded px-1.5 py-0.5 text-xs bg-background" autoFocus />
                    <button onClick={() => saveName(etapa.id)} className="rounded p-0.5 bg-primary text-primary-foreground"><Check className="h-3 w-3" /></button>
                    <button onClick={() => setEditingNameId(null)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <span className="font-semibold truncate">{etapa.nome}</span>
                )}
              </div>
              {/* Status */}
              <div className="p-2 flex items-center justify-center" onClick={e => { e.stopPropagation(); setEditingStatusId(editingStatusId === etapa.id ? null : etapa.id) }}>
                {editingStatusId === etapa.id ? (
                  <select value={etapa.status} onChange={e => handleStatusChange(etapa.id, e.target.value as StatusKey)} className="text-[10px] border rounded bg-background px-1 py-0.5" autoFocus onBlur={() => setEditingStatusId(null)}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                  </select>
                ) : (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                )}
              </div>
              {/* Casas */}
              <div className="p-2 flex items-center justify-center" onClick={e => { e.stopPropagation(); startCasasEdit(etapa) }}>
                {editingCasasId === etapa.id ? (
                  <input type="number" value={editingCasas} onChange={e => setEditingCasas(+e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCasas(etapa.id); if (e.key === 'Escape') setEditingCasasId(null) }} onBlur={() => saveCasas(etapa.id)} className="w-10 border rounded px-1 py-0.5 text-center text-[10px] bg-background" autoFocus />
                ) : (
                  <span>{etapa.casas_total}</span>
                )}
              </div>
              {/* Receita */}
              <div className="p-2 flex items-center justify-end text-blue-600 font-medium">{receita > 0 ? formatCurrency(receita) : <span className="text-muted-foreground/40">—</span>}</div>
              {/* Custo Orçado */}
              <div className="p-2 flex items-center justify-end font-medium">{formatCurrency(orcado)}</div>
              {/* Consumido */}
              <div className="p-2 flex items-center justify-end text-amber-600 font-medium">{formatCurrency(consumido)}</div>
              {/* Margem R$ */}
              <div className={`p-2 flex items-center justify-end font-medium ${margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{receita > 0 ? formatCurrency(margem) : <span className="text-muted-foreground/40">—</span>}</div>
              {/* Margem % */}
              <div className="p-2 flex items-center justify-center">
                {receita > 0 ? (
                  <span className={`rounded-full px-1 py-0.5 text-[8px] font-bold ${margemPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{margemPct.toFixed(0)}%</span>
                ) : <span className="text-muted-foreground/40 text-[9px]">—</span>}
              </div>
              {/* Pago */}
              <div className="p-2 flex items-center justify-end text-blue-500 font-medium text-[10px]">{formatCurrency(pago)}</div>
              {/* Saldo */}
              <div className={`p-2 flex items-center justify-end font-medium text-[10px] ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(saldo)}</div>
              {/* % Exec */}
              <div className="p-2 flex flex-col items-center justify-center gap-0.5">
                <div className="w-8 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                <span className="text-[8px] text-muted-foreground">{pct.toFixed(0)}%</span>
              </div>
              {/* Itens count */}
              <div className="p-2 flex items-center justify-center">
                {items.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold">{items.length}</span>}
              </div>
              {/* Ações */}
              <div className="p-2 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(etapa)} className="rounded p-0.5 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                <button onClick={() => onDelete(etapa.id)} className="rounded p-0.5 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
              </div>
            </div>

            {/* Expanded: Tabs */}
            {exp && (
              <ExpandedRow etapa={etapa} dists={dists} items={items} pedidosByItem={pedidosByItem} parcelasByPedido={parcelasByPedido} expandedItems={expandedItems} toggleItem={toggleItem} updateEtapa={updateEtapa} createDist={createDist} updateDist={updateDist} deleteDist={deleteDist} />
            )}
          </div>
        )
      })}

      {/* Totals row */}
      <div className="grid grid-cols-[28px_32px_56px_1fr_90px_50px_90px_90px_90px_80px_52px_72px_72px_72px_44px_50px] border-t-2 bg-muted/30 text-xs font-bold">
        <div className="p-2" />
        <div className="p-2" />
        <div className="p-2" />
        <div className="p-2">TOTAL ({etapas.length} etapas)</div>
        <div className="p-2" />
        <div className="p-2" />
        <div className="p-2 text-right text-blue-600">{formatCurrency(totals.receita)}</div>
        <div className="p-2 text-right">{formatCurrency(totals.orcado)}</div>
        <div className="p-2 text-right text-amber-600">{formatCurrency(totals.consumido)}</div>
        <div className={`p-2 text-right ${totals.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totals.margem)}</div>
        <div className="p-2 text-center">
          <span className={`rounded-full px-1 py-0.5 text-[8px] font-bold ${totalMargemPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{totalMargemPct.toFixed(0)}%</span>
        </div>
        <div className="p-2 text-right text-blue-500">{formatCurrency(totals.pago)}</div>
        <div className={`p-2 text-right ${totals.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totals.saldo)}</div>
        <div className="p-2 text-center">
          <span className="text-[9px]">{totalPct.toFixed(0)}%</span>
        </div>
        <div className="p-2 text-center"><span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{totals.items}</span></div>
        <div className="p-2" />
      </div>
    </div>
  )
}

// ── Expanded Row with tabs ──────────────────────────────────────
function ExpandedRow({ etapa, dists, items, pedidosByItem, parcelasByPedido, expandedItems, toggleItem, updateEtapa, createDist, updateDist, deleteDist }: any) {
  const [tab, setTab] = useState<'faturamento' | 'compras'>('faturamento')

  return (
    <div className="border-b bg-muted/5 relative">
      <div className="flex items-center gap-1 border-b px-4 mt-2">
        <button onClick={() => setTab('faturamento')} className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${tab === 'faturamento' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <DollarSign className="h-3.5 w-3.5" /> Faturamento & Cronograma
          {dists.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[9px]">{dists.length}</span>}
        </button>
        <button onClick={() => setTab('compras')} className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${tab === 'compras' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Package className="h-3.5 w-3.5" /> Itens de Compra ({items.length})
        </button>
      </div>

      <div className="py-3">
        {tab === 'faturamento' && <FaturamentoCronogramaSection etapa={etapa} dists={dists} updateEtapa={updateEtapa} createDist={createDist} updateDist={updateDist} deleteDist={deleteDist} />}
        {tab === 'compras' && <ItemCompraSection etapaId={etapa.id} items={items} dists={dists} casasTotal={etapa.casas_total} pedidosByItem={pedidosByItem} parcelasByPedido={parcelasByPedido} expandedItems={expandedItems} toggleItem={toggleItem} />}
      </div>
    </div>
  )
}
