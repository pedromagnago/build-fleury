import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  type Parcela,
  useContasBancarias,
  useUpdateParcela,
  useEstornarParcela,
} from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import {
  X, Pencil, RotateCcw, ChevronRight, Building2, Package, Layers, FileText, CreditCard, AlertTriangle,
} from 'lucide-react'

const INPUT = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50'
const LABEL = 'mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wider'

interface Props {
  parcela: Parcela
  onClose: () => void
  onDone: () => void
}

interface ParcelaDetail {
  etapa_nome?: string
  etapa_codigo?: string
  item_descricao?: string
  item_codigo?: string
  fornecedor_nome?: string
  fornecedor_cnpj?: string
  cond_pagamento?: string
  numero_pedido?: number
}

export default function EditParcelaModal({ parcela, onClose, onDone }: Props) {
  const qc = useQueryClient()
  const { data: contas = [] } = useContasBancarias()
  const updateParcela = useUpdateParcela()
  const estornarParcela = useEstornarParcela()

  const isPaid = parcela.status === 'paga' || !!parcela.data_pagamento_real

  // Form state
  const [form, setForm] = useState({
    valor: String(parcela.valor),
    valor_pago: String(parcela.valor_pago ?? 0),
    data_vencimento: parcela.data_vencimento,
    data_pagamento_real: parcela.data_pagamento_real ?? '',
    forma_pagamento: parcela.forma_pagamento ?? '',
    conta_bancaria_id: parcela.conta_bancaria_id ?? '',
    status: parcela.status,
    observacoes: parcela.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [showEstorno, setShowEstorno] = useState(false)

  // Rastreabilidade (drill-down)
  const [detail, setDetail] = useState<ParcelaDetail | null>(null)
  useEffect(() => {
    if (!parcela.pedido_id) return
    ;(async () => {
      const { data: ped } = await supabase
        .from('pedidos')
        .select(`
          numero_pedido, cond_pagamento, fornecedor_id,
          itens_compra!inner(descricao, codigo, etapa_id, etapas(nome, codigo)),
          fornecedores(nome, cnpj, cond_pagamento_padrao)
        `)
        .eq('id', parcela.pedido_id!)
        .single()
      if (!ped) return
      const item = ped.itens_compra as any
      const forn = ped.fornecedores as any
      const etapa = item?.etapas as any
      setDetail({
        etapa_nome: etapa?.nome ?? null,
        etapa_codigo: etapa?.codigo ?? null,
        item_descricao: item?.descricao ?? null,
        item_codigo: item?.codigo ?? null,
        fornecedor_nome: forn?.nome ?? null,
        fornecedor_cnpj: forn?.cnpj ?? null,
        cond_pagamento: ped.cond_pagamento ?? forn?.cond_pagamento_padrao ?? null,
        numero_pedido: ped.numero_pedido,
      })
    })()
  }, [parcela.pedido_id])

  const valorNum = parseFloat(form.valor) || 0
  const valorPagoNum = parseFloat(form.valor_pago) || 0
  const saldoRestante = valorNum - valorPagoNum

  const computeStatus = () => {
    if (valorPagoNum >= valorNum && valorNum > 0) return 'paga'
    if (valorPagoNum > 0 && valorPagoNum < valorNum) return 'parcialmente_paga'
    const today = new Date().toISOString().split('T')[0]!
    if (form.data_vencimento < today) return 'vencida'
    return 'a_vencer'
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const newStatus = computeStatus()
      await updateParcela.mutateAsync({
        id: parcela.id,
        valor: valorNum,
        valor_pago: valorPagoNum,
        data_vencimento: form.data_vencimento,
        data_pagamento_real: form.data_pagamento_real || null,
        forma_pagamento: form.forma_pagamento || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        status: newStatus,
        observacoes: form.observacoes || null,
      })
      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: parcela.company_id,
        tabela: 'parcelas',
        acao: 'UPDATE',
        agente: 'humano',
        dados_antes: {
          valor: parcela.valor,
          valor_pago: parcela.valor_pago,
          status: parcela.status,
          data_vencimento: parcela.data_vencimento,
        },
        dados_depois: {
          valor: valorNum,
          valor_pago: valorPagoNum,
          status: newStatus,
          data_vencimento: form.data_vencimento,
        },
      })
      onDone()
    } catch (err) {
      toast.error('Erro ao salvar: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleEstornar = async () => {
    try {
      await estornarParcela.mutateAsync(parcela.id)
      onDone()
    } catch {}
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Editar Parcela</h3>
              <p className="text-xs text-muted-foreground">
                {parcela.descricao || parcela.pedido_item || 'Avulsa'} · P{parcela.numero_parcela}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Rastreabilidade */}
          {detail && (
            <div className="mb-5 rounded-xl border bg-muted/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Rastreabilidade
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {detail.etapa_nome && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-blue-600 font-medium">
                      <Layers className="h-3 w-3" />
                      {detail.etapa_codigo}: {detail.etapa_nome}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
                {detail.item_descricao && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-600 font-medium">
                      <Package className="h-3 w-3" />
                      {detail.item_codigo}: {detail.item_descricao}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </>
                )}
                {detail.fornecedor_nome && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-600 font-medium">
                      <Building2 className="h-3 w-3" />
                      {detail.fornecedor_nome}
                    </span>
                  </>
                )}
                {detail.cond_pagamento && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary font-medium">
                      <CreditCard className="h-3 w-3" />
                      Cond: {detail.cond_pagamento}
                    </span>
                  </>
                )}
                {detail.numero_pedido && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-foreground font-medium">
                      <FileText className="h-3 w-3" />
                      Pedido #{detail.numero_pedido}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <form id="edit-parcela-form" onSubmit={handleSave} className="space-y-4">
            {/* Row 1: Valores */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Valor Original (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                  className={INPUT}
                  required
                />
              </div>
              <div>
                <label className={LABEL}>Valor Pago (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={form.valor}
                  value={form.valor_pago}
                  onChange={e => setForm(p => ({ ...p, valor_pago: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Saldo Restante</label>
                <div className={`flex h-9 items-center rounded-lg border px-3 text-sm font-bold ${
                  saldoRestante > 0 ? 'text-amber-600 bg-amber-500/5 border-amber-500/20' :
                  saldoRestante === 0 ? 'text-emerald-600 bg-emerald-500/5 border-emerald-500/20' :
                  'text-red-600 bg-red-500/5 border-red-500/20'
                }`}>
                  {formatCurrency(saldoRestante)}
                </div>
              </div>
            </div>

            {/* Low partial indicator */}
            {valorPagoNum > 0 && valorPagoNum < valorNum && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
                <CreditCard className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>Baixa parcial:</strong> {formatCurrency(valorPagoNum)} de {formatCurrency(valorNum)} ({Math.round(valorPagoNum / valorNum * 100)}%).
                  Saldo de {formatCurrency(saldoRestante)} será mantido como pendente.
                </p>
              </div>
            )}

            {/* Row 2: Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Vencimento</label>
                <input
                  type="date"
                  value={form.data_vencimento}
                  onChange={e => setForm(p => ({ ...p, data_vencimento: e.target.value }))}
                  className={INPUT}
                  required
                />
              </div>
              <div>
                <label className={LABEL}>Data Pagamento Real</label>
                <input
                  type="date"
                  value={form.data_pagamento_real}
                  onChange={e => setForm(p => ({ ...p, data_pagamento_real: e.target.value }))}
                  className={INPUT}
                />
              </div>
            </div>

            {/* Row 3: Forma + Conta */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Forma de Pagamento</label>
                <select
                  value={form.forma_pagamento}
                  onChange={e => setForm(p => ({ ...p, forma_pagamento: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">—</option>
                  <option value="PIX">PIX</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Conta Bancária</label>
                <select
                  value={form.conta_bancaria_id}
                  onChange={e => setForm(p => ({ ...p, conta_bancaria_id: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Nenhuma</option>
                  {contas.filter(c => c.ativa).map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className={LABEL}>Observações</label>
              <textarea
                value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                className={`${INPUT} h-16 resize-none`}
                placeholder="Justificativa de alteração, detalhes..."
              />
            </div>

            {/* Status Preview */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-xs text-muted-foreground">Status calculado</span>
              <StatusBadge status={computeStatus()} />
            </div>
          </form>

          {/* Estorno */}
          {isPaid && (
            <div className="mt-4 border-t pt-4">
              {!showEstorno ? (
                <button
                  onClick={() => setShowEstorno(true)}
                  className="flex items-center gap-2 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Estornar parcela (desfazer pagamento)
                </button>
              ) : (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-600">Confirmar Estorno</p>
                      <p className="text-[11px] text-red-600/70 mt-0.5">
                        O pagamento será revertido. Status volta para "A Vencer", valor pago zerado.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEstornar}
                      disabled={estornarParcela.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {estornarParcela.isPending ? 'Estornando...' : 'Confirmar Estorno'}
                    </button>
                    <button
                      onClick={() => setShowEstorno(false)}
                      className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            form="edit-parcela-form"
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    paga: { label: 'Paga', cls: 'bg-emerald-500/10 text-emerald-600' },
    parcialmente_paga: { label: 'Parcialmente Paga', cls: 'bg-blue-500/10 text-blue-600' },
    vencida: { label: 'Vencida', cls: 'bg-red-500/10 text-red-600' },
    a_vencer: { label: 'A Vencer', cls: 'bg-amber-500/10 text-amber-600' },
    futura: { label: 'Futura', cls: 'bg-muted text-muted-foreground' },
  }
  const c = cfg[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' }
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}
