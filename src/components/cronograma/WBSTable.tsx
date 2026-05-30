import { useState, useMemo, Fragment } from 'react'
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
  futuro:       { label: 'Futuro',       bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500'   },
  em_andamento: { label: 'Em Andamento', bg: 'bg-blue-50 dark:bg-blue-950',   text: 'text-blue-600'    },
  concluido:    { label: 'Concluído',    bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-600' },
  atrasado:     { label: 'Atrasado',     bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-600'   },
}
const STATUSES: StatusKey[] = ['futuro', 'em_andamento', 'atrasado', 'concluido']

type SortField = 'codigo' | 'nome' | 'status' | 'casas' | 'receita' | 'orcado' | 'consumido' | 'aPagar' | 'pago' | 'saldo' | 'margem' | 'pct'
type SortDir = 'asc' | 'desc'

interface WBSTableProps {
  etapas: Etapa[]
  itemsByEtapa: Map<string, ItemCompra[]>
  distByEtapa: Map<string, Distribuicao[]>
  pedidosByItem: Map<string, Pedido[]>
  parcelasByPedido: Map<string, Parcela[]>
  consumidoPorItem?: Map<string, number>
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  expandedItems: Set<string>
  toggleItem: (id: string) => void
  onEdit: (e: Etapa) => void
  onDelete: (id: string) => void
  selection: { selected: Set<string>; toggle: (id: string) => void; toggleAll: (ids: string[]) => void; isSelected: (id: string) => boolean }
}

// ── Mini stacked bar: Pago (blue) | A Pagar (amber/red) | Saldo (muted) ──────
function CostBar({ orcado, consumido, pago }: { orcado: number; consumido: number; pago: number }) {
  if (orcado <= 0) return <span className="text-[9px] text-muted-foreground/30">—</span>
  const overBudget = consumido > orcado
  const ref = overBudget ? consumido : orcado
  const pagoPct   = Math.min(100, (pago / ref) * 100)
  const aPagarPct = Math.min(100 - pagoPct, (Math.max(0, consumido - pago) / ref) * 100)
  const execPct   = (consumido / orcado) * 100

  return (
    <div className="flex flex-col items-center gap-0.5 w-full min-w-[52px]">
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full bg-blue-500 shrink-0 transition-all"
          style={{ width: `${pagoPct}%` }}
          title={`Pago: ${pagoPct.toFixed(0)}%`}
        />
        <div
          className={`h-full shrink-0 transition-all ${overBudget ? 'bg-red-400' : 'bg-amber-400'}`}
          style={{ width: `${aPagarPct}%` }}
          title={`A Pagar: ${aPagarPct.toFixed(0)}%`}
        />
      </div>
      <span className={`text-[8px] font-semibold tabular-nums ${
        overBudget ? 'text-red-600' : execPct > 90 ? 'text-amber-500' : 'text-muted-foreground'
      }`}>
        {execPct.toFixed(0)}%
      </span>
    </div>
  )
}

export default function WBSTable({
  etapas, itemsByEtapa, distByEtapa, pedidosByItem, parcelasByPedido, consumidoPorItem,
  expandedIds, toggleExpand, expandedItems, toggleItem,
  onEdit, onDelete, selection,
}: WBSTableProps) {
  const updateEtapa = useUpdateEtapa()
  const createDist  = useCreateDistribuicao()
  const updateDist  = useUpdateDistribuicao()
  const deleteDist  = useDeleteDistribuicao()

  const [sortField, setSortField] = useState<SortField>('codigo')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp   className="h-2.5 w-2.5 inline ml-0.5" />
      : <ChevronDown className="h-2.5 w-2.5 inline ml-0.5" />
  }

  // ── Per-etapa financials ────────────────────────────────────────────────────
  const enriched = useMemo(() => etapas.map(etapa => {
    const items = itemsByEtapa.get(etapa.id) ?? []
    const dists = distByEtapa.get(etapa.id) ?? []
    const distReceita = dists.reduce((sum, d) => sum + (d.valor_liberado_faturamento || 0), 0)
    const receita = etapa.faturamento_valor_total || distReceita
    const orcado  = items.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0)

    let consumido = 0, pago = 0, aPagar = 0
    items.forEach(i => {
      consumido += consumidoPorItem?.get(i.id) ?? 0
      const peds = pedidosByItem.get(i.id) ?? []
      peds.forEach(p => {
        const parcs = parcelasByPedido.get(p.id) ?? []
        parcs.forEach(parc => {
          pago += (parc.valor_pago || 0)
          if (parc.status !== 'paga') {
            aPagar += Math.max(0, (parc.valor || 0) - (parc.valor_pago || 0))
          }
        })
      })
    })
    const saldo     = orcado - consumido
    const margem    = receita - orcado
    const margemPct = receita > 0 ? ((receita - orcado) / receita) * 100 : 0

    return { etapa, items, dists, receita, orcado, consumido, pago, aPagar, saldo, margem, margemPct }
  }), [etapas, itemsByEtapa, distByEtapa, pedidosByItem, parcelasByPedido])

  // ── Sort ────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...enriched]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const map = (r: typeof a): Record<string, string | number> => ({
        codigo: r.etapa.codigo, nome: r.etapa.nome, status: r.etapa.status,
        casas: r.etapa.casas_total, receita: r.receita, orcado: r.orcado,
        consumido: r.consumido, aPagar: r.aPagar, pago: r.pago,
        saldo: r.saldo, margem: r.margem,
        pct: r.orcado > 0 ? (r.consumido / r.orcado) * 100 : 0,
      })
      const av = map(a)[sortField], bv = map(b)[sortField]
      if (typeof av === 'string') return av.localeCompare(bv as string) * dir
      return ((av as number) - (bv as number)) * dir
    })
    return arr
  }, [enriched, sortField, sortDir])

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => enriched.reduce(
    (t, r) => ({
      receita:   t.receita   + r.receita,
      orcado:    t.orcado    + r.orcado,
      consumido: t.consumido + r.consumido,
      pago:      t.pago      + r.pago,
      aPagar:    t.aPagar    + r.aPagar,
      saldo:     t.saldo     + r.saldo,
      margem:    t.margem    + r.margem,
    }),
    { receita: 0, orcado: 0, consumido: 0, pago: 0, aPagar: 0, saldo: 0, margem: 0 },
  ), [enriched])

  const totalMargemPct = totals.receita > 0
    ? ((totals.receita - totals.orcado) / totals.receita) * 100
    : 0

  // ── Inline edits ────────────────────────────────────────────────────────────
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const handleStatusChange = (id: string, status: StatusKey) => {
    updateEtapa.mutate({ id, status })
    setEditingStatusId(null)
  }

  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingName,   setEditingName]   = useState('')
  const startNameEdit = (e: Etapa) => { setEditingNameId(e.id); setEditingName(e.nome) }
  const saveName      = (id: string) => { updateEtapa.mutate({ id, nome: editingName }); setEditingNameId(null) }

  const [editingCasasId, setEditingCasasId] = useState<string | null>(null)
  const [editingCasas,   setEditingCasas]   = useState(0)
  const startCasasEdit = (e: Etapa) => { setEditingCasasId(e.id); setEditingCasas(e.casas_total) }
  const saveCasas      = (id: string) => { updateEtapa.mutate({ id, casas_total: editingCasas }); setEditingCasasId(null) }

  // ── Sortable th ─────────────────────────────────────────────────────────────
  const Th = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <th
      className={`px-2 py-1.5 cursor-pointer select-none hover:text-foreground text-[9px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${className}`}
      onClick={() => toggleSort(field)}
    >
      {label}<SortIcon field={field} />
    </th>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col style={{ width: 28  }} />{/* checkbox  */}
          <col style={{ width: 28  }} />{/* expand    */}
          <col style={{ width: 60  }} />{/* código    */}
          <col               />{/* nome (flex) */}
          <col style={{ width: 108 }} />{/* status    */}
          <col style={{ width: 48  }} />{/* casas     */}
          <col style={{ width: 92  }} />{/* receita   */}
          <col style={{ width: 92  }} />{/* planejado */}
          <col style={{ width: 92  }} />{/* consumido */}
          <col style={{ width: 84  }} />{/* a pagar   */}
          <col style={{ width: 84  }} />{/* pago      */}
          <col style={{ width: 84  }} />{/* saldo     */}
          <col style={{ width: 88  }} />{/* margem    */}
          <col style={{ width: 72  }} />{/* exec bar  */}
          <col style={{ width: 40  }} />{/* ações     */}
        </colgroup>

        <thead>
          {/* ── Level 1: group labels ─────────────────────────── */}
          <tr className="border-b text-[9px] font-bold uppercase tracking-wider">
            <th colSpan={6} className="px-3 py-1.5 text-left text-muted-foreground bg-muted/30">
              Etapa
            </th>
            <th
              colSpan={1}
              className="px-2 py-1.5 text-center text-blue-600 bg-blue-50/60 dark:bg-blue-950/30 border-x border-blue-200/40 dark:border-blue-800/30"
            >
              Receita
            </th>
            <th
              colSpan={5}
              className="px-2 py-1.5 text-center text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30 border-x border-amber-200/40 dark:border-amber-800/30"
            >
              Custos Diretos
            </th>
            <th colSpan={2} className="px-2 py-1.5 text-center text-muted-foreground bg-muted/30">
              Resultado
            </th>
            <th className="bg-muted/30" />
          </tr>

          {/* ── Level 2: column labels ────────────────────────── */}
          <tr className="border-b bg-muted/40">
            <th className="px-2 py-1.5">
              <input
                type="checkbox"
                checked={selection.selected.size === etapas.length && etapas.length > 0}
                onChange={() => selection.toggleAll(etapas.map(e => e.id))}
                className="h-3 w-3 rounded accent-primary cursor-pointer"
              />
            </th>
            <th className="px-2 py-1.5" />
            <Th field="codigo"    label="Cód"       />
            <Th field="nome"      label="Nome"      className="text-left" />
            <Th field="status"    label="Status"    className="text-center" />
            <Th field="casas"     label="Casas"     className="text-center" />

            {/* Receita group */}
            <Th field="receita"   label="CEF"       className="text-right text-blue-600/80" />

            {/* Custos group */}
            <Th field="orcado"    label="Planejado" className="text-right" />
            <Th field="consumido" label="Consumido" className="text-right text-amber-600/80" />
            <Th field="aPagar"    label="A Pagar"   className="text-right text-orange-600/80" />
            <Th field="pago"      label="Pago"      className="text-right text-emerald-600/80" />
            <Th field="saldo"     label="Saldo"     className="text-right" />

            {/* Resultado group */}
            <Th field="margem"    label="Margem"    className="text-right" />
            <Th field="pct"       label="Exec"      className="text-center" />

            <th className="px-2 py-1.5" />
          </tr>
        </thead>

        <tbody>
          {sorted.map(({ etapa, items, dists, receita, orcado, consumido, pago, aPagar, saldo, margem, margemPct }) => {
            const exp = expandedIds.has(etapa.id)
            const cfg = STATUS_CFG[etapa.status]

            return (
              <Fragment key={etapa.id}>
                {/* ── Data row ──────────────────────────────────── */}
                <tr
                  className={`border-b hover:bg-muted/20 group cursor-pointer transition-colors ${
                    selection.isSelected(etapa.id) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => toggleExpand(etapa.id)}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-2" onClick={e => { e.stopPropagation(); selection.toggle(etapa.id) }}>
                    <input
                      type="checkbox"
                      checked={selection.isSelected(etapa.id)}
                      onChange={() => selection.toggle(etapa.id)}
                      className="h-3 w-3 rounded accent-primary cursor-pointer"
                    />
                  </td>

                  {/* Expand */}
                  <td className="px-2 py-2 text-center">
                    {exp
                      ? <ChevronDown  className="h-3 w-3 text-muted-foreground" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </td>

                  {/* Código */}
                  <td className="px-2 py-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{etapa.codigo}</span>
                  </td>

                  {/* Nome (inline edit) */}
                  <td
                    className="px-2 py-2 max-w-0"
                    onClick={e => { e.stopPropagation(); if (editingNameId !== etapa.id) startNameEdit(etapa) }}
                  >
                    {editingNameId === etapa.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveName(etapa.id); if (e.key === 'Escape') setEditingNameId(null) }}
                          className="flex-1 border rounded px-1.5 py-0.5 text-xs bg-background min-w-0"
                          autoFocus
                        />
                        <button onClick={() => saveName(etapa.id)} className="rounded p-0.5 bg-primary text-primary-foreground shrink-0"><Check className="h-3 w-3" /></button>
                        <button onClick={() => setEditingNameId(null)} className="rounded p-0.5 hover:bg-muted shrink-0"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <span className="font-semibold truncate block">{etapa.nome}</span>
                    )}
                  </td>

                  {/* Status (inline edit) */}
                  <td
                    className="px-2 py-2 text-center"
                    onClick={e => { e.stopPropagation(); setEditingStatusId(editingStatusId === etapa.id ? null : etapa.id) }}
                  >
                    {editingStatusId === etapa.id ? (
                      <select
                        value={etapa.status}
                        onChange={e => handleStatusChange(etapa.id, e.target.value as StatusKey)}
                        className="text-[10px] border rounded bg-background px-1 py-0.5"
                        autoFocus
                        onBlur={() => setEditingStatusId(null)}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    )}
                  </td>

                  {/* Casas (inline edit) */}
                  <td
                    className="px-2 py-2 text-center"
                    onClick={e => { e.stopPropagation(); startCasasEdit(etapa) }}
                  >
                    {editingCasasId === etapa.id ? (
                      <input
                        type="number"
                        value={editingCasas}
                        onChange={e => setEditingCasas(+e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveCasas(etapa.id); if (e.key === 'Escape') setEditingCasasId(null) }}
                        onBlur={() => saveCasas(etapa.id)}
                        className="w-10 border rounded px-1 py-0.5 text-center text-[10px] bg-background"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{etapa.casas_total}</span>
                    )}
                  </td>

                  {/* Receita CEF */}
                  <td className="px-2 py-2 text-right">
                    {receita > 0
                      ? <span className="font-semibold text-blue-600">{formatCurrency(receita)}</span>
                      : <span className="text-muted-foreground/30 text-[9px]">—</span>}
                  </td>

                  {/* Planejado */}
                  <td className="px-2 py-2 text-right">
                    <span className="font-semibold">{formatCurrency(orcado)}</span>
                  </td>

                  {/* Consumido */}
                  <td className="px-2 py-2 text-right">
                    {consumido > 0
                      ? <span className="font-semibold text-amber-600">{formatCurrency(consumido)}</span>
                      : <span className="text-muted-foreground/30 text-[9px]">—</span>}
                  </td>

                  {/* A Pagar */}
                  <td className="px-2 py-2 text-right">
                    {aPagar > 0
                      ? <span className="font-semibold text-orange-600">{formatCurrency(aPagar)}</span>
                      : <span className="text-muted-foreground/30 text-[9px]">—</span>}
                  </td>

                  {/* Pago */}
                  <td className="px-2 py-2 text-right">
                    {pago > 0
                      ? <span className="font-semibold text-emerald-600">{formatCurrency(pago)}</span>
                      : <span className="text-muted-foreground/30 text-[9px]">—</span>}
                  </td>

                  {/* Saldo a consumir */}
                  <td className="px-2 py-2 text-right">
                    <span className={`font-semibold ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(saldo)}
                    </span>
                  </td>

                  {/* Margem */}
                  <td className="px-2 py-2 text-right">
                    {receita > 0 ? (
                      <div>
                        <div className={`font-semibold ${margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(margem)}
                        </div>
                        <div className={`text-[8px] tabular-nums ${margemPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {margemPct.toFixed(1)}%
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30 text-[9px]">—</span>
                    )}
                  </td>

                  {/* Exec bar */}
                  <td className="px-2 py-2">
                    <CostBar orcado={orcado} consumido={consumido} pago={pago} />
                  </td>

                  {/* Ações */}
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(etapa)} className="rounded p-0.5 hover:bg-accent">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => onDelete(etapa.id)} className="rounded p-0.5 hover:bg-red-500/10">
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* ── Expanded detail row ──────────────────────── */}
                {exp && (
                  <tr className="border-b bg-muted/5">
                    <td colSpan={15}>
                      <ExpandedRow
                        etapa={etapa}
                        dists={dists}
                        items={items}
                        pedidosByItem={pedidosByItem}
                        parcelasByPedido={parcelasByPedido}
                        consumidoPorItem={consumidoPorItem}
                        expandedItems={expandedItems}
                        toggleItem={toggleItem}
                        updateEtapa={updateEtapa}
                        createDist={createDist}
                        updateDist={updateDist}
                        deleteDist={deleteDist}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>

        {/* ── Totals footer ───────────────────────────────────────────────────── */}
        <tfoot>
          <tr className="border-t-2 bg-muted/30 font-bold text-xs">
            <td colSpan={3} className="px-2 py-2" />
            <td className="px-2 py-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wide">
              Total ({etapas.length} etapas)
            </td>
            <td colSpan={2} className="px-2 py-2" />

            {/* Receita */}
            <td className="px-2 py-2 text-right text-blue-600">
              {formatCurrency(totals.receita)}
            </td>

            {/* Planejado */}
            <td className="px-2 py-2 text-right">
              {formatCurrency(totals.orcado)}
            </td>

            {/* Consumido */}
            <td className="px-2 py-2 text-right text-amber-600">
              {formatCurrency(totals.consumido)}
            </td>

            {/* A Pagar */}
            <td className="px-2 py-2 text-right text-orange-600">
              {totals.aPagar > 0 ? formatCurrency(totals.aPagar) : <span className="text-muted-foreground/40">—</span>}
            </td>

            {/* Pago */}
            <td className="px-2 py-2 text-right text-emerald-600">
              {formatCurrency(totals.pago)}
            </td>

            {/* Saldo */}
            <td className={`px-2 py-2 text-right ${totals.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totals.saldo)}
            </td>

            {/* Margem */}
            <td className="px-2 py-2 text-right">
              <div className={totals.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {formatCurrency(totals.margem)}
              </div>
              <div className={`text-[8px] tabular-nums font-semibold ${totalMargemPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {totalMargemPct.toFixed(1)}%
              </div>
            </td>

            {/* Exec bar */}
            <td className="px-2 py-2">
              <CostBar orcado={totals.orcado} consumido={totals.consumido} pago={totals.pago} />
            </td>

            <td className="px-2 py-2" />
          </tr>
        </tfoot>
      </table>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-t px-3 py-1.5 text-[9px] text-muted-foreground bg-muted/20">
        <span className="font-semibold uppercase tracking-wider">Exec:</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-blue-500" /> Pago</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-amber-400" /> A Pagar</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-muted border" /> Saldo</span>
        <span className="flex items-center gap-1 ml-2 text-muted-foreground/60">• Saldo = Planejado − Consumido &nbsp;|&nbsp; A Pagar = Consumido − Pago</span>
      </div>
    </div>
  )
}

// ── Expanded row (tabs: Faturamento / Compras) ────────────────────────────────
function ExpandedRow({ etapa, dists, items, pedidosByItem, parcelasByPedido, consumidoPorItem, expandedItems, toggleItem, updateEtapa, createDist, updateDist, deleteDist }: any) {
  const [tab, setTab] = useState<'faturamento' | 'compras'>('faturamento')

  return (
    <div className="relative">
      <div className="flex items-center gap-1 border-b px-4 mt-2">
        <button
          onClick={() => setTab('faturamento')}
          className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'faturamento' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <DollarSign className="h-3.5 w-3.5" /> Faturamento & Cronograma
          {dists.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[9px]">{dists.length}</span>}
        </button>
        <button
          onClick={() => setTab('compras')}
          className={`px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
            tab === 'compras' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="h-3.5 w-3.5" /> Itens de Compra ({items.length})
        </button>
      </div>
      <div className="py-3">
        {tab === 'faturamento' && (
          <FaturamentoCronogramaSection
            etapa={etapa} dists={dists} updateEtapa={updateEtapa}
            createDist={createDist} updateDist={updateDist} deleteDist={deleteDist}
          />
        )}
        {tab === 'compras' && (
          <ItemCompraSection
            etapaId={etapa.id} items={items} dists={dists}
            casasTotal={etapa.casas_total} pedidosByItem={pedidosByItem}
            parcelasByPedido={parcelasByPedido} consumidoPorItem={consumidoPorItem}
            expandedItems={expandedItems} toggleItem={toggleItem}
          />
        )}
      </div>
    </div>
  )
}
