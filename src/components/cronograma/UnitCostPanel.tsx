import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProject } from '@/contexts/ProjectContext'
import { useEtapas, type Etapa } from '@/hooks/useEtapas'
import { useItensCompra, useFornecedores, useCreateItemCompra, type ItemCompra } from '@/hooks/useCompras'
import { formatCurrency } from '@/lib/utils'
import { exportToExcel } from '@/lib/exportExcel'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Home, TrendingUp, TrendingDown, DollarSign, Layers,
  Plus, Check, X, Landmark, ShieldAlert, Search, Filter,
  Download, Trash2, ChevronDown, ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
function parseBRL(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
}
function toBRLInput(v: number): string {
  if (!v && v !== 0) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  MATERIAL:     { label: 'Mat',  cls: 'bg-blue-500/10 text-blue-600' },
  MAO_DE_OBRA:  { label: 'MO',   cls: 'bg-amber-500/10 text-amber-600' },
  EQUIPAMENTO:  { label: 'Eqp',  cls: 'bg-slate-500/10 text-slate-600' },
}

const INPUT = 'w-full rounded-md border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary tabular-nums'

// ---------------------------------------------------------------------------
export default function UnitCostPanel() {
  const { currentCompany } = useProject()
  const { data: etapas = [] } = useEtapas()
  const { data: itens = [] } = useItensCompra()
  const { data: fornecedores = [] } = useFornecedores()
  const createItem = useCreateItemCompra()
  const qc = useQueryClient()

  const qtdCasas = currentCompany?.qtd_casas ?? 0
  const faturamentoContrato = currentCompany?.faturamento_contrato ?? 0
  const custoIndireto = currentCompany?.custo_indireto ?? 0
  const custoCapital = currentCompany?.custo_capital ?? 0

  // State
  const [editingItem, setEditingItem] = useState<{ id: string; field: 'qtd' | 'custo_unitario_orcado'; value: string } | null>(null)
  const [showNewRow, setShowNewRow] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({ descricao: '', tipo: 'MATERIAL', unidade: '', qtd_por_casa: '', isGlobal: false, custo_unitario_orcado: '', fornecedor_id: '', cond_pagamento: '' })

  // Filters
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('all')
  const [etapaFilter, setEtapaFilter] = useState<string>('all')

  // Selection & Collapsibles
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = useCallback((id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const [collapsedEtapas, setCollapsedEtapas] = useState<Set<string>>(new Set())
  const toggleEtapa = useCallback((id: string) => setCollapsedEtapas(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }), [])

  const fornecedorMap = useMemo(() => {
    const m = new Map<string, string>()
    fornecedores.forEach(f => m.set(f.id, f.nome))
    return m
  }, [fornecedores])

  // Filter items
  const filteredItens = useMemo(() => {
    return itens.filter(i => {
      if (search && !i.descricao.toLowerCase().includes(search.toLowerCase()) && !i.codigo.toLowerCase().includes(search.toLowerCase())) return false
      if (tipoFilter !== 'all' && i.tipo !== tipoFilter) return false
      if (etapaFilter !== 'all' && i.etapa_id !== etapaFilter) return false
      return true
    })
  }, [itens, search, tipoFilter, etapaFilter])

  // Build flat rows
  type FlatRow =
    | { type: 'header'; etapa: Etapa; subtotalCasa: number; subtotalTotal: number; itemCount: number; pct: number }
    | { type: 'item'; item: ItemCompra & { fornecedorNome: string; subtotalCasa: number; isGlobal: boolean }; etapa: Etapa }

  const { flatRows, kpis, allItemIds } = useMemo(() => {
    const sorted = [...etapas].sort((a, b) => a.ordem - b.ordem)
    const rows: FlatRow[] = []
    let totalCustoObra = 0
    let totalCustoIndireto = 0
    const ids: string[] = []

    sorted.forEach(etapa => {
      const etapaItens = filteredItens.filter(i => i.etapa_id === etapa.id)
      if (etapaItens.length === 0 && etapaFilter === 'all') return
      if (etapaItens.length === 0) return
      
      let custoTotalEtapa = 0
      const casasDaEtapa = etapa.casas_total ?? qtdCasas

      const itemRows: FlatRow[] = etapaItens.map(item => {
        const isGlobal = !item.qtd_por_casa && item.qtd_total !== null
        const valTotal = item.valor_total_orcado ?? 0
        const subtotalCasa = isGlobal ? (valTotal / casasDaEtapa) : ((item.custo_unitario_orcado ?? 0) * (item.qtd_por_casa ?? 0))
        
        if (isGlobal) totalCustoIndireto += valTotal
        custoTotalEtapa += valTotal
        ids.push(item.id)
        
        return {
          type: 'item' as const,
          item: { ...item, fornecedorNome: item.fornecedor_id ? (fornecedorMap.get(item.fornecedor_id) ?? '—') : '—', subtotalCasa, isGlobal },
          etapa,
        }
      })
      
      totalCustoObra += custoTotalEtapa
      rows.push({ type: 'header', etapa, subtotalTotal: custoTotalEtapa, subtotalCasa: custoTotalEtapa / casasDaEtapa, itemCount: etapaItens.length, pct: 0 })
      
      if (!collapsedEtapas.has(etapa.id)) {
        rows.push(...itemRows)
      }
    })

    rows.forEach(r => { if (r.type === 'header') r.pct = totalCustoObra > 0 ? (r.subtotalTotal / totalCustoObra) * 100 : 0 })

    const custoDiretoGlobal = totalCustoObra - totalCustoIndireto
    const custoDirectoMedia = qtdCasas > 0 ? (custoDiretoGlobal / qtdCasas) : 0
    const totalComIndireto = totalCustoObra + custoCapital
    const margemRS = faturamentoContrato - totalComIndireto
    const margemPct = faturamentoContrato > 0 ? (margemRS / faturamentoContrato) * 100 : 0

    return {
      flatRows: rows,
      kpis: { custoDirecto: custoDirectoMedia, totalProjetado: totalCustoObra, custoIndiretoReal: totalCustoIndireto, totalComIndireto, margemRS, margemPct },
      allItemIds: ids,
    }
  }, [etapas, filteredItens, qtdCasas, faturamentoContrato, custoIndireto, custoCapital, fornecedorMap, etapaFilter, collapsedEtapas])

  const toggleSelectAll = useCallback(() => {
    setSelected(p => p.size === allItemIds.length ? new Set() : new Set(allItemIds))
  }, [allItemIds])

  const activeFilterCount = (search ? 1 : 0) + (tipoFilter !== 'all' ? 1 : 0) + (etapaFilter !== 'all' ? 1 : 0)

  // Inline edit
  const handleInlineSave = async () => {
    if (!editingItem) return
    const item = itens.find(i => i.id === editingItem.id)
    if (!item) return
    const etapa = etapas.find(e => e.id === item.etapa_id)
    const casasTotal = etapa?.casas_total ?? qtdCasas
    const numVal = parseBRL(editingItem.value)
    
    const isGlobal = !item.qtd_por_casa && item.qtd_total !== null

    if (editingItem.field === 'qtd') {
      if (isGlobal) {
        const newValorTotal = numVal * (item.custo_unitario_orcado ?? 0)
        await supabase.from('itens_compra').update({
          qtd_total: numVal, valor_total_orcado: newValorTotal,
        }).eq('id', item.id)
      } else {
        const newQtdTotal = numVal * casasTotal
        const newValorTotal = newQtdTotal * (item.custo_unitario_orcado ?? 0)
        await supabase.from('itens_compra').update({
          qtd_por_casa: numVal, qtd_total: newQtdTotal, valor_total_orcado: newValorTotal,
        }).eq('id', item.id)
      }
    } else {
      const qtdRef = isGlobal ? (item.qtd_total ?? 0) : ((item.qtd_por_casa ?? 0) * casasTotal)
      const newValorTotal = qtdRef * numVal
      await supabase.from('itens_compra').update({
        custo_unitario_orcado: numVal, valor_total_orcado: newValorTotal,
      }).eq('id', item.id)
    }
    setEditingItem(null)
    qc.invalidateQueries({ queryKey: ['itens_compra'] })
    toast.success('Item atualizado')
  }

  // New item
  const handleNewItem = async (etapaId: string) => {
    const etapa = etapas.find(e => e.id === etapaId)
    const casasTotal = etapa?.casas_total ?? qtdCasas
    const baseQtd = parseBRL(newForm.qtd_por_casa)
    const custoUnit = parseBRL(newForm.custo_unitario_orcado)
    const qtdTotal = newForm.isGlobal ? baseQtd : (baseQtd * casasTotal)
    const valorTotal = qtdTotal * custoUnit

    await createItem.mutateAsync({
      codigo: `${etapa?.codigo || 'X'}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      descricao: newForm.descricao, tipo: newForm.tipo, etapa_id: etapaId,
      unidade: newForm.unidade || 'un', 
      qtd_por_casa: newForm.isGlobal ? null : (baseQtd || null),
      qtd_total: qtdTotal > 0 ? qtdTotal : null,
      custo_unitario_orcado: custoUnit, valor_total_orcado: valorTotal,
      fornecedor_id: newForm.fornecedor_id || null, cond_pagamento: newForm.cond_pagamento || null,
    } as any)

    setShowNewRow(null)
    setNewForm({ descricao: '', tipo: 'MATERIAL', unidade: '', qtd_por_casa: '', isGlobal: false, custo_unitario_orcado: '', fornecedor_id: '', cond_pagamento: '' })
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`Excluir ${selected.size} itens de compra permanentemente?`)) return
    const ids = [...selected]
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('itens_compra').delete().in('id', ids.slice(i, i + 50))
    }
    qc.invalidateQueries({ queryKey: ['itens_compra'] })
    toast.success(`${selected.size} itens excluídos`)
    clearSelection()
  }

  const handleBulkExport = () => {
    const selectedItems = itens.filter(i => selected.has(i.id))
    const data = selectedItems.map(i => ({
      Código: i.codigo, Descrição: i.descricao, Tipo: i.tipo, Unidade: i.unidade,
      'Qtd/Casa': i.qtd_por_casa, 'Custo Unit.': i.custo_unitario_orcado,
      'Qtd Total': i.qtd_total, 'Valor Total': i.valor_total_orcado,
      'Cond. Pgto': i.cond_pagamento || '',
      Etapa: etapas.find(e => e.id === i.etapa_id)?.nome ?? '',
      Fornecedor: i.fornecedor_id ? fornecedorMap.get(i.fornecedor_id) ?? '' : '',
    }))
    exportToExcel(data, `custos_${new Date().toISOString().split('T')[0]}`, 'Itens')
    toast.success(`${selected.size} itens exportados`)
  }

  if (qtdCasas === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed">
        <div className="text-center max-w-md">
          <Home className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Configure a quantidade de casas</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Acesse Configurações → Dados da Obra → Qtd. Casas.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <KpiCard label="Custo Direto (1 Casa)" value={formatCurrency(kpis.custoDirecto)} icon={Home} accent="blue" />
        <KpiCard label={`Orçado (${qtdCasas} Casas)`} value={formatCurrency(kpis.totalProjetado)} icon={Layers} accent="amber" />
        <KpiCard label="Custo Indireto" value={formatCurrency(kpis.custoIndiretoReal)} icon={ShieldAlert} />
        <KpiCard label="Custo Capital" value={formatCurrency(custoCapital)} icon={Landmark} />
        <KpiCard label="Custo Total" value={formatCurrency(kpis.totalComIndireto)} icon={DollarSign} accent="amber" />
        <KpiCard label="Faturamento" value={formatCurrency(faturamentoContrato)} icon={TrendingUp} accent="blue" />
        <KpiCard label="Margem" value={`${formatCurrency(kpis.margemRS)} (${kpis.margemPct.toFixed(1)}%)`} icon={kpis.margemRS >= 0 ? TrendingUp : TrendingDown} accent={kpis.margemRS >= 0 ? 'emerald' : 'red'} />
      </div>

      {/* Filters toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar item..." className="h-8 w-48 rounded-lg border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)} className="h-8 rounded-lg border bg-card px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">Todos os tipos</option>
          <option value="MATERIAL">Material</option>
          <option value="MAO_DE_OBRA">Mão de Obra</option>
          <option value="EQUIPAMENTO">Equipamento</option>
        </select>

        <select value={etapaFilter} onChange={e => setEtapaFilter(e.target.value)} className="h-8 rounded-lg border bg-card px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">Todas as etapas</option>
          {[...etapas].sort((a, b) => a.ordem - b.ordem).map(e => (
            <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>
          ))}
        </select>

        {activeFilterCount > 0 && (
          <button onClick={() => { setSearch(''); setTipoFilter('all'); setEtapaFilter('all') }} className="flex items-center gap-1 text-[10px] underline text-muted-foreground">
            <Filter className="h-3 w-3" /> Limpar ({activeFilterCount})
          </button>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground">{filteredItens.length} item(ns)</span>
      </div>

      {/* Flat spreadsheet table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl-bf w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
              <tr className="text-muted-foreground text-[9px] uppercase font-bold border-b">
                <th className="px-2 py-2 w-[28px]">
                  <input type="checkbox" checked={selected.size === allItemIds.length && allItemIds.length > 0} onChange={toggleSelectAll} className="h-3 w-3 rounded accent-primary cursor-pointer" />
                </th>
                <th className="px-2 py-2 text-left w-[60px]">Código</th>
                <th className="px-2 py-2 text-left min-w-[200px]">Descrição</th>
                <th className="px-2 py-2 text-left min-w-[120px]">Fornecedor</th>
                <th className="px-2 py-2 text-center w-[40px]">Tipo</th>
                <th className="px-2 py-2 text-center w-[40px]">Unid</th>
                <th className="px-2 py-2 text-right w-[70px]">Qtd (1 Casa)</th>
                <th className="px-2 py-2 text-right w-[90px]">Custo Unit.</th>
                <th className="px-2 py-2 text-right w-[90px]">Valor (1 Casa)</th>
                <th className="px-2 py-2 text-right w-[70px]">Qtd Obra</th>
                <th className="px-2 py-2 text-right w-[100px]">Orçado Obra</th>
                <th className="px-2 py-2 text-center w-[80px]">Cond. Pgto</th>
                <th className="px-2 py-2 text-right w-[50px]">% Obra</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row) => {
                if (row.type === 'header') {
                  const e = row.etapa
                  const isCollapsed = collapsedEtapas.has(e.id)
                  const IconToggle = isCollapsed ? ChevronRight : ChevronDown
                  return (
                    <tr key={`h-${e.id}`} className="bg-muted/30 border-t-2 border-b group cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleEtapa(e.id)}>
                      <td className="px-2 py-2 text-center">
                        <IconToggle className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] font-bold text-muted-foreground">{e.codigo}</td>
                      <td colSpan={6} className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[11px]">{e.nome}</span>
                          <span className="text-[9px] text-muted-foreground">({row.itemCount} itens)</span>
                          <button
                            onClick={(event) => { event.stopPropagation(); setShowNewRow(e.id); setNewForm({ descricao: '', tipo: 'MATERIAL', unidade: '', qtd_por_casa: '', isGlobal: false, custo_unitario_orcado: '', fornecedor_id: '', cond_pagamento: '' }); setCollapsedEtapas(p => { const n = new Set(p); n.delete(e.id); return n }) }}
                            className="ml-auto flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-primary hover:bg-primary/10"
                          >
                            <Plus className="h-2.5 w-2.5" /> Novo
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-[11px] text-muted-foreground">{formatCurrency(row.subtotalCasa)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{e.casas_total ?? qtdCasas}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-[11px]">{formatCurrency(row.subtotalTotal)}</td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-muted-foreground">{row.pct.toFixed(1)}%</td>
                    </tr>
                  )
                }

                const { item, etapa: _etapa } = row
                const tipoCfg = TIPO_BADGE[item.tipo] ?? TIPO_BADGE['MATERIAL']!
                const isEditingQtd = editingItem?.id === item.id && editingItem.field === 'qtd'
                const isEditingCusto = editingItem?.id === item.id && editingItem.field === 'custo_unitario_orcado'
                const pct = kpis.totalProjetado > 0 ? ((item.valor_total_orcado ?? 0) / kpis.totalProjetado) * 100 : 0
                const isSelected = selected.has(item.id)

                return (
                  <tr key={item.id} className={`border-b hover:bg-muted/5 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="h-3 w-3 rounded accent-primary cursor-pointer" />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground/60">{item.codigo}</td>
                    <td className="px-2 py-1.5 truncate max-w-[200px]" title={item.descricao}>{item.descricao}</td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">{item.fornecedorNome}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${tipoCfg.cls}`}>{tipoCfg.label}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{item.unidade || 'un'}</td>
                    <td className="px-2 py-1.5 text-right">
                      {item.isGlobal ? (
                        <span className="text-muted-foreground italic text-[9px] cursor-not-allowed" title="Item Fixo (Global)">-</span>
                      ) : (
                        isEditingQtd ? (
                          <div className="flex items-center gap-0.5 justify-end">
                            <input autoFocus value={editingItem!.value} onChange={e => setEditingItem({ ...editingItem!, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setEditingItem(null) }} className={`${INPUT} w-14 text-right`} />
                            <button onClick={handleInlineSave} className="rounded p-0.5 hover:bg-emerald-100"><Check className="h-2.5 w-2.5 text-emerald-600" /></button>
                            <button onClick={() => setEditingItem(null)} className="rounded p-0.5 hover:bg-red-100"><X className="h-2.5 w-2.5 text-red-500" /></button>
                          </div>
                        ) : (
                          <span className="cursor-pointer hover:text-primary tabular-nums" onClick={() => setEditingItem({ id: item.id, field: 'qtd', value: toBRLInput(item.qtd_por_casa ?? 0) })}>
                            {toBRLInput(item.qtd_por_casa ?? 0)}
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {isEditingCusto ? (
                        <div className="flex items-center gap-0.5 justify-end">
                          <input autoFocus value={editingItem!.value} onChange={e => setEditingItem({ ...editingItem!, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setEditingItem(null) }} className={`${INPUT} w-16 text-right`} />
                          <button onClick={handleInlineSave} className="rounded p-0.5 hover:bg-emerald-100"><Check className="h-2.5 w-2.5 text-emerald-600" /></button>
                          <button onClick={() => setEditingItem(null)} className="rounded p-0.5 hover:bg-red-100"><X className="h-2.5 w-2.5 text-red-500" /></button>
                        </div>
                      ) : (
                        <span className="cursor-pointer hover:text-primary tabular-nums" onClick={() => setEditingItem({ id: item.id, field: 'custo_unitario_orcado', value: toBRLInput(item.custo_unitario_orcado ?? 0) })}>
                          {formatCurrency(item.custo_unitario_orcado ?? 0)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-muted-foreground">{formatCurrency(item.subtotalCasa)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {item.isGlobal ? (
                        isEditingQtd ? (
                          <div className="flex items-center gap-0.5 justify-end">
                            <input autoFocus value={editingItem!.value} onChange={e => setEditingItem({ ...editingItem!, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setEditingItem(null) }} className={`${INPUT} w-14 text-right`} />
                            <button onClick={handleInlineSave} className="rounded p-0.5 hover:bg-emerald-100"><Check className="h-2.5 w-2.5 text-emerald-600" /></button>
                            <button onClick={() => setEditingItem(null)} className="rounded p-0.5 hover:bg-red-100"><X className="h-2.5 w-2.5 text-red-500" /></button>
                          </div>
                        ) : (
                          <span className="cursor-pointer hover:text-primary tabular-nums" onClick={() => setEditingItem({ id: item.id, field: 'qtd', value: toBRLInput(item.qtd_total ?? 0) })}>
                            {toBRLInput(item.qtd_total ?? 0)}
                          </span>
                        )
                      ) : (
                        toBRLInput(item.qtd_total ?? 0)
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatCurrency(item.valor_total_orcado ?? 0)}</td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground text-[10px]">{item.cond_pagamento || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground/70">{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
              {/* New item row */}
              {showNewRow && (
                <tr className="bg-emerald-50/30 dark:bg-emerald-950/10 border-b animate-in fade-in slide-in-from-top-1">
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground/40">auto</td>
                  <td className="px-2 py-1.5"><input placeholder="Descrição *" value={newForm.descricao} onChange={e => setNewForm({ ...newForm, descricao: e.target.value })} className={INPUT} autoFocus /></td>
                  <td className="px-2 py-1.5">
                    <select value={newForm.fornecedor_id} onChange={e => setNewForm({ ...newForm, fornecedor_id: e.target.value })} className={INPUT}>
                      <option value="">—</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={newForm.tipo} onChange={e => setNewForm({ ...newForm, tipo: e.target.value })} className={`${INPUT} text-[9px]`}>
                      <option value="MATERIAL">Mat</option>
                      <option value="MAO_DE_OBRA">MO</option>
                      <option value="EQUIPAMENTO">Eqp</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input placeholder="un" value={newForm.unidade} onChange={e => setNewForm({ ...newForm, unidade: e.target.value })} className={`${INPUT} w-10 text-center`} /></td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex flex-col gap-0.5 justify-center items-center">
                      <input placeholder="0" value={newForm.qtd_por_casa} onChange={e => setNewForm({ ...newForm, qtd_por_casa: e.target.value })} className={`${INPUT} w-14 text-right mx-auto`} />
                      <label className="text-[8px] flex items-center gap-1 cursor-pointer whitespace-nowrap text-muted-foreground justify-center relative -bottom-1">
                        <input type="checkbox" checked={newForm.isGlobal} onChange={e => setNewForm(p => ({ ...p, isGlobal: e.target.checked }))} className="h-2 w-2 m-0 align-middle" /> Fixo
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><input placeholder="0,00" value={newForm.custo_unitario_orcado} onChange={e => setNewForm({ ...newForm, custo_unitario_orcado: e.target.value })} className={`${INPUT} w-16 text-right`} /></td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground/50">{!newForm.isGlobal ? formatCurrency(parseBRL(newForm.qtd_por_casa) * parseBRL(newForm.custo_unitario_orcado)) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground/50">{newForm.isGlobal ? newForm.qtd_por_casa : toBRLInput(parseBRL(newForm.qtd_por_casa) * (etapas.find(e => e.id === showNewRow)?.casas_total ?? qtdCasas))}</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {formatCurrency((newForm.isGlobal ? parseBRL(newForm.qtd_por_casa) : (parseBRL(newForm.qtd_por_casa) * (etapas.find(e => e.id === showNewRow)?.casas_total ?? qtdCasas))) * parseBRL(newForm.custo_unitario_orcado))}
                  </td>
                  <td className="px-2 py-1.5"><input placeholder="30/60" value={newForm.cond_pagamento} onChange={e => setNewForm({ ...newForm, cond_pagamento: e.target.value })} className={`${INPUT} w-14 text-center`} /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => handleNewItem(showNewRow)} disabled={!newForm.descricao} className="rounded p-1 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-30"><Check className="h-3 w-3" /></button>
                      <button onClick={() => setShowNewRow(null)} className="rounded p-1 hover:bg-red-100"><X className="h-3 w-3 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-muted/30 border-t-2">
              <tr className="font-bold text-xs">
                <td className="px-2 py-2.5"></td>
                <td colSpan={7} className="px-2 py-2.5">TOTAL GERAL OBRA</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(kpis.custoDirecto)}</td>
                <td className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(kpis.totalProjetado)}</td>
                <td className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <span className="text-sm font-semibold text-primary">{selected.size} item(ns)</span>
            <div className="h-5 w-px bg-border" />
            <button onClick={handleBulkExport} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Exportar
            </button>
            <button onClick={handleBulkDelete} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <div className="h-5 w-px bg-border" />
            <button onClick={clearSelection} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon?: typeof Home; accent?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : accent === 'blue' ? 'text-blue-500' : ''
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`h-3.5 w-3.5 ${c || 'text-muted-foreground'}`} />}
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`text-sm font-bold ${c}`}>{value}</p>
    </div>
  )
}
