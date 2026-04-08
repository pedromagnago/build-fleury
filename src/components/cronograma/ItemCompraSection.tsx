import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight, Package, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useCreateItemCompra, useUpdateItemCompra, useDeleteItemCompra, type ItemCompra, type Pedido } from '@/hooks/useCompras'
import type { Parcela } from '@/hooks/useFinanceiro'
import type { Distribuicao } from '@/hooks/useOperacional'

interface ItemCompraSectionProps {
  etapaId: string
  items: ItemCompra[]
  dists: Distribuicao[]
  casasTotal: number
  pedidosByItem: Map<string, Pedido[]>
  parcelasByPedido: Map<string, Parcela[]>
  expandedItems: Set<string>
  toggleItem: (id: string) => void
}

export default function ItemCompraSection({ etapaId, items, dists, casasTotal, pedidosByItem, parcelasByPedido, expandedItems, toggleItem }: ItemCompraSectionProps) {
  const createItem = useCreateItemCompra()
  const updateItem = useUpdateItemCompra()
  const deleteItem = useDeleteItemCompra()
  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState({ descricao: '', tipo: 'MATERIAL' as ItemCompra['tipo'], quantidade: 0, isGlobal: false, unidade: '', custo_unitario_orcado: 0 })

  const handleCreate = async () => {
    if (!newForm.descricao.trim()) return
    const qtdTotal = newForm.isGlobal ? newForm.quantidade : newForm.quantidade * casasTotal
    const total = qtdTotal * newForm.custo_unitario_orcado
    
    await createItem.mutateAsync({
      etapa_id: etapaId,
      descricao: newForm.descricao,
      tipo: newForm.tipo,
      codigo: `ITEM-${Date.now().toString(36).toUpperCase()}`,
      qtd_por_casa: newForm.isGlobal ? null : (newForm.quantidade || null),
      unidade: newForm.unidade || null,
      qtd_total: qtdTotal > 0 ? qtdTotal : null,
      custo_unitario_orcado: newForm.custo_unitario_orcado || 0,
      valor_total_orcado: total,
      valor_consumido: 0,
    })
    setAdding(false)
    setNewForm({ descricao: '', tipo: 'MATERIAL', quantidade: 0, isGlobal: false, unidade: '', custo_unitario_orcado: 0 })
  }

  const getNewQtdTotal = () => newForm.isGlobal ? newForm.quantidade : newForm.quantidade * casasTotal
  const totalNew = getNewQtdTotal() * newForm.custo_unitario_orcado

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
          <Package className="h-3 w-3" /> Itens de Compra ({items.length})
          <span className="font-normal ml-1 normal-case text-muted-foreground/60">— valores unitários por casa × {casasTotal} casas</span>
        </p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5">
            <Plus className="h-3 w-3" /> Novo Item
          </button>
        )}
      </div>

      {items.length === 0 && !adding ? (
        <div className="text-center py-4">
          <Package className="h-6 w-6 text-muted-foreground/20 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground/50 italic">Nenhum item cadastrado</p>
          <button onClick={() => setAdding(true)} className="text-[10px] text-primary hover:underline mt-1">+ Criar primeiro item</button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium w-6" />
                <th className="px-2 py-1.5 text-left font-medium">Descrição</th>
                <th className="px-2 py-1.5 text-center font-medium">Tipo</th>
                <th className="px-2 py-1.5 text-center font-medium">Qtd Base</th>
                <th className="px-2 py-1.5 text-center font-medium">Unid.</th>
                <th className="px-2 py-1.5 text-right font-medium">Custo Unit.</th>
                <th className="px-2 py-1.5 text-center font-medium">Qtd Total</th>
                <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
                <th className="px-2 py-1.5 text-center font-medium">Pagamento</th>
                <th className="px-2 py-1.5 text-right font-medium">Orçado Total</th>
                <th className="px-2 py-1.5 text-right font-medium">Consumido</th>
                <th className="px-2 py-1.5 text-right font-medium">Saldo</th>
                <th className="px-2 py-1.5 text-center font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const iExp = expandedItems.has(item.id)
                const iPeds = pedidosByItem.get(item.id) ?? []
                let iCon = 0
                let iPago = 0
                iPeds.forEach(p => {
                  iCon += (p.valor_total_real || 0)
                  const parcs = parcelasByPedido.get(p.id) ?? []
                  parcs.forEach(parc => iPago += (parc.valor_pago || 0))
                })
                const iSaldo = (item.valor_total_orcado ?? 0) - iCon
                const iPct = item.valor_total_orcado > 0 ? (iCon / item.valor_total_orcado) * 100 : 0
                return (
                  <ItemRow key={item.id} item={item} expanded={iExp} toggle={() => toggleItem(item.id)} pedidos={iPeds} parcelasByPedido={parcelasByPedido} consumido={iCon} saldo={iSaldo} pct={iPct} pago={iPago} updateItem={updateItem} deleteItem={deleteItem} dists={dists} casasTotal={casasTotal} />
                )
              })}
              {adding && (
                <tr className="bg-primary/5 border-t">
                  <td className="px-2 py-1" />
                  <td className="px-1 py-1">
                    <input value={newForm.descricao} onChange={e => setNewForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição do item..." className="w-full border rounded px-1.5 py-0.5 text-[11px] bg-background" autoFocus />
                  </td>
                  <td className="px-1 py-1">
                    <select value={newForm.tipo} onChange={e => setNewForm(p => ({ ...p, tipo: e.target.value as ItemCompra['tipo'] }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background">
                      <option value="MATERIAL">Material</option>
                      <option value="MAO_DE_OBRA">M. Obra</option>
                      <option value="EQUIPAMENTO">Equip.</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <div className="flex flex-col gap-0.5 justify-center items-center">
                      <input type="number" step="0.01" value={newForm.quantidade || ''} onChange={e => setNewForm(p => ({ ...p, quantidade: +e.target.value }))} placeholder="0" className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" />
                      <label className="text-[8px] flex items-center gap-1 cursor-pointer whitespace-nowrap text-muted-foreground justify-center relative -bottom-1">
                        <input type="checkbox" checked={newForm.isGlobal} onChange={e => setNewForm(p => ({ ...p, isGlobal: e.target.checked }))} className="h-2 w-2 m-0 align-middle" /> Fixo
                      </label>
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <input value={newForm.unidade} onChange={e => setNewForm(p => ({ ...p, unidade: e.target.value }))} placeholder="m³" className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" value={newForm.custo_unitario_orcado || ''} onChange={e => setNewForm(p => ({ ...p, custo_unitario_orcado: +e.target.value }))} placeholder="0.00" className="w-full border rounded px-1 py-0.5 text-right text-[11px] bg-background" />
                  </td>
                  <td className="px-2 py-1 text-center text-[10px] text-muted-foreground">
                    {getNewQtdTotal() > 0 ? getNewQtdTotal().toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-2 py-1 text-left text-muted-foreground">—</td>
                  <td className="px-2 py-1 text-center text-muted-foreground">—</td>
                  <td className="px-2 py-1 text-right text-[10px] font-bold">
                    {totalNew > 0 ? formatCurrency(totalNew) : '—'}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">—</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">—</td>
                  <td className="px-1 py-1">
                    <div className="flex gap-0.5 justify-center">
                      <button onClick={handleCreate} disabled={!newForm.descricao.trim()} className="rounded p-0.5 bg-primary text-primary-foreground disabled:opacity-50"><Save className="h-3 w-3" /></button>
                      <button onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Item Row ──────────────────────────────────────────────────
function ItemRow({ item, expanded, toggle, pedidos, parcelasByPedido, consumido, saldo, pct, pago: _pago, updateItem, deleteItem, dists, casasTotal }: {
  item: ItemCompra; expanded: boolean; toggle: () => void; pedidos: Pedido[]; parcelasByPedido: Map<string, Parcela[]>; consumido: number; saldo: number; pct: number; pago: number;
  updateItem: ReturnType<typeof useUpdateItemCompra>; deleteItem: ReturnType<typeof useDeleteItemCompra>; dists: Distribuicao[]; casasTotal: number
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    descricao: item.descricao,
    quantidade: item.qtd_por_casa || item.qtd_total || 0,
    isGlobal: !item.qtd_por_casa && item.qtd_total !== null,
    custo_unitario_orcado: item.custo_unitario_orcado ?? 0,
    cond_pagamento: item.cond_pagamento || '',
  })

  const getFormQtdTotal = () => form.isGlobal ? form.quantidade : form.quantidade * casasTotal
  const formTotal = getFormQtdTotal() * form.custo_unitario_orcado

  const saveItem = () => {
    const qtdTotal = getFormQtdTotal()
    updateItem.mutate({
      id: item.id,
      descricao: form.descricao,
      qtd_por_casa: form.isGlobal ? null : (form.quantidade || null),
      custo_unitario_orcado: form.custo_unitario_orcado,
      qtd_total: qtdTotal > 0 ? qtdTotal : null,
      valor_total_orcado: formTotal > 0 ? formTotal : item.valor_total_orcado,
      cond_pagamento: form.cond_pagamento || null,
    })
    setEditing(false)
  }

  const tipoLabel = item.tipo === 'MATERIAL' ? 'Material' : item.tipo === 'MAO_DE_OBRA' ? 'M. Obra' : 'Equip.'
  const tipoColor = item.tipo === 'MATERIAL' ? 'text-blue-600 bg-blue-50' : item.tipo === 'MAO_DE_OBRA' ? 'text-purple-600 bg-purple-50' : 'text-orange-600 bg-orange-50'
  const qtdPorCasa = item.qtd_por_casa ?? 0
  const custoUnit = item.custo_unitario_orcado ?? 0
  const unidade = item.unidade ?? ''
  const qtdTotal = item.qtd_total ?? (qtdPorCasa > 0 && casasTotal ? qtdPorCasa * casasTotal : 0)
  const hasExpandContent = pedidos.length > 0 || (qtdPorCasa > 0 && dists.length > 0)

  return (
    <>
      <tr className="border-t hover:bg-muted/20 group cursor-pointer" onClick={toggle}>
        <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
          {hasExpandContent && (expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
        </td>
        {editing ? (
          <>
            <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
              <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className="w-full border rounded px-1.5 py-0.5 text-[11px] bg-background" />
            </td>
            <td />
            <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
              <div className="flex flex-col gap-0.5 justify-center items-center">
                <input type="number" step="0.01" value={form.quantidade || ''} onChange={e => setForm(p => ({ ...p, quantidade: +e.target.value }))} className="w-14 border rounded px-1 py-0.5 text-center text-[11px] bg-background mx-auto" />
                <label className="text-[8px] flex items-center gap-1 cursor-pointer whitespace-nowrap text-muted-foreground justify-center relative -bottom-1">
                  <input type="checkbox" checked={form.isGlobal} onChange={e => setForm(p => ({ ...p, isGlobal: e.target.checked }))} className="h-2 w-2 m-0 align-middle" /> Fixo
                </label>
              </div>
            </td>
            <td />
            <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
              <input type="number" step="0.01" value={form.custo_unitario_orcado || ''} onChange={e => setForm(p => ({ ...p, custo_unitario_orcado: +e.target.value }))} className="w-20 border rounded px-1 py-0.5 text-right text-[11px] bg-background" />
            </td>
            <td className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">
              {getFormQtdTotal() > 0 ? getFormQtdTotal().toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}
            </td>
            <td className="px-2 py-1.5 text-left text-[10px] text-muted-foreground truncate max-w-[120px]">{item.fornecedor_nome || '—'}</td>
            <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
              <input value={form.cond_pagamento} onChange={e => setForm(p => ({ ...p, cond_pagamento: e.target.value }))} className="w-20 border rounded px-1 py-0.5 text-center text-[10px] bg-background" placeholder="28/56/84" />
            </td>
            <td className="px-2 py-1.5 text-right font-bold text-[10px]">{formTotal > 0 ? formatCurrency(formTotal) : formatCurrency(item.valor_total_orcado)}</td>
            <td className="px-2 py-1.5 text-right text-amber-600">{formatCurrency(consumido)}</td>
            <td className="px-2 py-1.5 text-right">{formatCurrency(saldo)}</td>
            <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
              <div className="flex gap-0.5 justify-center">
                <button onClick={saveItem} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
                <button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
              </div>
            </td>
          </>
        ) : (
          <>
            <td className="px-2 py-1.5 font-medium truncate max-w-[200px]" title={item.descricao}>{item.descricao}</td>
            <td className="px-2 py-1.5 text-center"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${tipoColor}`}>{tipoLabel}</span></td>
            <td className="px-2 py-1.5 text-center text-[10px]">
              {!item.qtd_por_casa && item.qtd_total !== null ? (
                <span className="text-muted-foreground italic text-[9px]">Global</span>
              ) : (
                qtdPorCasa > 0 ? qtdPorCasa : '—'
              )}
            </td>
            <td className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{unidade || '—'}</td>
            <td className="px-2 py-1.5 text-right text-[10px] font-medium">{custoUnit > 0 ? formatCurrency(custoUnit) : '—'}</td>
            <td className="px-2 py-1.5 text-center text-[10px]">
              {qtdPorCasa > 0 && casasTotal ? (
                <span>
                  <span className="text-muted-foreground">{casasTotal}×{qtdPorCasa}=</span>
                  <span className="font-semibold">{qtdTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                </span>
              ) : qtdTotal > 0 ? (
                <span className="font-semibold text-blue-600 px-1.5 py-0.5 rounded bg-blue-50/50">{qtdTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
              ) : '—'}
            </td>
            <td className="px-2 py-1.5 text-left text-[10px] truncate max-w-[120px]" title={item.fornecedor_nome}>{item.fornecedor_nome || '—'}</td>
            <td className="px-2 py-1.5 text-center text-[10px] font-mono text-muted-foreground">{item.cond_pagamento || '—'}</td>
            <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(item.valor_total_orcado)}</td>
            <td className="px-2 py-1.5 text-right text-amber-600">{formatCurrency(consumido)}</td>
            <td className={`px-2 py-1.5 text-right ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(saldo)}</td>
            <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-0.5 justify-center">
                <span className="text-[9px]">{pct.toFixed(0)}%</span>
                <button onClick={() => { setForm({ descricao: item.descricao, quantidade: item.qtd_por_casa || item.qtd_total || 0, isGlobal: !item.qtd_por_casa && item.qtd_total !== null, custo_unitario_orcado: item.custo_unitario_orcado ?? 0, cond_pagamento: item.cond_pagamento || '' }); setEditing(true) }} className="rounded p-0.5 hover:bg-accent opacity-0 group-hover:opacity-100"><Pencil className="h-2.5 w-2.5 text-muted-foreground" /></button>
                <button onClick={() => { if (window.confirm(`Excluir "${item.descricao}"?`)) deleteItem.mutate(item.id) }} className="rounded p-0.5 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"><Trash2 className="h-2.5 w-2.5 text-red-500" /></button>
              </div>
            </td>
          </>
        )}
      </tr>
      {/* Distribution breakdown per measurement */}
      {expanded && qtdPorCasa > 0 && dists.length > 0 && (
        <tr className="bg-blue-50/30 dark:bg-blue-950/10 border-t">
          <td />
          <td colSpan={11} className="px-2 py-2 pl-6">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Memória de Cálculo — {item.descricao} ({qtdPorCasa} {unidade}/casa × {formatCurrency(custoUnit)}/{unidade})
            </p>
            <div className="grid grid-cols-1 gap-1">
              {[...dists].sort((a, b) => a.medicao_numero - b.medicao_numero).map(d => {
                const qtdMed = d.casas_planejadas * qtdPorCasa
                const custoMed = qtdMed * custoUnit
                return (
                  <div key={d.id} className="flex items-center gap-3 text-[10px] py-0.5">
                    <span className="font-semibold text-blue-600 w-8">M{d.medicao_numero}</span>
                    <span className="text-muted-foreground">{d.casas_planejadas} casas × {qtdPorCasa} {unidade} =</span>
                    <span className="font-bold">{qtdMed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}</span>
                    <span className="text-muted-foreground">× {formatCurrency(custoUnit)} =</span>
                    <span className="font-semibold text-amber-600">{formatCurrency(custoMed)}</span>
                  </div>
                )
              })}
              <div className="flex items-center gap-3 text-[10px] py-0.5 border-t border-dashed mt-1 pt-1">
                <span className="font-bold w-8">Total</span>
                <span className="text-muted-foreground">{casasTotal} casas × {qtdPorCasa} {unidade} =</span>
                <span className="font-bold">{qtdTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}</span>
                <span className="text-muted-foreground">× {formatCurrency(custoUnit)} =</span>
                <span className="font-bold text-amber-600">{formatCurrency(qtdTotal * custoUnit)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {/* Pedidos expand */}
      {expanded && pedidos.map(ped => {
        const parcs = parcelasByPedido.get(ped.id) ?? []
        const stColor = ped.status === 'entregue' ? 'text-emerald-600' : ped.status === 'confirmado' ? 'text-blue-600' : ped.status === 'cancelado' ? 'text-red-400' : 'text-muted-foreground'
        return (
          <tr key={ped.id} className="bg-muted/10 border-t text-[10px]">
            <td />
            <td colSpan={7} className="px-2 py-1 pl-6">
              <span className="font-medium">Pedido #{ped.numero_pedido}</span> — <span className="text-muted-foreground">{ped.fornecedor_nome || 'S/ Forn.'}</span>
              {ped.casas_lote && <span className="text-muted-foreground ml-2">({ped.casas_lote} casas)</span>}
              <span className={`ml-2 ${stColor} font-semibold`}>{ped.status}</span>
            </td>
            <td className="px-2 py-1 text-right font-medium">{formatCurrency(ped.valor_total_real ?? 0)}</td>
            <td colSpan={3} className="px-2 py-1">
              <div className="flex gap-2 flex-wrap">
                {parcs.map(p => (
                  <span key={p.id} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] ${p.status === 'paga' ? 'bg-emerald-50 text-emerald-700' : p.status === 'vencida' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    P{p.numero_parcela}: {formatCurrency(p.valor)}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
