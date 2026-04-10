import { useState } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { Calendar, Plus, Save, Pencil, Trash2, X } from 'lucide-react'
import type { Distribuicao } from '@/hooks/useOperacional'
import type { useCreateDistribuicao, useUpdateDistribuicao, useDeleteDistribuicao } from '@/hooks/useOperacional'

interface DistribuicaoSectionProps {
  etapaId: string
  dists: Distribuicao[]
  casasTotal: number
  createDist: ReturnType<typeof useCreateDistribuicao>
  updateDist: ReturnType<typeof useUpdateDistribuicao>
  deleteDist: ReturnType<typeof useDeleteDistribuicao>
}

export default function DistribuicaoSection({ etapaId, dists, casasTotal, createDist, updateDist, deleteDist }: DistribuicaoSectionProps) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })

  const totalPlan = dists.reduce((s, d) => s + d.casas_planejadas, 0)

  const save = async () => {
    if (editId) {
      await updateDist.mutateAsync({ id: editId, ...form })
      setEditId(null)
    } else {
      await createDist.mutateAsync({ etapa_id: etapaId, ...form, casas_realizadas: 0 })
      setAdding(false)
    }
    setForm({ medicao_numero: 1, casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 })
  }

  const startEdit = (d: Distribuicao) => {
    setEditId(d.id)
    setForm({ medicao_numero: d.medicao_numero, casas_planejadas: d.casas_planejadas, data_inicio: d.data_inicio || '', data_fim: d.data_fim || '', valor_liberado_faturamento: d.valor_liberado_faturamento || 0 })
  }

  const EditRow = ({ isNew }: { isNew?: boolean }) => (
    <tr className={isNew ? 'bg-primary/5 border-t' : 'bg-primary/5'}>
      <td className="px-1 py-1"><input type="number" value={form.medicao_numero} onChange={e => setForm(p => ({ ...p, medicao_numero: +e.target.value }))} className="w-12 border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="number" step="any" value={form.casas_planejadas} onChange={e => setForm(p => ({ ...p, casas_planejadas: e.target.value === '' ? 0 : parseFloat(e.target.value) }))} className="w-16 border rounded px-1 py-0.5 text-center text-[11px] bg-background" /></td>
      <td className="px-1 py-1 text-center text-muted-foreground">0</td>
      <td className="px-1 py-1"><input type="date" value={form.data_inicio} onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))} className="w-24 min-w-[90px] border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="date" value={form.data_fim} onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))} className="w-24 min-w-[90px] border rounded px-1 py-0.5 text-[11px] bg-background" /></td>
      <td className="px-1 py-1"><input type="number" step="0.01" value={form.valor_liberado_faturamento} onChange={e => setForm(p => ({ ...p, valor_liberado_faturamento: e.target.value === '' ? 0 : parseFloat(e.target.value) }))} className="w-20 border rounded px-1 py-0.5 text-right text-[11px] bg-background text-amber-600" /></td>
      <td className="px-1 py-1 flex gap-0.5 justify-center">
        <button onClick={save} className="rounded p-0.5 bg-primary text-primary-foreground"><Save className="h-3 w-3" /></button>
        <button onClick={() => { setEditId(null); setAdding(false) }} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
      </td>
    </tr>
  )

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Distribuição ({formatNumber(totalPlan)}/{formatNumber(casasTotal)} unid.)
          {totalPlan !== casasTotal && <span className="text-amber-500 ml-1">⚠</span>}
        </p>
        {!adding && !editId && (
          <button onClick={() => { setAdding(true); setForm({ medicao_numero: (dists.length > 0 ? Math.max(...dists.map(d => d.medicao_numero)) + 1 : 1), casas_planejadas: 4, data_inicio: '', data_fim: '', valor_liberado_faturamento: 0 }) }} className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5">
            <Plus className="h-3 w-3" /> Nova
          </button>
        )}
      </div>
      {dists.length === 0 && !adding ? (
        <p className="text-[10px] text-muted-foreground/50 italic pl-4">Nenhuma distribuição cadastrada</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-max text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-center font-medium w-12">Med.</th>
                <th className="px-2 py-1 text-center font-medium w-20">Casas Plan.</th>
                <th className="px-2 py-1 text-center font-medium w-20">Casas Real.</th>
                <th className="px-2 py-1 text-center font-medium w-24">Início</th>
                <th className="px-2 py-1 text-center font-medium w-24">Fim</th>
                <th className="px-2 py-1 text-right font-medium w-24">Receita (R$)</th>
                <th className="px-2 py-1 text-center font-medium w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dists.map(d => editId === d.id ? (
                <EditRow key={d.id} />
              ) : (
                <tr key={d.id} className="border-t hover:bg-muted/20 group">
                  <td className="px-2 py-1 text-center font-medium">{d.medicao_numero}</td>
                  <td className="px-2 py-1 text-center">{formatNumber(d.casas_planejadas)}</td>
                  <td className={`px-2 py-1 text-center ${d.casas_realizadas >= d.casas_planejadas ? 'text-emerald-600 font-semibold' : ''}`}>{formatNumber(d.casas_realizadas)}</td>
                  <td className="px-2 py-1 text-center">{d.data_inicio ? localDate(d.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-center">{d.data_fim ? localDate(d.data_fim).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-right font-medium">{formatCurrency(d.valor_liberado_faturamento || 0)}</td>
                  <td className="px-2 py-1 flex gap-0.5 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(d)} className="rounded p-0.5 hover:bg-accent"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                    <button onClick={() => deleteDist.mutate(d.id)} className="rounded p-0.5 hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-500" /></button>
                  </td>
                </tr>
              ))}
              {adding && <EditRow isNew />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
