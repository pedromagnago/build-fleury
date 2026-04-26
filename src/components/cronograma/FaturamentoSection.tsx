import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { FileSpreadsheet, Pencil, Save, X } from 'lucide-react'
import type { Etapa } from '@/hooks/useEtapas'
import type { Distribuicao } from '@/hooks/useOperacional'

interface FaturamentoSectionProps {
  etapa: Etapa
  dists: Distribuicao[]
  updateEtapa: any
}

export default function FaturamentoSection({ etapa, dists, updateEtapa }: FaturamentoSectionProps) {
  const totFat = dists.reduce((s, d) => s + (d.valor_liberado_faturamento || 0), 0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    preco: etapa.faturamento_preco_unitario || 0,
    total: etapa.faturamento_valor_total || 0,
    qtdUnitaria: etapa.faturamento_quantidade_unitaria || 0,
    unidade: etapa.faturamento_unidade || '',
  })

  const qtdUnitaria = etapa.faturamento_quantidade_unitaria || 0
  const unidade = etapa.faturamento_unidade || 'UND'
  const casasTotal = etapa.casas_total || 0
  const qtdTotalServ = qtdUnitaria * casasTotal

  const handleEdit = () => {
    setForm({
      preco: etapa.faturamento_preco_unitario || 0,
      total: etapa.faturamento_valor_total || 0,
      qtdUnitaria: etapa.faturamento_quantidade_unitaria || 0,
      unidade: etapa.faturamento_unidade || '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    if (updateEtapa) {
      const qtdU = form.qtdUnitaria || 0
      const preco = form.preco || 0
      const calculatedTotal = qtdU > 0 && preco > 0 && casasTotal > 0 ? qtdU * casasTotal * preco : form.total
      await updateEtapa.mutateAsync({
        id: etapa.id,
        faturamento_preco_unitario: preco,
        faturamento_valor_total: calculatedTotal,
        faturamento_quantidade_unitaria: qtdU || null,
        faturamento_unidade: form.unidade || null,
      })
    }
    setEditing(false)
  }

  if (!etapa.faturamento_valor_total && !editing) {
    return (
      <div className="px-6 flex flex-col items-center justify-center py-6">
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs font-semibold text-muted-foreground">Sem dados de faturamento CEF</p>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1 max-w-[300px] mb-3">
          Para visualizar os valores, importe a planilha de Composição e garanta que o nome desta etapa corresponde a um serviço listado lá.
        </p>
        <button onClick={handleEdit} className="text-[10px] bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-medium hover:bg-primary/20 transition-colors">
          Personalizar Manualmente
        </button>
      </div>
    )
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-2 mt-1">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
          <FileSpreadsheet className="h-3 w-3" /> Resumo do Faturamento CEF
        </h4>
        {!editing ? (
          <button onClick={handleEdit} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Pencil className="h-3 w-3" /> Configurar CEF
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(false)} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
              <X className="h-3 w-3" /> Cancelar
            </button>
            <button onClick={handleSave} className="text-[10px] flex items-center gap-1 bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90">
              <Save className="h-3 w-3" /> Salvar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-6 gap-2 bg-muted/20 p-3 rounded-lg border border-dashed mb-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Qtd/Casa</p>
          {editing ? (
            <input type="number" step="0.01" value={form.qtdUnitaria} onChange={e => setForm(p => ({ ...p, qtdUnitaria: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-foreground mt-0.5">{qtdUnitaria || '—'}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Unidade</p>
          {editing ? (
            <input type="text" value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="m³, m², kg" className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-foreground mt-0.5">{unidade}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Qtd Total</p>
          {qtdUnitaria > 0 ? (
            <p className="text-xs font-bold text-foreground mt-0.5">
              <span className="text-muted-foreground font-normal">{casasTotal}×{qtdUnitaria} = </span>
              {qtdTotalServ.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade}
            </p>
          ) : (
            <p className="text-xs font-bold text-foreground mt-0.5">{casasTotal} UND</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Preço Unitário</p>
          {editing ? (
            <input type="number" step="0.01" value={form.preco} onChange={e => setForm(p => ({ ...p, preco: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-foreground mt-0.5">
              {formatCurrency(etapa.faturamento_preco_unitario || 0)}
              {qtdUnitaria > 0 && <span className="text-[9px] text-muted-foreground font-normal">/{unidade}</span>}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total CEF</p>
          {editing ? (
            <input type="number" step="0.01" value={form.total} onChange={e => setForm(p => ({ ...p, total: +e.target.value }))} className="w-full bg-background border rounded px-1.5 py-0.5 text-xs font-bold text-blue-600 mt-0.5" />
          ) : (
            <p className="text-xs font-bold text-blue-600 mt-0.5">{formatCurrency(etapa.faturamento_valor_total || 0)}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total Distribuído</p>
          <p className={`text-xs font-bold mt-0.5 ${Math.abs(totFat - (etapa.faturamento_valor_total || 0)) < 1 ? 'text-emerald-600' : 'text-amber-500'}`}>{formatCurrency(totFat)}</p>
        </div>
      </div>

      {dists.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="tbl-bf w-full text-[11px]">
            <thead className="bg-muted/30">
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-center font-medium w-12">Med.</th>
                <th className="px-2 py-1.5 text-left font-medium">Período Previsto</th>
                <th className="px-2 py-1.5 text-center font-medium">Casas</th>
                {qtdUnitaria > 0 && <th className="px-2 py-1.5 text-center font-medium">Qtd. Serviço</th>}
                <th className="px-2 py-1.5 text-right font-medium">Receita (R$)</th>
              </tr>
            </thead>
            <tbody>
              {[...dists].sort((a, b) => a.medicao_numero - b.medicao_numero).map(d => {
                const qtdServMed = qtdUnitaria > 0 ? d.casas_planejadas * qtdUnitaria : 0
                return (
                  <tr key={d.id} className="border-t hover:bg-muted/10">
                    <td className="px-2 py-1.5 text-center font-medium">M{d.medicao_numero}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {d.data_inicio ? localDate(d.data_inicio).toLocaleDateString('pt-BR') : '--'} até {d.data_fim ? localDate(d.data_fim).toLocaleDateString('pt-BR') : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="font-semibold text-blue-600">{d.casas_planejadas}</span>
                      <span className="text-[9px] text-muted-foreground/60 mx-1">/</span>
                      <span className="font-medium">{casasTotal}</span>
                    </td>
                    {qtdUnitaria > 0 && (
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-muted-foreground">{d.casas_planejadas}×{qtdUnitaria} = </span>
                        <span className="font-semibold">{qtdServMed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-muted-foreground ml-0.5">{unidade}</span>
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-600">
                      {formatCurrency(d.valor_liberado_faturamento || 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
