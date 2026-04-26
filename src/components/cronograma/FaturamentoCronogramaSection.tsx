import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { supabase } from '@/lib/supabase'
import { DollarSign, Calendar, Pencil, Save, X, Plus, Trash2, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Etapa } from '@/hooks/useEtapas'
import type { Distribuicao } from '@/hooks/useOperacional'
import type { useCreateDistribuicao, useUpdateDistribuicao, useDeleteDistribuicao } from '@/hooks/useOperacional'

interface Props {
  etapa: Etapa
  dists: Distribuicao[]
  updateEtapa: any
  createDist: ReturnType<typeof useCreateDistribuicao>
  updateDist: ReturnType<typeof useUpdateDistribuicao>
  deleteDist: ReturnType<typeof useDeleteDistribuicao>
}

export default function FaturamentoCronogramaSection({ etapa, dists, updateEtapa, createDist, updateDist, deleteDist }: Props) {
  const qc = useQueryClient()
  // ─── Faturamento config ───
  const [editingFat, setEditingFat] = useState(false)
  const [fatForm, setFatForm] = useState({
    preco: etapa.faturamento_preco_unitario || 0,
    total: etapa.faturamento_valor_total || 0,
    qtdUnitaria: etapa.faturamento_quantidade_unitaria || 0,
    unidade: etapa.faturamento_unidade || '',
  })

  const qtdUnitaria = etapa.faturamento_quantidade_unitaria || 0
  const unidade = etapa.faturamento_unidade || 'UND'
  const casasTotal = etapa.casas_total || 0
  const qtdTotalServ = qtdUnitaria * casasTotal
  const precoUnit = etapa.faturamento_preco_unitario || 0
  const receitaTotal = etapa.faturamento_valor_total || 0

  // ─── Distribution state ───
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [distForm, setDistForm] = useState({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })
  const [showFatConfig, setShowFatConfig] = useState(false)

  const totalCasasPlan = dists.reduce((s, d) => s + d.casas_planejadas, 0)
  const totalCasasReal = dists.reduce((s, d) => s + d.casas_realizadas, 0)
  const totalFatDist = dists.reduce((s, d) => s + (d.valor_liberado_faturamento || 0), 0)
  const fatGap = receitaTotal - totalFatDist

  const handleSaveFat = async () => {
    const qtdU = fatForm.qtdUnitaria || 0
    const preco = fatForm.preco || 0
    const calculatedTotal = qtdU > 0 && preco > 0 && casasTotal > 0 ? qtdU * casasTotal * preco : fatForm.total
    await updateEtapa.mutateAsync({
      id: etapa.id,
      faturamento_preco_unitario: preco,
      faturamento_valor_total: calculatedTotal,
      faturamento_quantidade_unitaria: qtdU || null,
      faturamento_unidade: fatForm.unidade || null,
    })

    // ── Propagar recálculo para TODAS as distribuições desta etapa ──
    if (calculatedTotal > 0 && casasTotal > 0 && dists.length > 0) {
      let updated = 0
      for (const d of dists) {
        if (d.casas_planejadas > 0) {
          const novoValor = (d.casas_planejadas / casasTotal) * calculatedTotal
          await supabase.from('cronograma_distribuicao').update({
            valor_liberado_faturamento: Math.round(novoValor * 100) / 100,
          }).eq('id', d.id)
          updated++
        }
      }
      if (updated > 0) {
        qc.invalidateQueries({ queryKey: ['cronograma_distribuicao'] })
        toast.success(`${updated} distribuições recalculadas com novo faturamento`)
      }
    }

    setEditingFat(false)
  }

  const handleEditFat = () => {
    setFatForm({
      preco: etapa.faturamento_preco_unitario || 0,
      total: etapa.faturamento_valor_total || 0,
      qtdUnitaria: etapa.faturamento_quantidade_unitaria || 0,
      unidade: etapa.faturamento_unidade || '',
    })
    setEditingFat(true)
    setShowFatConfig(true)
  }

  const saveDist = async () => {
    // Validate: total casas planejadas must not exceed casas_total (from project config)
    if (casasTotal > 0) {
      const currentOther = editId
        ? dists.filter(d => d.id !== editId).reduce((s, d) => s + d.casas_planejadas, 0)
        : totalCasasPlan
      const newTotal = currentOther + distForm.casas_planejadas
      if (newTotal > casasTotal) {
        const { toast } = await import('sonner')
        toast.error(`Total de casas planejadas (${newTotal}) excede o limite do projeto (${casasTotal}). Ajuste na Configuração do Projeto.`)
        return
      }
    }

    if (editId) {
      await updateDist.mutateAsync({ id: editId, ...distForm })
      setEditId(null)
    } else {
      await createDist.mutateAsync({ etapa_id: etapa.id, ...distForm, casas_realizadas: 0 })
      setAdding(false)
    }
    setDistForm({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })
  }

  const startDistEdit = (d: Distribuicao) => {
    setEditId(d.id)
    setDistForm({
      medicao_numero: d.medicao_numero,
      casas_planejadas: d.casas_planejadas,
      data_inicio: d.data_inicio || '',
      data_fim: d.data_fim || '',
      valor_liberado_faturamento: d.valor_liberado_faturamento || 0,
    })
  }

  // Auto-calc faturamento when adding distribution
  const autoCalcFat = (casas: number) => {
    if (precoUnit > 0 && qtdUnitaria > 0) {
      return casas * qtdUnitaria * precoUnit
    }
    if (receitaTotal > 0 && casasTotal > 0) {
      return (casas / casasTotal) * receitaTotal
    }
    return 0
  }

  const handleNewDist = () => {
    const nextMed = dists.length > 0 ? Math.max(...dists.map(d => d.medicao_numero)) + 1 : 1
    const remainCasas = Math.max(0, casasTotal - totalCasasPlan)
    const defaultCasas = remainCasas > 0 ? Math.min(remainCasas, 4) : 4
    const autoFat = autoCalcFat(defaultCasas)
    setDistForm({ medicao_numero: nextMed, casas_planejadas: defaultCasas, data_inicio: '', data_fim: '', valor_liberado_faturamento: autoFat })
    setAdding(true)
  }

  const handleCasasChange = (casas: number) => {
    const autoFat = autoCalcFat(casas)
    setDistForm(p => ({ ...p, casas_planejadas: casas, valor_liberado_faturamento: autoFat || p.valor_liberado_faturamento }))
  }

  const DistEditRow = ({ isNew }: { isNew?: boolean }) => (
    <tr className={isNew ? 'bg-primary/5 border-t' : 'bg-primary/5'}>
      <td className="px-1 py-1"><input type="number" value={distForm.medicao_numero} onChange={e => setDistForm(p => ({ ...p, medicao_numero: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="number" value={distForm.casas_planejadas} onChange={e => handleCasasChange(+e.target.value)} className="w-full border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
      <td className="px-1 py-1 text-center text-muted-foreground text-[11px]">0</td>
      <td className="px-1 py-1">
        {qtdUnitaria > 0 && <span className="text-[10px] text-muted-foreground">{(distForm.casas_planejadas * qtdUnitaria).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}</span>}
      </td>
      <td className="px-1 py-1"><input type="date" value={distForm.data_inicio} onChange={e => setDistForm(p => ({ ...p, data_inicio: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="date" value={distForm.data_fim} onChange={e => setDistForm(p => ({ ...p, data_fim: e.target.value }))} className="w-full border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="number" step="0.01" value={distForm.valor_liberado_faturamento} onChange={e => setDistForm(p => ({ ...p, valor_liberado_faturamento: +e.target.value }))} className="w-full border rounded px-1 py-0.5 text-right text-[11px] bg-background text-emerald-600" /></td>
      <td className="px-1 py-1 flex gap-0.5 justify-center">
        <button onClick={saveDist} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
        <button onClick={() => { setEditId(null); setAdding(false) }} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
      </td>
    </tr>
  )

  // Effective receita: use etapa config OR sum of distributions
  const effectiveReceita = receitaTotal || totalFatDist

  return (
    <div className="px-4">
      {/* ─── Inline alert when CEF not configured ─── */}
      {!receitaTotal && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
          <FileSpreadsheet className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-[10px] text-amber-700 dark:text-amber-400 flex-1">
            Faturamento CEF não configurado para esta etapa. As distribuições mostram receita acumulada de <strong>{formatCurrency(totalFatDist)}</strong>.
          </p>
          <button onClick={handleEditFat} className="text-[10px] bg-amber-500/10 text-amber-700 px-2 py-1 rounded font-medium hover:bg-amber-500/20 shrink-0">
            Configurar
          </button>
        </div>
      )}

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        <KPI label="Receita Total" value={formatCurrency(effectiveReceita)} color={receitaTotal > 0 ? 'text-blue-600' : 'text-amber-500'} />
        <KPI label="Receita Distribuída" value={formatCurrency(totalFatDist)} color={receitaTotal > 0 && Math.abs(fatGap) < 1 ? 'text-emerald-600' : totalFatDist > 0 ? 'text-blue-600' : ''} />
        {receitaTotal > 0 && <KPI label="Saldo p/ Distribuir" value={formatCurrency(fatGap)} color={fatGap > 1 ? 'text-amber-500' : fatGap < -1 ? 'text-red-500' : 'text-emerald-600'} />}
        <KPI label="Casas Planejadas" value={`${totalCasasPlan} / ${casasTotal}`} color={totalCasasPlan === casasTotal ? 'text-emerald-600' : 'text-amber-500'} />
        <KPI label="Casas Realizadas" value={`${totalCasasReal} / ${casasTotal}`} color={totalCasasReal >= casasTotal ? 'text-emerald-600' : ''} />
        <KPI label="Preço Unit." value={precoUnit > 0 ? `${formatCurrency(precoUnit)}${qtdUnitaria > 0 ? `/${unidade}` : ''}` : '—'} />
      </div>

      {/* ─── Collapsible: Faturamento Config ─── */}
      <button onClick={() => setShowFatConfig(!showFatConfig)} className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-2 hover:text-foreground">
        {showFatConfig ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <DollarSign className="h-3 w-3" /> Configuração do Serviço CEF
      </button>

      {showFatConfig && (
        <div className="grid grid-cols-6 gap-2 bg-muted/20 p-3 rounded-lg border border-dashed mb-3">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Qtd/Casa</p>
            {editingFat ? (
              <input type="number" step="0.01" value={fatForm.qtdUnitaria} onChange={e => setFatForm(p => ({ ...p, qtdUnitaria: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
            ) : (
              <p className="text-xs font-bold mt-0.5">{qtdUnitaria || '—'}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Unidade</p>
            {editingFat ? (
              <input type="text" value={fatForm.unidade} onChange={e => setFatForm(p => ({ ...p, unidade: e.target.value }))} placeholder="m³, m², kg" className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
            ) : (
              <p className="text-xs font-bold mt-0.5">{unidade}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Qtd Total</p>
            <p className="text-xs font-bold mt-0.5">
              {qtdUnitaria > 0 ? (
                <><span className="text-muted-foreground font-normal">{casasTotal}×{qtdUnitaria} = </span>{qtdTotalServ.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}</>
              ) : `${casasTotal} UND`}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Preço Unitário</p>
            {editingFat ? (
              <input type="number" step="0.01" value={fatForm.preco} onChange={e => setFatForm(p => ({ ...p, preco: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
            ) : (
              <p className="text-xs font-bold mt-0.5">{formatCurrency(precoUnit)}{qtdUnitaria > 0 && <span className="text-[9px] text-muted-foreground font-normal">/{unidade}</span>}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total CEF</p>
            {editingFat ? (
              <input type="number" step="0.01" value={fatForm.total} onChange={e => setFatForm(p => ({ ...p, total: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold text-blue-600 mt-0.5" />
            ) : (
              <p className="text-xs font-bold text-blue-600 mt-0.5">{formatCurrency(receitaTotal)}</p>
            )}
          </div>
          <div className="flex items-end gap-1">
            {editingFat ? (
              <>
                <button onClick={() => setEditingFat(false)} className="text-[10px] px-2 py-1 rounded hover:bg-muted flex items-center gap-0.5"><X className="h-3 w-3" /></button>
                <button onClick={handleSaveFat} className="text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 flex items-center gap-0.5"><Save className="h-3 w-3" /> Salvar</button>
              </>
            ) : (
              <button onClick={handleEditFat} className="text-[10px] px-2 py-1 rounded hover:bg-muted flex items-center gap-0.5 text-muted-foreground"><Pencil className="h-3 w-3" /> Editar</button>
            )}
          </div>
        </div>
      )}

      {/* ─── Distribution Table (always visible) ─── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Cronograma de Medições ({totalCasasPlan}/{casasTotal} casas)
          {casasTotal > 0 && totalCasasPlan > casasTotal && <span className="text-red-500 ml-1 normal-case font-normal">⛔ Excede o limite do projeto</span>}
          {casasTotal > 0 && totalCasasPlan < casasTotal && <span className="text-amber-500 ml-1">⚠</span>}
          {casasTotal > 0 && totalCasasPlan === casasTotal && <span className="text-emerald-500 ml-1">✓</span>}
        </p>
        {!adding && !editId && (casasTotal === 0 || totalCasasPlan < casasTotal) && (
          <button onClick={handleNewDist} className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5">
            <Plus className="h-3 w-3" /> Nova Distribuição
          </button>
        )}
      </div>

      {dists.length === 0 && !adding ? (
        <p className="text-[10px] text-muted-foreground/50 italic pl-4 pb-2">Nenhuma distribuição cadastrada — adicione para definir o cronograma de faturamento</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="tbl-bf w-full text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-center font-medium w-12">Med.</th>
                <th className="px-2 py-1.5 text-center font-medium">Casas Plan.</th>
                <th className="px-2 py-1.5 text-center font-medium">Casas Real.</th>
                {qtdUnitaria > 0 && <th className="px-2 py-1.5 text-center font-medium">Qtd. Serviço</th>}
                <th className="px-2 py-1.5 text-center font-medium">Início</th>
                <th className="px-2 py-1.5 text-center font-medium">Fim</th>
                <th className="px-2 py-1.5 text-right font-medium">Receita (R$)</th>
                <th className="px-2 py-1.5 text-center font-medium w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[...dists].sort((a, b) => a.medicao_numero - b.medicao_numero).map(d => {
                if (editId === d.id) return <DistEditRow key={d.id} />
                const qtdServMed = qtdUnitaria > 0 ? d.casas_planejadas * qtdUnitaria : 0
                const pctCasas = casasTotal > 0 ? (d.casas_realizadas / d.casas_planejadas) * 100 : 0
                return (
                  <tr key={d.id} className="border-t hover:bg-muted/20 group">
                    <td className="px-2 py-1.5 text-center font-bold">M{d.medicao_numero}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="font-semibold text-blue-600">{d.casas_planejadas}</span>
                      <span className="text-[9px] text-muted-foreground/60 mx-0.5">/</span>
                      <span className="text-[9px] text-muted-foreground">{casasTotal}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <span className={d.casas_realizadas >= d.casas_planejadas ? 'text-emerald-600 font-semibold' : ''}>{d.casas_realizadas}</span>
                        {d.casas_planejadas > 0 && (
                          <div className="w-8 h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pctCasas)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    {qtdUnitaria > 0 && (
                      <td className="px-2 py-1.5 text-center text-[10px]">
                        <span className="font-semibold">{qtdServMed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-muted-foreground ml-0.5">{unidade}</span>
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{d.data_inicio ? localDate(d.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">{d.data_fim ? localDate(d.data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-600">{formatCurrency(d.valor_liberado_faturamento || 0)}</td>
                    <td className="px-2 py-1.5 flex gap-0.5 justify-center opacity-0 group-hover:opacity-100">
                      <button onClick={() => startDistEdit(d)} className="rounded p-0.5 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => deleteDist.mutate(d.id)} className="rounded p-0.5 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
                    </td>
                  </tr>
                )
              })}
              {adding && <DistEditRow isNew />}
              {/* Totals row */}
              {dists.length > 0 && (
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="px-2 py-1.5 text-center text-[10px] uppercase text-muted-foreground">Total</td>
                  <td className="px-2 py-1.5 text-center">{totalCasasPlan}</td>
                  <td className="px-2 py-1.5 text-center">{totalCasasReal}</td>
                  {qtdUnitaria > 0 && <td className="px-2 py-1.5 text-center">{(totalCasasPlan * qtdUnitaria).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}</td>}
                  <td colSpan={2}></td>
                  <td className="px-2 py-1.5 text-right text-emerald-600">{formatCurrency(totalFatDist)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-2">
      <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-tight">{label}</p>
      <p className={`text-xs font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}
