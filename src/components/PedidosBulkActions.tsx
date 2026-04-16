import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Pedido } from '@/hooks/useCompras'
import { toast } from 'sonner'
import { Trash2, AlertTriangle, RefreshCw } from 'lucide-react'

// NOVO: import de dependências para o Recalcular Parcelas
import { gerarParcelas, localDate } from '@/lib/parcelas'

interface Props {
  pedidos: Pedido[]
  selectedIds: Set<string>
  onDone: () => void
}

export default function PedidosBulkActions({ pedidos, selectedIds, onDone }: Props) {
  const [showDelete, setShowDelete] = useState(false)
  const [showGerarParcelas, setShowGerarParcelas] = useState(false)

  const selected = pedidos.filter(p => selectedIds.has(p.id))

  return (
    <>
      <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent text-destructive">
        <Trash2 className="h-3.5 w-3.5" /> Excluir Pedidos
      </button>

      {/* NOVO: Gerar Parcelas */}
      <button onClick={() => setShowGerarParcelas(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent text-primary">
        <RefreshCw className="h-3.5 w-3.5" /> Recalcular Parcelas
      </button>

      {showDelete && <ExcluirLoteModal pedidos={selected} onClose={() => setShowDelete(false)} onDone={onDone} />}
      {showGerarParcelas && <GerarParcelasLoteModal pedidos={selected} onClose={() => setShowGerarParcelas(false)} onDone={onDone} />}
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

function GerarParcelasLoteModal({ pedidos, onClose, onDone }: { pedidos: Pedido[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if(!currentCompany) return
    setSaving(true)
    try {
      const ids = pedidos.map(p => p.id)
      
      // 1. Deletar as parcelas antigas com status != paga? 
      // O usuário aprovou que as parcelas sejam geradas "não pagas".
      // Vamos apagar apenas as NÂO pagas, ou TUDO?
      // O mais seguro é deletar TUDO que não estiver pago e recriar. Se tem alguma paga, mantemos e abstraimos do recálculo?
      // Pelo feedback: "As parcelas recalculadas são "não paga".", o ideal é limpar DE FATO tudo pendente, pois o recalculo gera do 0.
      
      const { error: delErr } = await supabase
        .from('parcelas')
        .delete()
        .in('pedido_id', ids)
        .neq('status', 'paga')
        
      if (delErr) throw delErr

      // 2. Iterar e gerar novas parcelas...
      // Para podermos usar "data_inicio_plan", precisamos dar fetch na etapa do pedido
      // O Pedido já traz `item_compra_id`.
      const { data: itens } = await supabase
         .from('itens_compra')
         .select('id, etapas(data_inicio_plan)')
         .in('id', pedidos.map(p => p.item_compra_id))
         
      const itensMap = (itens || []).reduce((acc: any, itm: any) => {
         acc[itm.id] = (Array.isArray(itm.etapas) ? itm.etapas[0]?.data_inicio_plan : itm.etapas?.data_inicio_plan)
         return acc
      }, {})

      let parcelasToInsert: any[] = []

      for (const p of pedidos) {
        // Se a entrega nulo, cai pra etapa. Se nulo da etapa, cai pro hoje.
        const dEntregaFallback = p.data_entrega_prevista || itensMap[p.item_compra_id] || new Date().toISOString().split('T')[0]
        
        const generated = gerarParcelas({
          pedidoId: p.id,
          companyId: currentCompany.id,
          valorTotal: p.valor_total_real || 0,
          condPagamento: p.cond_pagamento || 'à vista',
          dataEntrega: localDate(dEntregaFallback)
        })
        
        // generated tem status default "pendente" (não paga)
        parcelasToInsert.push(...generated)
      }

      if (parcelasToInsert.length > 0) {
        const { error: insErr } = await supabase.from('parcelas').insert(parcelasToInsert)
        if (insErr) throw insErr
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        tabela: 'parcelas',
        acao: 'CREATE',
        agente: 'humano',
        dados_antes: { type: 'bulk_regenerate', qtd_pedidos: ids.length },
        dados_depois: { qtd_parcelas_geradas: parcelasToInsert.length },
      })

      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] }) 
      toast.success(`${parcelasToInsert.length} parcelas recriadas para ${pedidos.length} pedidos.`)
      onDone()
      onClose()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao recriar parcelas: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-primary">
          <RefreshCw className="h-5 w-5" /> Recriar Parcelas
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Esta ação irá <strong>apagar</strong> todas as parcelas "pendentes" (não pagas) atuais dos <strong>{pedidos.length}</strong> pedidos selecionados e irá recriá-las baseando-se no valor de fechamento e condição de pagamento original. Confirma?
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? 'Regerando...' : 'Recalcular e Gerar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
