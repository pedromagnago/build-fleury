import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { type Parcela, useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { exportToExcel } from '@/lib/exportExcel'
import { toast } from 'sonner'
import {
  X, CreditCard, CalendarClock, Download, AlertTriangle, ArrowRight, Trash2, Pencil, RotateCcw,
} from 'lucide-react'

interface Props {
  parcelas: Parcela[]
  selectedIds: Set<string>
  fornecedorMap: Map<string, string> // pedido_id -> fornecedor name
  onDone: () => void
}

type ModalType = 'pagar' | 'adiar' | 'excluir' | 'editar' | 'estornar' | null

export default function PagamentosBulkActions({ parcelas, selectedIds, fornecedorMap, onDone }: Props) {
  const [modal, setModal] = useState<ModalType>(null)
  const selected = useMemo(() => parcelas.filter(p => selectedIds.has(p.id)), [parcelas, selectedIds])
  const hasPagas = selected.some(p => p.status === 'paga')

  return (
    <>
      <BulkBtn icon={CreditCard} label="Pagar" onClick={() => setModal('pagar')} />
      <BulkBtn icon={Pencil} label="Editar em Lote" onClick={() => setModal('editar')} />
      <BulkBtn icon={CalendarClock} label="Adiar" onClick={() => setModal('adiar')} />
      <BulkBtn icon={Download} label="Exportar" onClick={() => handleExport(selected, fornecedorMap)} />
      {hasPagas && <BulkBtn icon={RotateCcw} label="Estornar" onClick={() => setModal('estornar')} />}
      <BulkBtn icon={Trash2} label="Excluir" onClick={() => setModal('excluir')} />

      {modal === 'pagar' && <PagarLoteModal parcelas={selected} fornecedorMap={fornecedorMap} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'adiar' && <AdiarModal parcelas={selected} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'excluir' && <ExcluirLoteModal parcelas={selected} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'editar' && <EditarLoteModal parcelas={selected} onClose={() => setModal(null)} onDone={onDone} />}
      {modal === 'estornar' && <EstornarLoteModal parcelas={selected.filter(p => p.status === 'paga')} onClose={() => setModal(null)} onDone={onDone} />}
    </>
  )
}

function BulkBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent">
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Pagar em lote
// ---------------------------------------------------------------------------
function PagarLoteModal({ parcelas, fornecedorMap, onClose, onDone }: {
  parcelas: Parcela[]; fornecedorMap: Map<string, string>; onClose: () => void; onDone: () => void
}) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: contas = [] } = useContasBancarias()
  const [dataPgto, setDataPgto] = useState(new Date().toISOString().split('T')[0]!)
  const [formaPgto, setFormaPgto] = useState('pix')
  const [contaId, setContaId] = useState('')
  const [saving, setSaving] = useState(false)

  const total = parcelas.reduce((s, p) => s + (p.valor - p.valor_pago), 0)
  const contaSelecionada = contas.find(c => c.id === contaId)
  const saldoApos = contaSelecionada ? contaSelecionada.saldo_inicial - total : null

  const handleConfirm = async () => {
    if (!contaId) { toast.error('Selecione uma conta'); return }
    setSaving(true)
    try {
      for (const p of parcelas) {
        const valorPagar = p.valor - p.valor_pago
        // Update parcela
        await supabase.from('parcelas').update({
          data_pagamento_real: dataPgto,
          valor_pago: p.valor,
          forma_pagamento: formaPgto,
          conta_bancaria_id: contaId,
          status: 'paga',
        }).eq('id', p.id)

        // Update item consumido via pedido
        if (p.pedido_id) {
          const { data: pedido } = await supabase.from('pedidos').select('item_compra_id').eq('id', p.pedido_id).single()
          if (pedido) {
            const { data: item } = await supabase.from('itens_compra').select('valor_consumido').eq('id', pedido.item_compra_id).single()
            if (item) {
              await supabase.from('itens_compra').update({
                valor_consumido: (item.valor_consumido ?? 0) + valorPagar,
              }).eq('id', pedido.item_compra_id)
            }
          }
        }

        // Create movimentação + conciliacao auto (visivel na Conciliacao + Fluxo)
        const { data: movRow, error: eMov } = await supabase.from('movimentacoes_bancarias').insert({
          company_id: currentCompany?.id,
          conta_id: contaId,
          data: dataPgto,
          descricao: `Pgto lote - ${fornecedorMap.get(p.pedido_id ?? '') ?? 'N/A'}`,
          valor: valorPagar,
          tipo: 'saida',
          parcela_id: p.id,
        }).select('id').single()
        if (eMov) throw eMov
        if (movRow) {
          const { data: concRow, error: eConc } = await supabase.from('conciliacoes').insert({
            company_id: currentCompany?.id,
            movimentacao_id: movRow.id,
            match_type: 'manual',
            confidence: 100,
            status: 'aprovado',
          }).select('id').single()
          if (eConc) throw eConc
          if (concRow) {
            await supabase.from('conciliacao_parcelas').insert({
              conciliacao_id: concRow.id,
              parcela_id: p.id,
              valor_aplicado: valorPagar,
            })
          }
        }
      }

      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id, tabela: 'parcelas',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'pagar_lote', parcelas: parcelas.length, ids: parcelas.map(p => p.id) },
        dados_depois: { total, forma_pagamento: formaPgto, conta_id: contaId },
      })

      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['contas_bancarias'] })
      toast.success(`${parcelas.length} parcelas pagas — ${formatCurrency(total)}`)
      onDone(); onClose()
    } catch { toast.error('Erro ao processar pagamentos') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Pagar ${parcelas.length} parcelas`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data pagamento</label>
            <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Forma</label>
            <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="cartao">Cartão</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta bancária</label>
            <select value={contaId} onChange={e => setContaId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">Selecione...</option>
              {contas.filter(c => c.ativa).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Preview */}
        <div className="max-h-40 overflow-y-auto rounded-lg border">
          <table className="tbl-bf w-full text-[11px]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
                <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                <th className="px-2 py-1.5 text-center font-medium">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1 truncate max-w-[140px]">{fornecedorMap.get(p.pedido_id ?? '') ?? '—'}</td>
                  <td className="px-2 py-1 text-right font-medium">{formatCurrency(p.valor - p.valor_pago)}</td>
                  <td className="px-2 py-1 text-center">{fmtDt(p.data_vencimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <span className="text-sm font-semibold">Total a pagar</span>
          <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
        </div>

        {saldoApos !== null && (
          <div className={`flex items-center justify-between rounded-lg p-3 ${saldoApos < 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            <span className="text-xs">Saldo após pgto</span>
            <span className={`text-sm font-bold ${saldoApos < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {formatCurrency(saldoApos)}
            </span>
            {saldoApos < 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
          </div>
        )}
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Confirmar pagamentos" variant="emerald" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Adiar
// ---------------------------------------------------------------------------
function AdiarModal({ parcelas, onClose, onDone }: { parcelas: Parcela[]; onClose: () => void; onDone: () => void }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [delta, setDelta] = useState(7)
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => parcelas.map(p => ({
    ...p,
    novaData: shiftDate(p.data_vencimento, delta),
  })), [parcelas, delta])

  const handleConfirm = async () => {
    if (delta === 0) { toast.error('Delta não pode ser 0'); return }
    setSaving(true)
    try {
      for (const p of parcelas) {
        const novaData = shiftDate(p.data_vencimento, delta)
        await supabase.from('parcelas').update({ data_vencimento: novaData }).eq('id', p.id)
      }
      await supabase.from('audit_logs').insert({
        company_id: currentCompany?.id, tabela: 'parcelas',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'adiar_parcelas', parcelas: parcelas.length, ids: parcelas.map(p => p.id) },
        dados_depois: { delta },
      })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success(`${parcelas.length} parcelas adiadas em ${delta} dias`)
      onDone(); onClose()
    } catch { toast.error('Erro ao adiar') } finally { setSaving(false) }
  }

  return (
    <Modal title={`Adiar ${parcelas.length} parcelas`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deslocar em dias</label>
          <input type="number" value={delta} onChange={e => setDelta(Number(e.target.value))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" min="1" />
        </div>

        <div className="max-h-40 overflow-y-auto rounded-lg border">
          <table className="tbl-bf w-full text-[11px]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">#</th>
                <th className="px-2 py-1.5 text-center font-medium">Antes</th>
                <th className="px-2 py-1.5 text-center font-medium">Depois</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1">P{p.numero_parcela}</td>
                  <td className="px-2 py-1 text-center text-muted-foreground">{fmtDt(p.data_vencimento)}</td>
                  <td className="px-2 py-1 text-center">
                    <ArrowRight className="mx-1 inline h-2.5 w-2.5" />
                    <span className="font-medium text-blue-500">{fmtDt(p.novaData)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Adiar parcelas" variant="amber" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function handleExport(parcelas: Parcela[], fornecedorMap: Map<string, string>) {
  const data = parcelas.map(p => ({
    '#': p.numero_parcela, 'Fornecedor': fornecedorMap.get(p.pedido_id ?? '') ?? '',
    'Valor': p.valor, 'Pago': p.valor_pago, 'Saldo': p.valor - p.valor_pago,
    'Vencimento': p.data_vencimento, 'Status': p.status,
  }))
  exportToExcel(data, `parcelas_${new Date().toISOString().split('T')[0]}`, 'Parcelas')
  toast.success(`${parcelas.length} parcelas exportadas`)
}

// Shared UI
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
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

function Footer({ onClose, onConfirm, saving, label, variant }: {
  onClose: () => void; onConfirm: () => void; saving: boolean; label: string; variant?: 'emerald' | 'amber' | 'destructive'
}) {
  const btn = variant === 'emerald' ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : variant === 'amber' ? 'bg-amber-600 text-white hover:bg-amber-700'
    : variant === 'destructive' ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-primary text-primary-foreground hover:opacity-90'
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
      <button onClick={onConfirm} disabled={saving} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${btn}`}>
        {saving ? 'Processando...' : label}
      </button>
    </div>
  )
}

