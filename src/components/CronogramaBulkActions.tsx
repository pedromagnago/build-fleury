import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Etapa } from '@/hooks/useEtapas'
import { localDate } from '@/lib/parcelas'
import { exportToExcel } from '@/lib/exportExcel'
import { toast } from 'sonner'
import {
  X, Calendar, Flag, Trash2, Download, AlertTriangle, ArrowRight,
} from 'lucide-react'


interface Props {
  etapas: Etapa[]
  selectedIds: Set<string>
  onDone: () => void
}

type ModalType = 'mover' | 'status' | 'excluir' | null

export default function CronogramaBulkActions({ etapas, selectedIds, onDone }: Props) {
  const [modal, setModal] = useState<ModalType>(null)
  const selected = useMemo(() => etapas.filter(e => selectedIds.has(e.id)), [etapas, selectedIds])

  return (
    <>
      <BulkBtn icon={Calendar} label="Mover datas" onClick={() => setModal('mover')} />
      <BulkBtn icon={Flag} label="Alterar status" onClick={() => setModal('status')} />
      <BulkBtn icon={Download} label="Exportar" onClick={() => handleExport(selected)} />
      <BulkBtn icon={Trash2} label="Excluir" onClick={() => setModal('excluir')} variant="danger" />

      {modal && createPortal(
        <>
          {modal === 'mover' && <MoverDatasModal etapas={selected} onClose={() => setModal(null)} onDone={onDone} />}
          {modal === 'status' && <AlterarStatusModal etapas={selected} onClose={() => setModal(null)} onDone={onDone} />}
          {modal === 'excluir' && <ExcluirModal etapas={selected} onClose={() => setModal(null)} onDone={onDone} />}
        </>,
        document.body
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
function BulkBtn({ icon: Icon, label, onClick, variant }: {
  icon: React.ElementType; label: string; onClick: () => void; variant?: 'danger'
}) {
  const cls = variant === 'danger'
    ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10'
    : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent'
  return <button onClick={onClick} className={cls}><Icon className="h-3.5 w-3.5" />{label}</button>
}

// ---------------------------------------------------------------------------
// Mover Datas
// ---------------------------------------------------------------------------
function MoverDatasModal({ etapas, onClose, onDone }: { etapas: Etapa[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [delta, setDelta] = useState(0)
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => etapas.map(e => {
    const newInicio = e.data_inicio_plan ? shiftDate(e.data_inicio_plan, delta) : null
    const newFim = e.data_fim_plan ? shiftDate(e.data_fim_plan, delta) : null
    return { ...e, newInicio, newFim }
  }), [etapas, delta])

  const handleConfirm = async () => {
    if (delta === 0) { toast.error('Delta não pode ser 0'); return }
    setSaving(true)
    try {
      for (const e of etapas) {
        const updates: Record<string, string | null> = {}
        if (e.data_inicio_plan) updates.data_inicio_plan = shiftDate(e.data_inicio_plan, delta)
        if (e.data_fim_plan) updates.data_fim_plan = shiftDate(e.data_fim_plan, delta)
        await supabase.from('etapas').update(updates).eq('id', e.id)
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'etapas',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'mover_datas', delta, etapas: etapas.length, ids: etapas.map(e => e.id) },
        dados_depois: { delta },
      })

      qc.invalidateQueries({ queryKey: ['etapas'] })
      toast.success(`${etapas.length} etapas movidas em ${delta > 0 ? '+' : ''}${delta} dias`)
      onDone()
      onClose()
    } catch { toast.error('Erro ao mover datas') } finally { setSaving(false) }
  }

  return (
    <ModalShell title={`Mover ${etapas.length} etapas`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deslocar em dias</label>
          <input type="number" value={delta} onChange={e => setDelta(Number(e.target.value))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="+7 adianta, -7 antecipa" />
          <p className="mt-1 text-[10px] text-muted-foreground">Positivo = adiar • Negativo = antecipar</p>
        </div>

        {delta !== 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            <table className="tbl-bf w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Etapa</th>
                  <th className="px-2 py-1.5 text-center font-medium">Início</th>
                  <th className="px-2 py-1.5 text-center font-medium">Fim</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(e => (
                  <tr key={e.id} className="border-t">
                    <td className="px-2 py-1 truncate max-w-[140px]">{e.codigo} — {e.nome}</td>
                    <td className="px-2 py-1 text-center">
                      {e.data_inicio_plan && (
                        <span>
                          <span className="text-muted-foreground">{fmtDt(e.data_inicio_plan)}</span>
                          <ArrowRight className="mx-0.5 inline h-2.5 w-2.5" />
                          <span className="font-medium text-blue-500">{fmtDt(e.newInicio!)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {e.data_fim_plan && (
                        <span>
                          <span className="text-muted-foreground">{fmtDt(e.data_fim_plan)}</span>
                          <ArrowRight className="mx-0.5 inline h-2.5 w-2.5" />
                          <span className="font-medium text-blue-500">{fmtDt(e.newFim!)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Mover datas" variant="amber" />
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Alterar Status
// ---------------------------------------------------------------------------
function AlterarStatusModal({ etapas, onClose, onDone }: { etapas: Etapa[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [status, setStatus] = useState<Etapa['status']>('em_andamento')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      for (const e of etapas) {
        const updates: Record<string, unknown> = { status }
        if (status === 'concluido' && !e.data_fim_real) {
          updates.data_fim_real = todayStr
        }
        if (status === 'em_andamento' && !e.data_inicio_real) {
          updates.data_inicio_real = todayStr
        }
        await supabase.from('etapas').update(updates).eq('id', e.id)
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'etapas',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'alterar_status', etapas: etapas.length, ids: etapas.map(e => e.id) },
        dados_depois: { novo_status: status },
      })

      qc.invalidateQueries({ queryKey: ['etapas'] })
      toast.success(`Status de ${etapas.length} etapas alterado para "${status}"`)
      onDone()
      onClose()
    } catch { toast.error('Erro ao alterar status') } finally { setSaving(false) }
  }

  return (
    <ModalShell title={`Alterar status de ${etapas.length} etapas`} onClose={onClose}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Novo status</label>
        <select value={status} onChange={e => setStatus(e.target.value as Etapa['status'])}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="futuro">Futuro</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluido">Concluído</option>
          <option value="atrasado">Atrasado</option>
        </select>
        {status === 'concluido' && (
          <p className="mt-2 text-[10px] text-amber-500">⚡ Etapas sem data_fim_real receberão a data de hoje</p>
        )}
        {status === 'em_andamento' && (
          <p className="mt-2 text-[10px] text-blue-500">ℹ️ Etapas sem data_inicio_real receberão a data de hoje</p>
        )}
      </div>
      <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {etapas.map(e => (
          <div key={e.id} className="flex items-center gap-2 py-0.5 text-[11px]">
            <span className="font-mono text-muted-foreground">{e.codigo}</span>
            <span className="truncate">{e.nome}</span>
            <span className="ml-auto text-muted-foreground">{e.status}</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <span className="font-medium text-primary">{status}</span>
          </div>
        ))}
      </div>
      <ModalFooter onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Aplicar status" />
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Excluir
// ---------------------------------------------------------------------------
function ExcluirModal({ etapas, onClose, onDone }: { etapas: Etapa[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!confirmed) { toast.error('Marque a confirmação'); return }
    setSaving(true)
    try {
      const ids = etapas.map(e => e.id)
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase.from('etapas').delete().in('id', chunk)
        if (error) throw error
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'etapas',
        acao: 'DELETE', agente: 'humano',
        dados_antes: { operacao: 'excluir_etapas', etapas: etapas.map(e => ({ id: e.id, codigo: e.codigo, nome: e.nome })), ids },
        dados_depois: null,
      })

      qc.invalidateQueries({ queryKey: ['etapas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success(`${etapas.length} etapas excluídas`)
      onDone()
      onClose()
    } catch (err) { toast.error('Erro ao excluir: ' + (err as Error).message) } finally { setSaving(false) }
  }

  return (
    <ModalShell title={`Excluir ${etapas.length} etapas`} onClose={onClose}>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-semibold">Ação irreversível</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Serão excluídas {etapas.length} etapas e todos os itens de compra, pedidos e parcelas vinculados.
        </p>
      </div>

      <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {etapas.map(e => (
          <div key={e.id} className="py-0.5 text-[11px]">
            <span className="font-mono text-muted-foreground">{e.codigo}</span> — {e.nome}
          </div>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          className="h-4 w-4 rounded accent-red-500" />
        <span className="text-xs text-red-500 font-medium">
          Confirmo a exclusão permanente de {etapas.length} etapas
        </span>
      </label>
      <ModalFooter onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Excluir permanentemente"
        variant="danger" disabled={!confirmed} />
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function handleExport(etapas: Etapa[]) {
  const data = etapas.map(e => ({
    'Código': e.codigo,
    'Nome': e.nome,
    'Ordem': e.ordem,
    'Status': e.status,
    'Casas': e.casas_total,
    'Início Plan.': e.data_inicio_plan ?? '',
    'Fim Plan.': e.data_fim_plan ?? '',
    'Início Real': e.data_inicio_real ?? '',
    'Fim Real': e.data_fim_real ?? '',
    'Orçado': e.valor_total_orcado ?? 0,
  }))
  exportToExcel(data, `cronograma_${new Date().toISOString().split('T')[0]}`, 'Etapas')
  toast.success(`${etapas.length} etapas exportadas`)
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex w-full max-h-[90vh] flex-col max-w-lg rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}

function ModalFooter({ onClose, onConfirm, saving, label, variant, disabled }: {
  onClose: () => void; onConfirm: () => void; saving: boolean; label: string
  variant?: 'danger' | 'amber'; disabled?: boolean
}) {
  const btnCls = variant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : variant === 'amber'
    ? 'bg-amber-600 text-white hover:bg-amber-700'
    : 'bg-primary text-primary-foreground hover:opacity-90'

  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
      <button onClick={onConfirm} disabled={saving || disabled}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${btnCls}`}>
        {saving ? 'Processando...' : label}
      </button>
    </div>
  )
}

// Helpers
function shiftDate(dateStr: string, delta: number): string {
  const d = localDate(dateStr)
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]!
}

function fmtDt(d: string): string {
  return localDate(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
