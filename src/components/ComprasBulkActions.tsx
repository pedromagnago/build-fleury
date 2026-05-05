import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type ItemCompra, useFornecedores } from '@/hooks/useCompras'
import { formatCurrency } from '@/lib/utils'
import { gerarParcelas, localDate } from '@/lib/parcelas'
import { exportToExcel } from '@/lib/exportExcel'
import { toast } from 'sonner'
import {
  X, Users, CalendarClock, Package, Download, Trash2, AlertTriangle,
} from 'lucide-react'

interface Props {
  itens: ItemCompra[]
  selectedIds: Set<string>
  onDone: () => void
}

type ModalType = 'fornecedor' | 'cond_pagamento' | 'gerar_pedidos' | 'excluir' | null

export default function ComprasBulkActions({ itens, selectedIds, onDone }: Props) {
  const [modal, setModal] = useState<ModalType>(null)
  const selected = useMemo(() => itens.filter(i => selectedIds.has(i.id)), [itens, selectedIds])

  return (
    <>
      <BulkBtn icon={Users} label="Alterar fornecedor" onClick={() => setModal('fornecedor')} />
      <BulkBtn icon={CalendarClock} label="Cond. pagamento" onClick={() => setModal('cond_pagamento')} />
      <BulkBtn icon={Package} label="Gerar pedidos" onClick={() => setModal('gerar_pedidos')} />
      <BulkBtn icon={Download} label="Exportar" onClick={() => handleExport(selected)} />
      <BulkBtn icon={Trash2} label="Excluir" onClick={() => setModal('excluir')} variant="danger" />

      {modal && createPortal(
        <>
          {modal === 'fornecedor' && <AlterarFornecedorModal itens={selected} onClose={() => setModal(null)} onDone={onDone} />}
          {modal === 'cond_pagamento' && <AlterarCondModal itens={selected} onClose={() => setModal(null)} onDone={onDone} />}
          {modal === 'gerar_pedidos' && <GerarPedidosModal itens={selected} onClose={() => setModal(null)} onDone={onDone} />}
          {modal === 'excluir' && <ExcluirItensModal itens={selected} onClose={() => setModal(null)} onDone={onDone} />}
        </>,
        document.body
      )}
    </>
  )
}

function BulkBtn({ icon: Icon, label, onClick, variant }: {
  icon: React.ElementType; label: string; onClick: () => void; variant?: 'danger'
}) {
  const cls = variant === 'danger'
    ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10'
    : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent'
  return <button onClick={onClick} className={cls}><Icon className="h-3.5 w-3.5" />{label}</button>
}

