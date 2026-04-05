import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Fornecedor } from '@/hooks/useCompras'
import { toast } from 'sonner'
import { Trash2, AlertTriangle } from 'lucide-react'

interface Props {
  fornecedores: Fornecedor[]
  selectedIds: Set<string>
  onDone: () => void
}

export default function FornecedoresBulkActions({ fornecedores, selectedIds, onDone }: Props) {
  const [showDelete, setShowDelete] = useState(false)
  const selected = fornecedores.filter(f => selectedIds.has(f.id))

  return (
    <>
      <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent text-destructive">
        <Trash2 className="h-3.5 w-3.5" /> Excluir Fornecedores
      </button>

      {showDelete && <ExcluirLoteModal fornecedores={selected} onClose={() => setShowDelete(false)} onDone={onDone} />}
    </>
  )
}

function ExcluirLoteModal({ fornecedores, onClose, onDone }: { fornecedores: Fornecedor[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = async () => {
    if (!confirmed) { toast.error('Marque a confirmação'); return }
    setSaving(true)
    try {
      const ids = fornecedores.map(f => f.id)
      
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase.from('fornecedores').delete().in('id', chunk)
        if (error) throw error
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'fornecedores',
        acao: 'DELETE',
        agente: 'humano',
        dados_antes: { qtd: ids.length, type: 'bulk_delete', ids },
      })

      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success(`${ids.length} fornecedores excluídos`)
      onDone()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Tem certeza que deseja excluir <strong>{fornecedores.length}</strong> fornecedores?
          Não será possível reverter esta ação.
        </p>

        <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded accent-destructive" />
            <span className="text-sm font-medium text-destructive">Sim, entendo os riscos e quero excluir</span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving || !confirmed} className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? 'Cuidado...' : <><Trash2 className="h-4 w-4" /> Excluir Permanentemente</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