function shiftDate(dateStr: string, delta: number): string {
  const d = localDate(dateStr)
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]!
}

function fmtDt(d: string): string {
  return localDate(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ---------------------------------------------------------------------------
// Excluir Lote
// ---------------------------------------------------------------------------
function ExcluirLoteModal({ parcelas, onClose, onDone }: { parcelas: Parcela[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const ids = parcelas.map(p => p.id)
      const chunkSize = 50
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase.from('parcelas').delete().in('id', chunk)
        if (error) throw error
      }

      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success(`${parcelas.length} parcelas excluídas com sucesso`)
      onDone()
      onClose()
    } catch (err: any) {
      toast.error('Erro ao excluir parcelas: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Excluir ${parcelas.length} parcelas`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Atenção
          </p>
          <p className="mt-1">
            Esta ação excluirá permanentemente as <strong>{parcelas.length}</strong> parcelas selecionadas.
            As compras ou pedidos originadores não serão afetados. Deseja continuar?
          </p>
        </div>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Excluir parcelas" variant="destructive" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Editar em Lote
// ---------------------------------------------------------------------------
function EditarLoteModal({ parcelas, onClose, onDone }: { parcelas: Parcela[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const { data: contas = [] } = useContasBancarias()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    forma_pagamento: '',
    conta_bancaria_id: '',
    observacoes: '',
  })

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const updates: any = {}
      if (form.forma_pagamento) updates.forma_pagamento = form.forma_pagamento
      if (form.conta_bancaria_id) updates.conta_bancaria_id = form.conta_bancaria_id
      if (form.observacoes) updates.observacoes = form.observacoes

      if (Object.keys(updates).length === 0) {
        toast.error('Preencha ao menos um campo para editar')
        setSaving(false)
        return
      }

      const ids = parcelas.map(p => p.id)
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        const { error } = await supabase.from('parcelas').update(updates).in('id', chunk)
        if (error) throw error
      }

      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success(`${parcelas.length} parcelas atualizadas`)
      onDone()
      onClose()
    } catch (err: any) {
      toast.error('Erro: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Editar ${parcelas.length} parcelas em lote`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Preencha apenas os campos que deseja alterar. Campos vazios não serão modificados.</p>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Forma de Pagamento</label>
          <select value={form.forma_pagamento} onChange={e => setForm(p => ({ ...p, forma_pagamento: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">— Não alterar —</option>
            <option value="PIX">PIX</option>
            <option value="Boleto">Boleto</option>
            <option value="Transferência">Transferência</option>
            <option value="Cheque">Cheque</option>
            <option value="Cartão">Cartão</option>
            <option value="Dinheiro">Dinheiro</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conta Bancária</label>
          <select value={form.conta_bancaria_id} onChange={e => setForm(p => ({ ...p, conta_bancaria_id: e.target.value }))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">— Não alterar —</option>
            {contas.filter(c => c.ativa).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Observações (append)</label>
          <input type="text" value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Texto a adicionar..." className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Aplicar Alterações" />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Estornar em Lote
// ---------------------------------------------------------------------------
function EstornarLoteModal({ parcelas, onClose, onDone }: { parcelas: Parcela[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const totalPago = parcelas.reduce((s, p) => s + (p.valor_pago ?? 0), 0)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const ids = parcelas.map(p => p.id)
      // 1) Localiza conciliacoes vinculadas a essas parcelas
      const { data: links } = await supabase
        .from('conciliacao_parcelas')
        .select('conciliacao_id, parcela_id')
        .in('parcela_id', ids)
      const concIds = Array.from(new Set((links ?? []).map((l: any) => l.conciliacao_id as string)))

      if (concIds.length > 0) {
        // 2) Pega movs dessas conciliacoes para deletar tambem
        const { data: concs } = await supabase
          .from('conciliacoes').select('movimentacao_id').in('id', concIds)
        const movIds = Array.from(new Set((concs ?? []).map((c: any) => c.movimentacao_id as string)))

        // 3) Deleta links -> conciliacoes -> movs (ordem importa por FK)
        await supabase.from('conciliacao_parcelas').delete().in('conciliacao_id', concIds)
        await supabase.from('conciliacoes').delete().in('id', concIds)
        if (movIds.length > 0) {
          await supabase.from('movimentacoes_bancarias').delete().in('id', movIds)
        }
      }

      // 4) Zera as parcelas
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        const { error } = await supabase.from('parcelas').update({
          status: 'a_vencer',
          valor_pago: 0,
          data_pagamento_real: null,
          forma_pagamento: null,
          comprovante_path: null,
        }).in('id', chunk)
        if (error) throw error
      }

      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['movimentacoes'] })
      qc.invalidateQueries({ queryKey: ['conciliacoes'] })
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      toast.success(`${parcelas.length} parcelas estornadas`)
      onDone()
      onClose()
    } catch (err: any) {
      toast.error('Erro ao estornar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Estornar ${parcelas.length} parcelas pagas`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Atenção — Estorno em lote
          </p>
          <p className="mt-1">
            Essa ação reverterá <strong>{parcelas.length}</strong> parcelas pagas (total: <strong>{formatCurrency(totalPago)}</strong>).
            O status voltará para "A Vencer" e valores pagos serão zerados.
          </p>
        </div>
      </div>
      <Footer onClose={onClose} onConfirm={handleConfirm} saving={saving} label="Confirmar Estorno" variant="destructive" />
    </Modal>
  )
}
