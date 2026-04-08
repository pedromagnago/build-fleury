import { useState, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEtapas } from '@/hooks/useEtapas'
import {
  useMedicoes, useCreateMedicao,
  useDistribuicao, useCreateDistribuicao,
  type Distribuicao,
} from '@/hooks/useOperacional'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { exportToExcel } from '@/lib/exportExcel'
import { toast } from 'sonner'
import {
  ClipboardCheck, Plus, X, Check, AlertTriangle,
  Search, Download, Trash2,
} from 'lucide-react'

const STATUS_COLORS: Record<string, { label: string; cls: string }> = {
  futura:     { label: 'Futura',     cls: 'bg-slate-500/10 text-slate-500' },
  em_medicao: { label: 'Em Medição', cls: 'bg-blue-500/10 text-blue-600' },
  liberada:   { label: 'Liberada',   cls: 'bg-emerald-500/10 text-emerald-600' },
  paga:       { label: 'Paga',       cls: 'bg-amber-500/10 text-amber-600' },
}

const INPUT = 'w-full rounded-md border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary tabular-nums'

export default function MedicoesPanel() {
  const { data: etapas = [] } = useEtapas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: distribuicoes = [] } = useDistribuicao()
  const createMedicao = useCreateMedicao()
  const createDist = useCreateDistribuicao()
  const qc = useQueryClient()

  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ numero: '', data_prevista: '', data_inicio: '', data_fim: '' })
  const [editingCell, setEditingCell] = useState<{ distId: string; value: string } | null>(null)
  const [search, setSearch] = useState('')

  // Selection (row = etapa_id)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = useCallback((id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const sortedEtapas = useMemo(() => [...etapas].sort((a, b) => a.ordem - b.ordem), [etapas])
  const sortedMedicoes = useMemo(() => [...medicoes].sort((a, b) => a.numero - b.numero), [medicoes])

  // Filter etapas by search
  const filteredEtapas = useMemo(() => {
    if (!search) return sortedEtapas
    const q = search.toLowerCase()
    return sortedEtapas.filter(e => e.nome.toLowerCase().includes(q) || e.codigo.toLowerCase().includes(q))
  }, [sortedEtapas, search])

  const distMatrix = useMemo(() => {
    const m = new Map<string, Map<number, Distribuicao>>()
    distribuicoes.forEach(d => {
      if (!m.has(d.etapa_id)) m.set(d.etapa_id, new Map())
      m.get(d.etapa_id)!.set(d.medicao_numero, d)
    })
    return m
  }, [distribuicoes])

  const acumulado = useMemo(() => {
    const m = new Map<string, { casas: number; valor: number }>()
    distribuicoes.forEach(d => {
      const prev = m.get(d.etapa_id) ?? { casas: 0, valor: 0 }
      prev.casas += d.casas_realizadas ?? 0
      prev.valor += Number(d.valor_liberado_faturamento ?? 0)
      m.set(d.etapa_id, prev)
    })
    return m
  }, [distribuicoes])

  const medTotals = useMemo(() => {
    const m = new Map<number, { casas: number; valor: number }>()
    distribuicoes.forEach(d => {
      const prev = m.get(d.medicao_numero) ?? { casas: 0, valor: 0 }
      prev.casas += d.casas_planejadas ?? 0
      prev.valor += Number(d.valor_liberado_faturamento ?? 0)
      m.set(d.medicao_numero, prev)
    })
    return m
  }, [distribuicoes])

  const kpis = useMemo(() => {
    const totalReceita = distribuicoes.reduce((s, d) => s + Number(d.valor_liberado_faturamento ?? 0), 0)
    const totalAcumCasas = distribuicoes.reduce((s, d) => s + (d.casas_realizadas ?? 0), 0)
    const totalPlanCasas = distribuicoes.reduce((s, d) => s + (d.casas_planejadas ?? 0), 0)
    const pctFisico = totalPlanCasas > 0 ? (totalAcumCasas / totalPlanCasas) * 100 : 0
    return { totalMedicoes: sortedMedicoes.length, totalReceita, totalAcumCasas, pctFisico }
  }, [distribuicoes, sortedMedicoes])

  const nextNum = useMemo(() => {
    const nums = medicoes.map(m => m.numero)
    return nums.length > 0 ? Math.max(...nums) + 1 : 1
  }, [medicoes])

  const toggleSelectAll = useCallback(() => {
    setSelected(p => p.size === filteredEtapas.length ? new Set() : new Set(filteredEtapas.map(e => e.id)))
  }, [filteredEtapas])

  const handleCreateMedicao = async () => {
    const numero = parseInt(newForm.numero) || nextNum
    if (medicoes.some(m => m.numero === numero)) {
      toast.error(`Medição nº ${numero} já existe`)
      return
    }
    try {
      await createMedicao.mutateAsync({
        numero,
        data_prevista: newForm.data_prevista || new Date().toISOString().split('T')[0],
        valor_planejado: 0,
        percentual_fisico_meta: 0,
        status: 'futura' as any,
      })

      for (const etapa of sortedEtapas) {
        await createDist.mutateAsync({
          etapa_id: etapa.id,
          medicao_numero: numero,
          casas_planejadas: 0,
          casas_realizadas: 0,
          data_inicio: newForm.data_inicio || null,
          data_fim: newForm.data_fim || null,
          valor_liberado_faturamento: 0,
        } as any)
      }

      toast.success(`Medição nº ${numero} criada com ${sortedEtapas.length} distribuições`)
      setShowNewModal(false)
      setNewForm({ numero: '', data_prevista: '', data_inicio: '', data_fim: '' })
    } catch (err: any) {
      toast.error('Erro ao criar medição: ' + (err?.message || ''))
    }
  }

  const handleSaveCasas = async () => {
    if (!editingCell) return
    const dist = distribuicoes.find(d => d.id === editingCell.distId)
    if (!dist) return
    const etapa = etapas.find(e => e.id === dist.etapa_id)
    const pu = etapa?.faturamento_preco_unitario ?? 0
    const newCasas = parseInt(editingCell.value) || 0
    const newValor = newCasas * pu

    await supabase.from('cronograma_distribuicao').update({
      casas_planejadas: newCasas,
      valor_liberado_faturamento: newValor,
    }).eq('id', dist.id)

    setEditingCell(null)
    qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
    toast.success('Distribuição atualizada')
  }

  // Bulk actions
  const handleBulkExport = () => {
    const rows: any[] = []
    selected.forEach(etapaId => {
      const etapa = etapas.find(e => e.id === etapaId)
      if (!etapa) return
      sortedMedicoes.forEach(med => {
        const dist = distMatrix.get(etapaId)?.get(med.numero)
        rows.push({
          Código: etapa.codigo, Etapa: etapa.nome, Medição: med.numero,
          'Casas Plan.': dist?.casas_planejadas ?? 0,
          'Casas Real.': dist?.casas_realizadas ?? 0,
          Receita: Number(dist?.valor_liberado_faturamento ?? 0),
        })
      })
    })
    exportToExcel(rows, `medicoes_${new Date().toISOString().split('T')[0]}`, 'Medições')
    toast.success(`${selected.size} etapas exportadas`)
  }

  const handleBulkZero = async () => {
    if (!window.confirm(`Zerar todas as distribuições de ${selected.size} etapas?`)) return
    const affectedDists = distribuicoes.filter(d => selected.has(d.etapa_id))
    for (const d of affectedDists) {
      await supabase.from('cronograma_distribuicao').update({
        casas_planejadas: 0, valor_liberado_faturamento: 0,
      }).eq('id', d.id)
    }
    qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
    toast.success(`${affectedDists.length} distribuições zeradas`)
    clearSelection()
  }

  const handleBulkDeleteDist = async () => {
    if (!window.confirm(`Excluir TODAS as distribuições de ${selected.size} etapas?`)) return
    const ids = distribuicoes.filter(d => selected.has(d.etapa_id)).map(d => d.id)
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('cronograma_distribuicao').delete().in('id', ids.slice(i, i + 50))
    }
    qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
    toast.success(`${ids.length} distribuições excluídas`)
    clearSelection()
  }

  if (sortedMedicoes.length === 0 && distribuicoes.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed">
          <div className="text-center max-w-md">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma medição cadastrada</p>
            <p className="text-xs text-muted-foreground/60 mt-1 mb-4">Importe via planilha WBS ou crie manualmente.</p>
            <button onClick={() => { setNewForm({ numero: String(nextNum), data_prevista: '', data_inicio: '', data_fim: '' }); setShowNewModal(true) }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Nova Medição
            </button>
          </div>
        </div>
        {showNewModal && <NewMedModal form={newForm} onChange={setNewForm} onSubmit={handleCreateMedicao} onClose={() => setShowNewModal(false)} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="Medições" value={String(kpis.totalMedicoes)} icon={ClipboardCheck} />
        <KpiCard label="Receita Total Plan." value={formatCurrency(kpis.totalReceita)} accent="blue" />
        <KpiCard label="Casas Realizadas" value={String(kpis.totalAcumCasas)} accent="emerald" />
        <KpiCard label="% Físico" value={`${kpis.pctFisico.toFixed(1)}%`} accent="amber" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etapa..." className="h-8 w-48 rounded-lg border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <span className="text-xs text-muted-foreground">{filteredEtapas.length} etapas × {sortedMedicoes.length} medições</span>

        <button onClick={() => { setNewForm({ numero: String(nextNum), data_prevista: '', data_inicio: '', data_fim: '' }); setShowNewModal(true) }} className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Nova Medição
        </button>
      </div>

      {/* Matrix Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse min-w-max">
            <thead className="sticky top-0 z-30 bg-muted/80 backdrop-blur">
              {/* Header row 1 */}
              <tr className="border-b">
                <th className="sticky left-0 z-40 bg-muted/90 px-2 py-2 w-[28px]">
                  <input type="checkbox" checked={selected.size === filteredEtapas.length && filteredEtapas.length > 0} onChange={toggleSelectAll} className="h-3 w-3 rounded accent-primary cursor-pointer" />
                </th>
                <th colSpan={5} className="sticky left-[28px] z-40 bg-muted/90 border-r px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[492px]">
                  Etapas / Serviços
                </th>
                <th colSpan={2} className="border-r px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-emerald-50/50 dark:bg-emerald-950/10">
                  Acumulado
                </th>
                {sortedMedicoes.map(med => {
                  const cfg = STATUS_COLORS[med.status] ?? STATUS_COLORS['futura']!
                  return (
                    <th key={med.id} colSpan={2} className="border-r px-2 py-1.5 text-center min-w-[160px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-[11px]">Med {String(med.numero).padStart(2, '0')}</span>
                        {med.data_prevista && <span className="text-[9px] text-muted-foreground">{fmtDate(med.data_prevista)}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                    </th>
                  )
                })}
                <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[60px]">
                  Resta
                </th>
              </tr>
              {/* Header row 2 */}
              <tr className="border-b text-[9px] uppercase font-bold text-muted-foreground">
                <th className="sticky left-0 z-40 bg-muted/90 w-[28px]"></th>
                <th className="sticky left-[28px] z-40 bg-muted/90 px-2 py-1.5 text-left w-[50px]">Cód</th>
                <th className="sticky left-[78px] z-40 bg-muted/90 px-2 py-1.5 text-left w-[170px]">Etapa</th>
                <th className="sticky left-[248px] z-40 bg-muted/90 px-2 py-1.5 text-center w-[50px]">Unid</th>
                <th className="sticky left-[298px] z-40 bg-muted/90 px-2 py-1.5 text-right w-[50px]">Qtd</th>
                <th className="sticky left-[348px] z-40 bg-muted/90 border-r px-2 py-1.5 text-right w-[90px]">P.Unit.</th>
                <th className="border-r px-2 py-1.5 text-right bg-emerald-50/30 dark:bg-emerald-950/5 min-w-[50px]">Casas</th>
                <th className="border-r px-2 py-1.5 text-right bg-emerald-50/30 dark:bg-emerald-950/5 min-w-[90px]">Receita</th>
                {sortedMedicoes.flatMap(med => [
                  <th key={`${med.id}-c`} className="border-r px-2 py-1.5 text-right min-w-[50px]">Casas</th>,
                  <th key={`${med.id}-v`} className="border-r px-2 py-1.5 text-right min-w-[90px]">Receita</th>,
                ])}
                <th className="px-2 py-1.5 text-right min-w-[60px]">Casas</th>
              </tr>
            </thead>
            <tbody>
              {filteredEtapas.map(etapa => {
                const acum = acumulado.get(etapa.id) ?? { casas: 0, valor: 0 }
                const allPlan = distribuicoes.filter(d => d.etapa_id === etapa.id).reduce((s, d) => s + d.casas_planejadas, 0)
                const restante = (etapa.casas_total ?? 0) - allPlan
                const isSelected = selected.has(etapa.id)
                return (
                  <tr key={etapa.id} className={`border-b hover:bg-muted/10 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                    <td className="sticky left-0 z-10 bg-card px-2 py-2 text-center">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(etapa.id)} className="h-3 w-3 rounded accent-primary cursor-pointer" />
                    </td>
                    <td className="sticky left-[28px] z-10 bg-card px-2 py-2 font-mono text-[10px] text-muted-foreground">{etapa.codigo}</td>
                    <td className="sticky left-[78px] z-10 bg-card px-2 py-2 font-medium truncate max-w-[170px]">{etapa.nome}</td>
                    <td className="sticky left-[248px] z-10 bg-card px-2 py-2 text-center text-muted-foreground">{etapa.faturamento_unidade || 'casa'}</td>
                    <td className="sticky left-[298px] z-10 bg-card px-2 py-2 text-right tabular-nums">{etapa.casas_total ?? 0}</td>
                    <td className="sticky left-[348px] z-10 bg-card border-r px-2 py-2 text-right tabular-nums">{formatCurrency(etapa.faturamento_preco_unitario ?? 0)}</td>
                    <td className="border-r px-2 py-2 text-right tabular-nums bg-emerald-50/20 dark:bg-emerald-950/5 font-medium">{acum.casas}</td>
                    <td className="border-r px-2 py-2 text-right tabular-nums bg-emerald-50/20 dark:bg-emerald-950/5 text-emerald-600">{acum.valor > 0 ? formatCurrency(acum.valor) : '—'}</td>
                    {sortedMedicoes.flatMap(med => {
                      const dist = distMatrix.get(etapa.id)?.get(med.numero)
                      const casas = dist?.casas_planejadas ?? 0
                      const valor = Number(dist?.valor_liberado_faturamento ?? 0)
                      const isEditing = editingCell?.distId === dist?.id
                      const noDates = dist && !dist.data_fim && !dist.data_inicio

                      return [
                        <td key={`${med.id}-${etapa.id}-c`} className="border-r px-2 py-2 text-right">
                          {dist ? (
                            isEditing ? (
                              <div className="flex items-center gap-0.5 justify-end">
                                <input type="number" autoFocus value={editingCell!.value} onChange={e => setEditingCell({ ...editingCell!, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleSaveCasas(); if (e.key === 'Escape') setEditingCell(null) }} className={`${INPUT} w-12 text-right`} />
                                <button onClick={handleSaveCasas} className="rounded p-0.5 hover:bg-emerald-100"><Check className="h-2.5 w-2.5 text-emerald-600" /></button>
                              </div>
                            ) : (
                              <span className="cursor-pointer hover:text-primary tabular-nums inline-flex items-center gap-0.5" onClick={() => setEditingCell({ distId: dist.id, value: String(casas) })}>
                                {noDates && <span title="Sem datas — não aparece no caixa"><AlertTriangle className="h-2.5 w-2.5 text-amber-500" /></span>}
                                {casas}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground/20">—</span>
                          )}
                        </td>,
                        <td key={`${med.id}-${etapa.id}-v`} className="border-r px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {valor > 0 ? formatCurrency(valor) : '—'}
                        </td>,
                      ]
                    })}
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${restante < 0 ? 'text-red-500' : restante === 0 ? 'text-emerald-500' : ''}`}>
                      {restante}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-muted/30 border-t-2 font-bold text-xs">
              <tr>
                <td className="sticky left-0 z-10 bg-muted/40"></td>
                <td colSpan={5} className="sticky left-[28px] z-10 bg-muted/40 border-r px-3 py-2.5">TOTAL</td>
                <td className="border-r px-2 py-2.5 text-right tabular-nums bg-emerald-50/20 dark:bg-emerald-950/5">
                  {distribuicoes.reduce((s, d) => s + (d.casas_realizadas ?? 0), 0)}
                </td>
                <td className="border-r px-2 py-2.5 text-right tabular-nums text-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/5">
                  {formatCurrency(distribuicoes.reduce((s, d) => s + Number(d.valor_liberado_faturamento ?? 0), 0))}
                </td>
                {sortedMedicoes.flatMap(med => {
                  const tot = medTotals.get(med.numero) ?? { casas: 0, valor: 0 }
                  return [
                    <td key={`ft-${med.id}-c`} className="border-r px-2 py-2.5 text-right tabular-nums">{tot.casas}</td>,
                    <td key={`ft-${med.id}-v`} className="border-r px-2 py-2.5 text-right tabular-nums">{formatCurrency(tot.valor)}</td>,
                  ]
                })}
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {filteredEtapas.reduce((s, e) => {
                    const allPlan = distribuicoes.filter(d => d.etapa_id === e.id).reduce((ss, d) => ss + d.casas_planejadas, 0)
                    return s + ((e.casas_total ?? 0) - allPlan)
                  }, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <span className="text-sm font-semibold text-primary">{selected.size} etapa(s)</span>
            <div className="h-5 w-px bg-border" />
            <button onClick={handleBulkExport} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Exportar
            </button>
            <button onClick={handleBulkZero} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10">
              <AlertTriangle className="h-3.5 w-3.5" /> Zerar casas
            </button>
            <button onClick={handleBulkDeleteDist} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Excluir dist.
            </button>
            <div className="h-5 w-px bg-border" />
            <button onClick={clearSelection} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {showNewModal && <NewMedModal form={newForm} onChange={setNewForm} onSubmit={handleCreateMedicao} onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function NewMedModal({ form, onChange, onSubmit, onClose }: {
  form: { numero: string; data_prevista: string; data_inicio: string; data_fim: string }
  onChange: (f: typeof form) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Nova Medição</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Nº *</label>
              <input type="number" min={1} value={form.numero} onChange={e => onChange({ ...form, numero: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Data Prevista *</label>
              <input type="date" value={form.data_prevista} onChange={e => onChange({ ...form, data_prevista: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Data Início</label>
              <input type="date" value={form.data_inicio} onChange={e => onChange({ ...form, data_inicio: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Data Fim</label>
              <input type="date" value={form.data_fim} onChange={e => onChange({ ...form, data_fim: e.target.value })} className={INPUT} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Serão criadas distribuições zeradas para todas as etapas. Edite as casas na matriz.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
            <button onClick={onSubmit} disabled={!form.numero} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
              <Check className="h-4 w-4" /> Criar Medição
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon?: typeof ClipboardCheck; accent?: string }) {
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

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
