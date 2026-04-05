import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Pedido } from '@/hooks/useCompras'
import { toast } from 'sonner'
import { Trash2, AlertTriangle } from 'lucide-react'

interface Props {
  pedidos: Pedido[]
  selectedIds: Set<string>
  onDone: () => void
}

export default function PedidosBulkActions({ pedidos, selectedIds, onDone }: Props) {
  const [showDelete, setShowDelete] = useState(false)
  const selected = pedidos.filter(p => selectedIds.has(p.id))

  return (
    <>
      <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent text-destructive">
        <Trash2 className="h-3.5 w-3.5" /> Excluir Pedidos
      </button>

      {showDelete && <ExcluirLoteModal pedidos={selected} onClose={() => setShowDelete(false)} onDone={onDone} />}
    </>
  )
}

function ExcluirLoteModal({ pedidos, onClose, onDone }: { pedidos: Pedido[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const ids = pedidos.map(p => p.id)
      
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        // Apagar parcelas primeiro (cascata manual para evitar erro de FK)
        await supabase.from('parcelas').delete().in('pedido_id', chunk)
        
        const { error } = await supabase.from('pedidos').delete().in('id', chunk)
        if (error) throw error
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'pedidos',
        acao: 'DELETE',
        agente: 'humano',
        dados_antes: { qtd: ids.length, type: 'bulk_delete', ids },
      })

      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] }) // parcelas cascateiam ou perdem vinculo
      toast.success(`${ids.length} pedidos excluídos`)
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
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Excluir {pedidos.length} pedidos?
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          A exclusão do pedido removerá parcelas não pagas vinculadas a ele. Esta ação não pode ser desfeita.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? 'Cuidado...' : 'Excluir Permanentemente'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
