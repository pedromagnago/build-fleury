import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { useDropzone } from 'react-dropzone'
import { X, Check, Upload, CircleDollarSign } from 'lucide-react'

const INPUT = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50'
const LABEL = 'mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wider'

export interface RecebimentoBaixaItem {
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
  item: RecebimentoBaixaItem
  onClose: () => void
  onDone: () => void
}

export default function RecebimentoBaixaModal({ item, onClose, onDone }: Props) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: contas = [] } = useContasBancarias()

  const saldoRestante = (() => {
    if (item.origem === 'medicao') {
      return Math.max(0, Number(item.raw.valor_planejado ?? item.valor_total) - Number(item.raw.valor_liberado ?? 0))
    }
    if (item.origem === 'adiantamento') {
      return Math.max(0, Number(item.raw.valor ?? item.valor_total) - Number(item.raw.valor_pago ?? 0))
    }
    // captacao
    const concEntrada = Number(item.raw.valor_conciliado_entrada ?? 0)
    const concSaida = Number(item.raw.valor_conciliado_saida ?? 0)
    return Math.max(0, Number(item.valor_total) - concEntrada - concSaida)
  })()

  const [form, setForm] = useState({
    data_recebimento: new Date().toISOString().split('T')[0]!,
    valor_recebido: saldoRestante > 0 ? saldoRestante.toFixed(2) : item.valor_total.toFixed(2),
    forma_recebimento: 'PIX',
    conta_bancaria_id: contas.find(c => c.ativa)?.id ?? '',
    observacoes: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 1,
    onDrop: (files) => setFile(files[0] ?? null),
  })

  const handleConfirmar = async () => {
    const valorRecebido = parseFloat(form.valor_recebido.replace(',', '.')) || 0
    if (valorRecebido <= 0) {
      toast.error('Informe um valor maior que zero')
      return
    }
    if (!form.conta_bancaria_id) {
      toast.error('Selecione a conta bancária')
      return
    }
    if (!currentCompany) {
      toast.error('Empresa não encontrada')
      return
    }

    // Anti-duplicação
    const fkCol =
      item.origem === 'medicao' ? 'medicao_id' :
      item.origem === 'adiantamento' ? 'mutuo_parcela_id' :
      'mutuo_id'
    const { data: existentes } = await supabase
      .from('conciliacao_parcelas')
      .select('conciliacao_id')
      .eq(fkCol, item.raw.id)
    if ((existentes ?? []).length > 0) {
      const ok = window.confirm(
        `Já existe uma conciliação vinculada a este recebimento.\n\n` +
        `Registrar agora vai criar OUTRA movimentação no extrato (possível duplicação).\n\n` +
        `Clique OK para registrar mesmo assim, ou Cancelar para revisar.`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      // 1. Upload comprovante
      let comprovantePath: string | null = null
      if (file && currentCompany) {
        const filePath = `${currentCompany.id}/recebimentos/${item.raw.id}/${file.name}`
        const { error: upErr } = await supabase.storage
          .from('comprovantes')
          .upload(filePath, file, { upsert: true })
        if (upErr) console.error('Upload comprovante:', upErr)
        else comprovantePath = filePath
      }

      // 2. Criar movimentação bancária PRIMEIRO — se falhar, origem não é tocada
      const descLabel =
        item.origem === 'medicao' ? `Recebimento: ${item.descricao}` :
        item.origem === 'adiantamento' ? `Devolução: ${item.descricao}` :
        `Captação: ${item.descricao}`

      const { data: movRow, error: eMov } = await supabase
        .from('movimentacoes_bancarias')
        .insert({
          company_id: currentCompany.id,
          conta_id: form.conta_bancaria_id,
          data: form.data_recebimento,
          descricao: descLabel,
          valor: valorRecebido,
          tipo: 'entrada',
        })
        .select('id')
        .single()
      if (eMov) throw eMov
      if (!movRow) throw new Error('Movimentação não criada')

      // 3. Atualizar origem (só após movimentação criada com sucesso)
      if (item.origem === 'medicao') {
        const novoLiberado = Number(item.raw.valor_liberado ?? 0) + valorRecebido
        const total = Number(item.raw.valor_planejado ?? item.valor_total)
        const novoStatus = novoLiberado >= total - 0.01 ? 'paga' : 'em_medicao'
        const { error } = await supabase.from('medicoes').update({
          valor_liberado: novoLiberado,
          status: novoStatus,
          data_liberacao: form.data_recebimento,
        }).eq('id', item.raw.id)
        if (error) throw error
      } else if (item.origem === 'adiantamento') {
        const novoPago = Number(item.raw.valor_pago ?? 0) + valorRecebido
        const total = Number(item.raw.valor ?? item.valor_total)
        const novoStatus = novoPago >= total - 0.01 ? 'paga' : 'parcialmente_paga'
        const { error } = await supabase.from('mutuo_parcelas').update({
          valor_pago: novoPago,
          data_pagamento_real: form.data_recebimento,
          status: novoStatus,
        }).eq('id', item.raw.id)
        if (error) throw error
      }
      // captacao: status derivado pelas conciliações — sem UPDATE direto

      // 4. Criar conciliação aprovada
      const { data: concRow, error: eConc } = await supabase
        .from('conciliacoes')
        .insert({
          company_id: currentCompany.id,
          movimentacao_id: movRow.id,
          match_type: 'manual',
          confidence: 100,
          status: 'aprovado',
        })
        .select('id')
        .single()
      if (eConc) throw eConc
      if (!concRow) throw new Error('Conciliação não criada')

      // 5. Vincular conciliação à origem
      const linkRow: Record<string, unknown> = {
        conciliacao_id: concRow.id,
        valor_aplicado: valorRecebido,
      }
      if (item.origem === 'medicao') linkRow.medicao_id = item.raw.id
      else if (item.origem === 'adiantamento') linkRow.mutuo_parcela_id = item.raw.id
      else linkRow.mutuo_id = item.raw.id

      const { error: eCp } = await supabase.from('conciliacao_parcelas').insert(linkRow)
      if (eCp) throw eCp

      // 6. Audit log
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: item.origem === 'medicao' ? 'medicoes' : item.origem === 'adiantamento' ? 'mutuo_parcelas' : 'mutuos',
        registro_id: item.raw.id,
        acao: 'UPDATE',
        agente: 'humano',
        dados_antes: { operacao: 'baixa_recebimento', status: item.status, origem: item.origem },
        dados_depois: {
          valor_recebido: valorRecebido,
          data: form.data_recebimento,
          forma: form.forma_recebimento,
          mov_id: movRow.id,
          conc_id: concRow.id,
          ...(comprovantePath ? { comprovante: comprovantePath } : {}),
        },
      })

      // 7. Invalidar
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['medicoes'] }),
        qc.invalidateQueries({ queryKey: ['mutuos'] }),
        qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
        qc.invalidateQueries({ queryKey: ['conciliacoes'] }),
        qc.invalidateQueries({ queryKey: ['parcelas'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
      ])

      toast.success('Recebimento registrado com sucesso')
      onDone()
    } catch (err) {
      console.error('[RecebimentoBaixaModal]', err)
      const e = err as any
      const msg = e?.message ?? e?.details ?? e?.hint ?? String(err)
      toast.error(`Erro: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const origemLabel =
    item.origem === 'medicao' ? 'Medição' :
    item.origem === 'adiantamento' ? 'Adiantamento' :
    'Capital de Giro'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-bold">Registrar Recebimento</h2>
              <p className="text-xs text-muted-foreground">{origemLabel} · {item.parceiro ?? '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Resumo do item */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium truncate">{item.descricao}</p>
            <div className="mt-1 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span>Total: <span className="font-semibold text-foreground">{formatCurrency(item.valor_total)}</span></span>
              {saldoRestante < item.valor_total && (
                <span>Saldo: <span className="font-semibold text-emerald-600">{formatCurrency(saldoRestante)}</span></span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Data do Recebimento *</label>
              <input
                type="date"
                value={form.data_recebimento}
                onChange={e => setForm(f => ({ ...f, data_recebimento: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Valor Recebido (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={saldoRestante > 0 ? saldoRestante + 0.01 : undefined}
                value={form.valor_recebido}
                onChange={e => setForm(f => ({ ...f, valor_recebido: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Conta Bancária *</label>
              <select
                value={form.conta_bancaria_id}
                onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}
                className={INPUT}
              >
                <option value="">Selecione...</option>
                {contas.filter(c => c.ativa).map(c => (
                  <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` (${c.banco})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Forma de Recebimento</label>
              <select
                value={form.forma_recebimento}
                onChange={e => setForm(f => ({ ...f, forma_recebimento: e.target.value }))}
                className={INPUT}
              >
                <option value="PIX">PIX</option>
                <option value="TED">TED/DOC</option>
                <option value="Boleto">Boleto</option>
                <option value="Depósito">Depósito</option>
                <option value="Cheque">Cheque</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>

          {/* Comprovante */}
          <div>
            <label className={LABEL}>Comprovante (opcional)</label>
            <div
              {...getRootProps()}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors ${
                isDragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:border-emerald-500/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-4 w-4 text-muted-foreground" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                <span className="text-muted-foreground">Arraste PDF/JPG/PNG ou clique para selecionar</span>
              )}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className={LABEL}>Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={2}
              className={`${INPUT} h-auto resize-none`}
              placeholder="Notas sobre o recebimento (opcional)"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={saving || !form.conta_bancaria_id}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {saving ? 'Processando…' : 'Confirmar Recebimento'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