// ---------------------------------------------------------------------------
function AlterarFornecedorModal({ itens, onClose, onDone }: { itens: ItemCompra[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: fornecedores = [] } = useFornecedores()
  const [fornecedorId, setFornecedorId] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!fornecedorId) { toast.error('Selecione um fornecedor'); return }
    setSaving(true)
    try {
      for (const i of itens) {
        await supabase.from('itens_compra').update({ fornecedor_id: fornecedorId }).eq('id', i.id)
      }
      await supabase.from('audit_logs').insert({
        company_id: itens[0]?.company_id,
        tabela: 'itens_compra',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { quantidade: itens.length, operacao: 'associar_fornecedor', ids: itens.map(r => r.id) },
        dados_depois: { fornecedor_id: fornecedorId }
      })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success(`Fornecedor atualizado em ${itens.length} itens`)
      onDone(); onClose()
    } catch { toast.error('Erro ao atualizar') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Alterar fornecedor de ${itens.length} itens`} onClose={onClose}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Novo fornecedor</label>
        <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="">Selecione...</option>
          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Aplicar fornecedor" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function AlterarCondModal({ itens, onClose, onDone }: { itens: ItemCompra[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [cond, setCond] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!cond) { toast.error('Informe a condição'); return }
    setSaving(true)
    try {
      for (const i of itens) {
        await supabase.from('itens_compra').update({ cond_pagamento: cond }).eq('id', i.id)
      }
      await supabase.from('audit_log').insert({
        company_id: currentCompany?.id, tabela: 'itens_compra',
        registro_id: itens.map(i => i.id).join(','), acao: 'BULK_UPDATE',
        dados_antes: { operacao: 'alterar_cond_pagamento', itens: itens.length },
        dados_depois: { cond_pagamento: cond },
      })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success(`Condição atualizada em ${itens.length} itens`)
      onDone(); onClose()
    } catch { toast.error('Erro ao atualizar') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Alterar condição de ${itens.length} itens`} onClose={onClose}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Nova condição de pagamento</label>
        <input value={cond} onChange={e => setCond(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="30/60/90" />
        <p className="mt-1 text-[10px] text-muted-foreground">Exemplo: "30/60" gera 2 parcelas</p>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Aplicar condição" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function GerarPedidosModal({ itens, onClose, onDone }: { itens: ItemCompra[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [casasLote, setCasasLote] = useState('32')
  const [dataEntrega, setDataEntrega] = useState('')
  const [condPadrao, setCondPadrao] = useState('30')
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => {
    const casas = parseInt(casasLote) || 0
    return itens.map(i => {
      const qtd = Math.round((i.qtd_por_casa ?? 0) * casas * 100) / 100
      const valor = Math.round(qtd * (i.custo_unitario_orcado ?? 0) * 100) / 100
      return { ...i, qtd_lote: qtd, valor_total: valor }
    })
  }, [itens, casasLote])

  const totalValor = preview.reduce((s, p) => s + p.valor_total, 0)

  const handleConfirm = async () => {
    if (!casasLote || !dataEntrega) { toast.error('Preencha casas e data'); return }
    setSaving(true)
    try {
      let totalParcelas = 0
      // Itens do mesmo fornecedor compartilham pedido_grupo_id (1 PO lógica).
      const grupoByFornecedor = new Map<string, string>()
      for (const p of preview) {
        const cond = p.cond_pagamento || condPadrao
        const fornId = p.fornecedor_id || null
        let pedidoGrupoId: string | null = null
        if (fornId) {
          let g = grupoByFornecedor.get(fornId)
          if (!g) { g = crypto.randomUUID(); grupoByFornecedor.set(fornId, g) }
          pedidoGrupoId = g
        }
        const { data: pedido, error } = await supabase.from('pedidos').insert({
          company_id: currentCompany?.id,
          item_compra_id: p.id,
          casas_lote: parseInt(casasLote),
          qtd_lote: p.qtd_lote,
          valor_unitario_real: p.custo_unitario_orcado,
          valor_total_real: p.valor_total,
          fornecedor_id: fornId,
          cond_pagamento: cond,
          data_entrega_prevista: dataEntrega,
          status: 'planejado',
          pedido_grupo_id: pedidoGrupoId,
        }).select().single()
        if (error) throw error

        const parcelas = gerarParcelas({
          pedidoId: pedido.id,
          companyId: currentCompany!.id,
          valorTotal: p.valor_total,
          condPagamento: cond,
          dataEntrega: localDate(dataEntrega),
        })
        if (parcelas.length) {
          const { error: pErr } = await supabase.from('parcelas').insert(parcelas)
          if (pErr) throw pErr
          totalParcelas += parcelas.length
        }
      }

      await supabase.from('audit_logs').insert({
        company_id: itens[0]?.company_id,
        tabela: 'itens_compra',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { quantidade: itens.length, operacao: 'gerar_pedidos_lote', ids: itens.map(r => r.id) },
        dados_depois: { itens: itens.length, parcelas: totalParcelas }
      })

      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      toast.success(`${itens.length} pedidos criados, ${totalParcelas} parcelas geradas`)
      onDone(); onClose()
    } catch (err) { toast.error('Erro: ' + (err as Error).message) } finally { setSaving(false) }
  }

  return (
    <Modal title={`Gerar pedidos para ${itens.length} itens`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Casas do lote</label>
            <input type="number" value={casasLote} onChange={e => setCasasLote(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data entrega</label>
            <input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Condição padrão</label>
            <input type="text" value={condPadrao} onChange={e => setCondPadrao(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="30/60" />
          </div>
        </div>

        {preview.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            <table className="tbl-bf w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qtd/Lote</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1 max-w-[160px] truncate">{p.codigo} — {p.descricao}</td>
                    <td className="px-2 py-1 text-right">{p.qtd_lote.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right font-medium">{formatCurrency(p.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 border-t">
                <tr>
                  <td className="px-2 py-1.5 font-semibold" colSpan={2}>Total</td>
                  <td className="px-2 py-1.5 text-right font-bold text-primary">{formatCurrency(totalValor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Gerar pedidos" variant="emerald" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function handleExport(itens: ItemCompra[]) {
  const data = itens.map(i => ({
    'Código': i.codigo, 'Descrição': i.descricao, 'Tipo': i.tipo,
    'Fornecedor': i.fornecedor_nome ?? '', 'Orçado': i.valor_total_orcado,
    'Consumido': i.valor_consumido, 'Saldo': i.valor_saldo,
  }))
  exportToExcel(data, `itens_compra_${new Date().toISOString().split('T')[0]}`, 'Itens')
  toast.success(`${itens.length} itens exportados`)
}

// Shared UI
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

function Footer({ onClose, onConfirm, saving, label, variant, disabled }: {
  onClose: () => void; onConfirm: () => void; saving: boolean; label: string; variant?: 'emerald' | 'danger'; disabled?: boolean
}) {
  const btn = variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700'
    : variant === 'emerald' ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-primary text-primary-foreground hover:opacity-90'
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
      <button onClick={onConfirm} disabled={saving || disabled} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${btn}`}>
        {saving ? 'Processando...' : label}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Excluir Itens
// ---------------------------------------------------------------------------
function ExcluirItensModal({ itens, onClose, onDone }: { itens: ItemCompra[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!confirmed) { toast.error('Marque a confirmação'); return }
    setSaving(true)
    try {
      const ids = itens.map(i => i.id)

      // Excluir parcelas vinculadas
      const { data: pedidos } = await supabase
        .from('pedidos').select('id').in('item_compra_id', ids)
      if (pedidos && pedidos.length > 0) {
        const pedidoIds = pedidos.map(p => p.id)
        const chunkSize = 50
        for (let i = 0; i < pedidoIds.length; i += chunkSize) {
          const chunk = pedidoIds.slice(i, i + chunkSize)
          await supabase.from('parcelas').delete().in('pedido_id', chunk)
          await supabase.from('pedidos').delete().in('id', chunk)
        }
      }

      // Excluir itens
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase.from('itens_compra').delete().in('id', chunk)
        if (error) throw error
      }

      await supabase.from('audit_logs').insert({
        company_id: itens[0]?.company_id,
        tabela: 'itens_compra',
        acao: 'DELETE', agente: 'humano',
        dados_antes: { quantidade: itens.length, ids: itens.map(r => r.id), itens: itens.map(i => ({ id: i.id, codigo: i.codigo, descricao: i.descricao })) },
        dados_depois: null,
      })

      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success(`${itens.length} itens excluídos`)
      onDone(); onClose()
    } catch (err) { toast.error('Erro ao excluir: ' + (err as Error).message) } finally { setSaving(false) }
  }

  return (
    <Modal title={`Excluir ${itens.length} itens de compra`} onClose={onClose}>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-semibold">Ação irreversível</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Serão excluídos {itens.length} itens e todos os pedidos e parcelas vinculados.
        </p>
      </div>

      <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {itens.map(i => (
          <div key={i.id} className="py-0.5 text-[11px]">
            <span className="font-mono text-muted-foreground">{i.codigo}</span> — {i.descricao}
          </div>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          className="h-4 w-4 rounded accent-red-500" />
        <span className="text-xs text-red-500 font-medium">
          Confirmo a exclusão permanente de {itens.length} itens
        </span>
      </label>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Excluir permanentemente"
        variant="danger" disabled={!confirmed} />
    </Modal>
  )
}
