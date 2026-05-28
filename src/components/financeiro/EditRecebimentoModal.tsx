import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { X, Pencil, AlertTriangle } from 'lucide-react'

const INPUT = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50'
const LABEL = 'mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wider'

export interface RecebimentoEditItem {
  id: string
  origem: 'medicao' | 'adiantamento' | 'captacao'
  descricao: string
  parceiro: string | null
  valor: number
  valor_total: number
  status: 'previsto' | 'recebido' | 'vencido' | 'parcial'
  raw: any
}

interface Props {
  item: RecebimentoEditItem
  onClose: () => void
  onDone: () => void
}

export default function EditRecebimentoModal({ item, onClose, onDone }: Props) {
  const qc = useQueryClient()
  const isPago = item.status === 'recebido'

  // ── Estado por origem ──────────────────────────────────────────────────────
  // medicao
  const [medForm, setMedForm] = useState({
    data_prevista: item.raw.data_prevista ?? '',
    valor_planejado: String(item.raw.valor_planejado ?? item.valor_total),
    observacoes: item.raw.observacoes ?? '',
  })

  // adiantamento (mutuo_parcela)
  const [mpForm, setMpForm] = useState({
    data_vencimento: item.raw.data_vencimento ?? '',
    valor: String(item.raw.valor ?? item.valor_total),
    observacoes: item.raw.observacoes ?? '',
  })

  // captacao (mutuo)
  const [mutForm, setMutForm] = useState({
    nome: item.raw.nome ?? item.descricao,
    data_captacao: item.raw.data_captacao ?? '',
    valor_captado: String(item.raw.valor_captado ?? item.valor_total),
    observacoes: item.raw.observacoes ?? '',
  })

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (item.origem === 'medicao') {
        const { error } = await supabase.from('medicoes').update({
          data_prevista: medForm.data_prevista,
          valor_planejado: parseFloat(medForm.valor_planejado) || 0,
          observacoes: medForm.observacoes || null,
        }).eq('id', item.raw.id)
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['medicoes'] })
      } else if (item.origem === 'adiantamento') {
        const { error } = await supabase.from('mutuo_parcelas').update({
          data_vencimento: mpForm.data_vencimento,
          valor: parseFloat(mpForm.valor) || 0,
          observacoes: mpForm.observacoes || null,
        }).eq('id', item.raw.id)
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['mutuos'] })
      } else {
        const { error } = await supabase.from('mutuos').update({
          nome: mutForm.nome,
          data_captacao: mutForm.data_captacao,
          valor_captado: parseFloat(mutForm.valor_captado) || 0,
          observacoes: mutForm.observacoes || null,
        }).eq('id', item.raw.id)
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['mutuos'] })
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
      ])
      toast.success('Recebimento atualizado')
      onDone()
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const origemLabel =
    item.origem === 'medicao' ? 'Medição' :
    item.origem === 'adiantamento' ? 'Parcela de Adiantamento' :
    'Captação / Capital de Giro'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-bold">Editar Recebimento</h2>
              <p className="text-xs text-muted-foreground">{origemLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Aviso se já recebido */}
          {isPago && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Este recebimento já foi baixado. Editar o valor ou data pode criar inconsistência com a movimentação bancária vinculada. Faça o estorno primeiro se necessário.
              </p>
            </div>
          )}

          {/* Resumo */}
          <div className="rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{item.descricao}</span>
            {' · '}{formatCurrency(item.valor_total)}
            {' · '}{item.parceiro ?? '—'}
          </div>

          {/* Campos por origem */}
          {item.origem === 'medicao' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Data Prevista</label>
                  <input
                    type="date"
                    value={medForm.data_prevista}
                    onChange={e => setMedForm(f => ({ ...f, data_prevista: e.target.value }))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Valor Planejado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={medForm.valor_planejado}
                    onChange={e => setMedForm(f => ({ ...f, valor_planejado: e.target.value }))}
                    disabled={isPago}
                    className={INPUT}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL}>Observações</label>
                <textarea
                  value={medForm.observacoes}
                  onChange={e => setMedForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className={`${INPUT} h-auto resize-none`}
                />
              </div>
            </>
          )}

          {item.origem === 'adiantamento' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Data de Vencimento</label>
                  <input
                    type="date"
                    value={mpForm.data_vencimento}
                    onChange={e => setMpForm(f => ({ ...f, data_vencimento: e.target.value }))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mpForm.valor}
                    onChange={e => setMpForm(f => ({ ...f, valor: e.target.value }))}
                    disabled={isPago}
                    className={INPUT}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL}>Observações</label>
                <textarea
                  value={mpForm.observacoes}
                  onChange={e => setMpForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className={`${INPUT} h-auto resize-none`}
                />
              </div>
            </>
          )}

          {item.origem === 'captacao' && (
            <>
              <div>
                <label className={LABEL}>Nome</label>
                <input
                  type="text"
                  value={mutForm.nome}
                  onChange={e => setMutForm(f => ({ ...f, nome: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Data de Captação</label>
                  <input
                    type="date"
                    value={mutForm.data_captacao}
                    onChange={e => setMutForm(f => ({ ...f, data_captacao: e.target.value }))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Valor Captado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mutForm.valor_captado}
                    onChange={e => setMutForm(f => ({ ...f, valor_captado: e.target.value }))}
                    disabled={isPago}
                    className={INPUT}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL}>Observações</label>
                <textarea
                  value={mutForm.observacoes}
                  onChange={e => setMutForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className={`${INPUT} h-auto resize-none`}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
