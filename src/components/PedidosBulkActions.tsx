import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Pedido } from '@/hooks/useCompras'
import { toast } from 'sonner'
import { Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

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
  const [motivo, setMotivo] = useState('')

  // Pré-visualização: parcelas que serão removidas. Evita o cenário "cliquei sem
  // saber o que ia perder" — é o que aconteceu no bulk_delete de 13/05 que tirou
  // 66k do total sem rastro.
  const [preview, setPreview] = useState<{
    parcelas: Array<{ id: string; valor: number; valor_pago: number; status: string }>
    bloqueio: { pagas: number; valorPago: number } | null
    loading: boolean
  }>({ parcelas: [], bloqueio: null, loading: true })

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const ids = pedidos.map(p => p.id)
      const { data } = await supabase.from('parcelas')
        .select('id, valor, valor_pago, status')
        .in('pedido_id', ids)
      if (cancelado) return
      const parcelas = (data ?? []).map(p => ({
        id: p.id as string,
        valor: Number(p.valor) || 0,
        valor_pago: Number(p.valor_pago) || 0,
        status: p.status as string,
      }))
      const pagasArr = parcelas.filter(p => p.status === 'paga' || p.valor_pago > 0.01)
      const bloqueio = pagasArr.length > 0
        ? { pagas: pagasArr.length, valorPago: pagasArr.reduce((s, p) => s + p.valor_pago, 0) }
        : null
      setPreview({ parcelas, bloqueio, loading: false })
    })()
    return () => { cancelado = true }
  }, [pedidos])

  const valorPendente = preview.parcelas.reduce(
    (s, p) => s + (p.status !== 'paga' ? Math.max(0, p.valor - p.valor_pago) : 0),
    0
  )

  const handleConfirm = async () => {
    if (preview.bloqueio) {
      toast.error('Existem parcelas pagas. Estorne antes de excluir.')
      return
    }
    setSaving(true)
    try {
      const ids = pedidos.map(p => p.id)

      // 1. Snapshot completo ANTES de qualquer delete. Inclui fornecedor e item
      //    via join pra que o audit_log seja auto-suficiente (não depende de
      //    dados que vão sumir junto com o delete).
      const { data: snapshotPedidos } = await supabase.from('pedidos')
        .select('*, fornecedores(nome), itens_compra(descricao)')
        .in('id', ids)
      const { data: snapshotParcelas } = await supabase.from('parcelas')
        .select('id, pedido_id, numero_parcela, valor, valor_pago, status, data_vencimento, data_pagamento_real')
        .in('pedido_id', ids)

      // 2. Re-checa bloqueio com o snapshot fresco (preview pode estar stale).
      const pagasNoSnapshot = (snapshotParcelas ?? []).filter(
        (p: any) => p.status === 'paga' || Number(p.valor_pago || 0) > 0.01
      )
      if (pagasNoSnapshot.length > 0) {
        toast.error(`Abortado: ${pagasNoSnapshot.length} parcela(s) com pagamento registrado.`)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const valorPendenteSnap = (snapshotParcelas ?? []).reduce(
        (s: number, p: any) => s + Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0)),
        0
      )

      // 3. Audit ANTES do delete. Se algum chunk falhar adiante, o snapshot
      //    fica preservado pra investigação/restauração manual.
      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id,
        user_id: user?.id,
        user_email: user?.email,
        tabela: 'pedidos',
        acao: 'DELETE',
        agente: 'humano',
        dados_antes: {
          type: 'bulk_delete',
          qtd_pedidos: ids.length,
          qtd_parcelas_removidas: snapshotParcelas?.length ?? 0,
          valor_pendente_removido: valorPendenteSnap,
          motivo: motivo.trim() || null,
          pedidos: snapshotPedidos,
          parcelas: snapshotParcelas,
        },
        resumo: `Bulk delete: ${ids.length} pedido(s), ${snapshotParcelas?.length ?? 0} parcela(s) pendente(s), ${formatCurrency(valorPendenteSnap)}${motivo.trim() ? ` — Motivo: ${motivo.trim()}` : ''}`,
      })

      // 4. Delete em chunks
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        await supabase.from('parcelas').delete().in('pedido_id', chunk)
        const { error } = await supabase.from('pedidos').delete().in('id', chunk)
        if (error) throw error
      }

      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
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
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Excluir {pedidos.length} pedidos?
        </h3>

        {/* Pré-visualização do que será apagado */}
        <div className="mb-3 rounded-md border bg-muted/30 p-3 text-xs">
          {preview.loading ? (
            <p className="text-muted-foreground">Carregando impacto…</p>
          ) : preview.bloqueio ? (
            <p className="text-destructive font-medium">
              {preview.bloqueio.pagas} parcela(s) já pagas ({formatCurrency(preview.bloqueio.valorPago)}).
              Estorne antes de excluir — apagar agora destruiria o histórico de pagamento.
            </p>
          ) : (
            <>
              <p><strong>{preview.parcelas.length}</strong> parcela(s) vinculada(s) serão removidas.</p>
              <p>Valor pendente a perder: <strong>{formatCurrency(valorPendente)}</strong></p>
            </>
          )}
        </div>

        <label className="mb-3 block text-xs">
          <span className="text-muted-foreground">Motivo (opcional, fica no log):</span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: pedidos duplicados, cancelados pelo fornecedor…"
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
            maxLength={200}
          />
        </label>

        <p className="mb-4 text-[11px] text-muted-foreground">
          Esta ação não pode ser desfeita, mas um snapshot completo é gravado em <code>audit_logs</code>.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || preview.loading || !!preview.bloqueio}
            className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Excluindo…' : 'Excluir Permanentemente'}
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
