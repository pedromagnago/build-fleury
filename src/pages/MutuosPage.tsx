import { useState, useMemo, useEffect } from 'react'
import {
  Landmark, Plus, Trash2, Edit2, ChevronDown, ChevronUp, CheckCircle2,
  Clock, AlertTriangle, DollarSign, ArrowUpRight, ArrowDownRight,
  RotateCcw, Save, X, Tags, Search, TrendingDown,
} from 'lucide-react'
import {
  useMutuos, useCreateMutuo, useDeleteMutuo, useUpdateMutuo,
  useUpdateMutuoParcela, useCreateMutuoParcela, useDeleteMutuoParcela,
  useBatchDeleteMutuos, useBatchUpdateMutuosCategory,
} from '@/hooks/useMutuos'
import { useContasBancarias } from '@/hooks/useFinanceiro'
import { useFornecedores } from '@/hooks/useCompras'
import type { Mutuo, MutuoParcela } from '@/hooks/useMutuos'
import { PageHeader } from '@/components/ui/PageHeader'
import BulkActionBar from '@/components/BulkActionBar'
import { formatCurrency } from '@/lib/utils'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'
import { useSelection } from '@/hooks/useSelection'

// ─── Helpers ────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function parcelaBadgeCls(s: string) {
  if (s === 'paga') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
  if (s === 'vencida') return 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  if (s === 'parcialmente_paga') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

function parcelaStatusLabel(s: string) {
  const map: Record<string, string> = { pendente: 'Pendente', paga: 'Paga', vencida: 'Vencida', parcialmente_paga: 'Parcial' }
  return map[s] ?? s
}

function parseParcelasText(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[;\t]/)
    if (parts.length < 2) return null
    const dateStr = parts[0]!.trim()
    const valStr = parts[1]!.trim().replace(/[R$\s.]/g, '').replace(',', '.')
    const dateParts = dateStr.split('/')
    if (dateParts.length !== 3) return null
    const isoDate = `${dateParts[2]}-${dateParts[1]!.padStart(2, '0')}-${dateParts[0]!.padStart(2, '0')}`
    return { data_vencimento: isoDate, valor: parseFloat(valStr) || 0 }
  }).filter((p): p is { data_vencimento: string; valor: number } => p !== null && p.valor > 0)
}

export function mutuoDirecao(m: { categoria?: string | null; tipo?: string | null }): 'entrada' | 'saida' {
  const cat = String(m.categoria ?? '').toLowerCase()
  if (cat.includes('adiantamento a receber') || cat.includes('adiantamento feito') || cat.includes('emprestimo concedido') || cat.includes('empréstimo concedido')) {
    return 'saida'
  }
  return 'entrada'
}

const CATEGORIAS_ENTRADA = ['Capital de Giro', 'Mútuo Captação', 'Empréstimo Tomado', 'Financiamento', 'Cartão', 'Adiantamento Recebido']
const CATEGORIAS_SAIDA   = ['Adiantamento Feito', 'Empréstimo Concedido', 'Adiantamento a Receber']

const inputCls = 'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

type Tab = 'todos' | 'entrada' | 'saida'
type StatusFilter = 'todos' | 'ativo' | 'quitado' | 'inadimplente'

// ─── Mutuo Form Modal ────────────────────────────────────────

function MutuoFormModal({ open, onClose, initialData }: { open: boolean; onClose: () => void; initialData?: Mutuo | null }) {
  const createMutuo = useCreateMutuo()
  const updateMutuo = useUpdateMutuo()
  const isEditing = !!initialData

  const [form, setForm] = useState({
    direcao: 'entrada' as 'entrada' | 'saida',
    nome: '', tipo: 'MÚTUO' as Mutuo['tipo'], categoria: 'Capital de Giro',
    instituicao: '', fornecedor_id: '', valor_captado: '', data_captacao: '',
    taxa_juros_mensal: '', observacoes: '', status: 'ativo' as Mutuo['status'],
    conta_bancaria_id: '',
  })
  const [parcelasText, setParcelasText] = useState('')
  const { data: fornecedores } = useFornecedores()
  const { data: contasBancarias = [] } = useContasBancarias()

  useEffect(() => {
    if (open && initialData) {
      setForm({
        direcao: mutuoDirecao(initialData),
        nome: initialData.nome,
        tipo: initialData.tipo,
        categoria: initialData.categoria ?? 'Capital de Giro',
        instituicao: initialData.instituicao ?? '',
        fornecedor_id: initialData.fornecedor_id ?? '',
        valor_captado: String(initialData.valor_captado),
        data_captacao: initialData.data_captacao,
        taxa_juros_mensal: initialData.taxa_juros_mensal ? String(initialData.taxa_juros_mensal) : '',
        observacoes: initialData.observacoes ?? '',
        status: initialData.status ?? 'ativo',
        conta_bancaria_id: '',
      })
    } else if (open) {
      const contaPadrao = (contasBancarias as any[]).find(c => c.ativa && /caixa/i.test(c.nome))?.id
        ?? (contasBancarias as any[]).find(c => c.ativa)?.id
        ?? ''
      setForm({
        direcao: 'entrada', nome: '', tipo: 'MÚTUO', categoria: 'Capital de Giro',
        instituicao: '', fornecedor_id: '', valor_captado: '', data_captacao: '',
        taxa_juros_mensal: '', observacoes: '', status: 'ativo', conta_bancaria_id: contaPadrao,
      })
      setParcelasText('')
    }
  }, [open, initialData])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      nome: form.nome, tipo: form.tipo, categoria: form.categoria,
      instituicao: form.instituicao || null,
      fornecedor_id: form.fornecedor_id || null,
      valor_captado: parseFloat(form.valor_captado.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
      data_captacao: form.data_captacao,
      taxa_juros_mensal: parseFloat(form.taxa_juros_mensal.replace(',', '.')) || 0,
      observacoes: form.observacoes || null,
      status: form.status,
    }
    if (isEditing) {
      updateMutuo.mutate({ id: initialData!.id, ...payload } as any, { onSuccess: () => onClose() })
    } else {
      const parcelas = parseParcelasText(parcelasText)
      createMutuo.mutate({ mutuo: payload, parcelas, contaBancariaId: form.conta_bancaria_id || null }, { onSuccess: () => onClose() })
    }
  }

  const isSaving = createMutuo.isPending || updateMutuo.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-2xl rounded-xl border bg-card shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{isEditing ? 'Editar Operação' : 'Nova Operação Financeira'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{isEditing ? 'Altere os dados da operação' : 'Captação, empréstimo, adiantamento ou financiamento'}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Direção do dinheiro *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, direcao: 'entrada', categoria: CATEGORIAS_ENTRADA.includes(f.categoria) ? f.categoria : 'Capital de Giro' }))}
                className={`rounded-lg border p-3 text-left transition-colors ${form.direcao === 'entrada' ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/30' : 'hover:bg-muted/50'}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                  Entrada (Captação)
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Projeto recebeu dinheiro — capital de giro, empréstimo, financiamento, adiantamento de cliente</p>
              </button>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, direcao: 'saida', categoria: CATEGORIAS_SAIDA.includes(f.categoria) ? f.categoria : 'Adiantamento Feito' }))}
                className={`rounded-lg border p-3 text-left transition-colors ${form.direcao === 'saida' ? 'border-red-500 bg-red-500/5 ring-1 ring-red-500/30' : 'hover:bg-muted/50'}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                  Saída (Adiantamento/Empréstimo Feito)
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Projeto emprestou/adiantou para terceiro — volta via parcelas de devolução</p>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
              <input type="text" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inputCls} placeholder={form.direcao === 'entrada' ? 'Ex: Capital de Giro Bradesco' : 'Ex: Adiantamento Fornecedor X'} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo *</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as Mutuo['tipo'] })} className={inputCls}>
                <option value="MÚTUO">Mútuo</option>
                <option value="EMPRÉSTIMO">Empréstimo</option>
                <option value="FINANCIAMENTO">Financiamento</option>
                <option value="CARTÃO">Cartão de Crédito</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
              <input type="text" list="mutuo-cat-list" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputCls} placeholder="Ex: Capital de Giro" />
              <datalist id="mutuo-cat-list">
                {(form.direcao === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Mutuo['status'] })} className={inputCls}>
                <option value="ativo">Ativo</option>
                <option value="quitado">Quitado</option>
                <option value="inadimplente">Inadimplente</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fornecedor (Opcional)</label>
              <select value={form.fornecedor_id} onChange={e => setForm({ ...form, fornecedor_id: e.target.value })} className={inputCls}>
                <option value="">(Nenhum)</option>
                {fornecedores?.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Outra Instituição</label>
              <input type="text" value={form.instituicao} onChange={e => setForm({ ...form, instituicao: e.target.value })} className={inputCls} placeholder="Banco, pessoa, etc." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{form.direcao === 'entrada' ? 'Valor Captado' : 'Valor Emprestado'} (R$) *</label>
              <input type="text" required value={form.valor_captado} onChange={e => setForm({ ...form, valor_captado: e.target.value })} className={inputCls} placeholder="704.000,00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{form.direcao === 'entrada' ? 'Data Captação' : 'Data Empréstimo'} *</label>
              <input type="date" required value={form.data_captacao} onChange={e => setForm({ ...form, data_captacao: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa Juros Mensal (%)</label>
              <input type="text" value={form.taxa_juros_mensal} onChange={e => setForm({ ...form, taxa_juros_mensal: e.target.value })} className={inputCls} placeholder="1,5" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta Bancária {!isEditing && '*'}</label>
              <select value={form.conta_bancaria_id} onChange={e => setForm({ ...form, conta_bancaria_id: e.target.value })} className={inputCls} disabled={isEditing}>
                <option value="">Selecione...</option>
                {(contasBancarias as any[]).filter(c => c.ativa).map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              {!isEditing && <p className="mt-0.5 text-[10px] text-muted-foreground">Cria mov bancária + conciliação na data da captação.</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Observações</label>
              <input type="text" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} className={inputCls} placeholder="Notas adicionais" />
            </div>
          </div>
          {!isEditing && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {form.direcao === 'entrada' ? 'Parcelas de Devolução ao credor' : 'Parcelas de Devolução esperada (recebimento)'} — data;valor, uma por linha
              </label>
              <textarea value={parcelasText} onChange={e => setParcelasText(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} placeholder={`08/04/2026;9000,00\n08/04/2026;14716,35\n17/04/2026;32008,00`} />
              {parcelasText && (
                <p className="mt-1 text-xs text-muted-foreground">{parseParcelasText(parcelasText).length} parcela(s) — Total: {formatCurrency(parseParcelasText(parcelasText).reduce((s, p) => s + p.valor, 0))}</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">Cancelar</button>
            <button type="submit" disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isEditing ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isSaving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Cadastrar Mútuo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Parcela inline row ───────────────────────────────────────

function ParcelaRow({ parcela, onUpdate }: { parcela: MutuoParcela; mutuoId: string; onUpdate: ReturnType<typeof useUpdateMutuoParcela> }) {
  const deleteParcela = useDeleteMutuoParcela()
  const [editing, setEditing] = useState(false)
  const [editValor, setEditValor] = useState(String(parcela.valor))
  const [editDate, setEditDate] = useState(parcela.data_vencimento)
  const todayStr = new Date().toISOString().split('T')[0]!
  const isVencida = parcela.status !== 'paga' && parcela.data_vencimento < todayStr
  const isPaga = parcela.status === 'paga'

  const handleSaveEdit = () => {
    const newValor = parseFloat(editValor.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
    if (newValor <= 0) return
    onUpdate.mutate({ id: parcela.id, valor: newValor, data_vencimento: editDate })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="bg-primary/5">
        <td className="px-4 py-2 text-muted-foreground text-xs">{parcela.numero_parcela}</td>
        <td className="px-4 py-2"><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="rounded border bg-background px-2 py-1 text-xs w-32" /></td>
        <td className="px-4 py-2 text-right"><input type="text" value={editValor} onChange={e => setEditValor(e.target.value)} className="rounded border bg-background px-2 py-1 text-xs text-right w-28" /></td>
        <td className="px-4 py-2 text-right text-xs text-muted-foreground">{formatCurrency(Number(parcela.valor_pago || 0))}</td>
        <td className="px-4 py-2 text-center" />
        <td className="px-4 py-2">
          <div className="flex items-center justify-center gap-1">
            <button onClick={handleSaveEdit} disabled={onUpdate.isPending} className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Save className="h-3 w-3" /></button>
            <button onClick={() => { setEditing(false); setEditValor(String(parcela.valor)); setEditDate(parcela.data_vencimento) }} className="rounded-md bg-muted p-1.5 text-muted-foreground hover:bg-accent"><X className="h-3 w-3" /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b last:border-0 hover:bg-accent/40 transition-colors group">
      <td className="px-4 py-2 text-xs text-muted-foreground">{parcela.numero_parcela}</td>
      <td className="px-4 py-2 text-xs">{formatDate(parcela.data_vencimento)}</td>
      <td className="px-4 py-2 text-right text-xs font-medium">{formatCurrency(Number(parcela.valor))}</td>
      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{formatCurrency(Number(parcela.valor_pago || 0))}</td>
      <td className="px-4 py-2 text-center">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${parcelaBadgeCls(isVencida ? 'vencida' : parcela.status)}`}>
          {isVencida ? <><AlertTriangle className="h-3 w-3" />Vencida</> : isPaga ? <><CheckCircle2 className="h-3 w-3" />Paga</> : <><Clock className="h-3 w-3" />{parcelaStatusLabel(parcela.status)}</>}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-center gap-1">
          {isPaga ? (
            <button onClick={() => onUpdate.mutate({ id: parcela.id, status: 'pendente', valor_pago: 0, data_pagamento_real: null })} disabled={onUpdate.isPending}
              className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400 disabled:opacity-50">
              <RotateCcw className="h-3 w-3 inline mr-0.5" />Estornar
            </button>
          ) : (
            <button onClick={() => onUpdate.mutate({ id: parcela.id, status: 'paga', valor_pago: parcela.valor, data_pagamento_real: new Date().toISOString().split('T')[0]! })} disabled={onUpdate.isPending}
              className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400 disabled:opacity-50">
              Baixar
            </button>
          )}
          <button onClick={() => setEditing(true)} className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-opacity" title="Editar">
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={() => { if (window.confirm('Excluir esta parcela?')) deleteParcela.mutate(parcela.id) }} disabled={deleteParcela.isPending}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity disabled:opacity-50">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddParcelaRow({ mutuoId, nextNumero }: { mutuoId: string; nextNumero: number }) {
  const createParcela = useCreateMutuoParcela()
  const [show, setShow] = useState(false)
  const [valor, setValor] = useState('')
  const [date, setDate] = useState('')

  if (!show) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-2">
          <button onClick={() => setShow(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" />Adicionar parcela
          </button>
        </td>
      </tr>
    )
  }

  const handleAdd = () => {
    const numValor = parseFloat(valor.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
    if (numValor <= 0 || !date) return
    createParcela.mutate({ mutuo_id: mutuoId, valor: numValor, data_vencimento: date, numero_parcela: nextNumero }, {
      onSuccess: () => { setShow(false); setValor(''); setDate('') },
    })
  }

  return (
    <tr className="border-t bg-primary/5">
      <td className="px-4 py-2 text-xs text-muted-foreground">#{nextNumero}</td>
      <td className="px-4 py-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border bg-background px-2 py-1 text-xs w-32" /></td>
      <td className="px-4 py-2 text-right"><input type="text" value={valor} onChange={e => setValor(e.target.value)} className="rounded border bg-background px-2 py-1 text-xs text-right w-28" placeholder="0,00" /></td>
      <td /><td />
      <td className="px-4 py-2">
        <div className="flex items-center justify-center gap-1">
          <button onClick={handleAdd} disabled={createParcela.isPending} className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Plus className="h-3 w-3" /></button>
          <button onClick={() => setShow(false)} className="rounded-md bg-muted p-1.5 text-muted-foreground hover:bg-accent"><X className="h-3 w-3" /></button>
        </div>
      </td>
    </tr>
  )
}

// ─── MutuoRow (tabela) ───────────────────────────────────────

function MutuoRow({
  mutuo, onEdit, isSelected, onToggleSelect, isExpanded, onToggleExpand,
}: {
  mutuo: Mutuo
  onEdit: (m: Mutuo) => void
  isSelected: boolean
  onToggleSelect: () => void
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const deleteMutuo = useDeleteMutuo()
  const updateParcela = useUpdateMutuoParcela()
  const direcao = mutuoDirecao(mutuo)
  const ehSaida = direcao === 'saida'

  const parcelas = (mutuo.parcelas ?? []).sort((a, b) => a.numero_parcela - b.numero_parcela)
  const totalDevolucao = parcelas.reduce((s, p) => s + Number(p.valor), 0)
  const totalPago = parcelas.reduce((s, p) => s + Number(p.valor_pago || 0), 0)
  const nextNumero = parcelas.length > 0 ? Math.max(...parcelas.map(p => p.numero_parcela)) + 1 : 1

  const valorTotal = Number(mutuo.valor_captado)
  const entradaConciliada = Number(mutuo.valor_conciliado_entrada || 0)
  const saidaConciliada   = Number(mutuo.valor_conciliado_saida || 0)
  const conciliadoTotal = ehSaida ? saidaConciliada : entradaConciliada
  const saldo = Math.max(0, valorTotal - conciliadoTotal)

  const statusCls = mutuo.status === 'ativo'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
    : mutuo.status === 'quitado'
    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
    : 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  const statusLabel = { ativo: 'Ativo', quitado: 'Quitado', inadimplente: 'Inadimplente' }[mutuo.status ?? 'ativo'] ?? mutuo.status

  const pct = totalDevolucao > 0 ? Math.min(100, (totalPago / totalDevolucao) * 100) : 0
  const parceiro = (mutuo as any).fornecedor?.nome ?? mutuo.instituicao ?? '—'

  return (
    <>
      <tr className={`group transition-colors hover:bg-muted/20 ${isSelected ? 'bg-primary/5' : ''}`}>
        {/* Checkbox + expand */}
        <td className="px-2 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <input type="checkbox" checked={isSelected} onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded accent-primary" onClick={e => e.stopPropagation()} />
          </div>
        </td>
        {/* Status */}
        <td className="px-3 py-2.5 text-center">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>
            {statusLabel}
          </span>
        </td>
        {/* Direção */}
        <td className="px-3 py-2.5 text-center">
          {ehSaida
            ? <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600"><ArrowDownRight className="h-3 w-3" />Saída</span>
            : <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><ArrowUpRight className="h-3 w-3" />Entrada</span>
          }
        </td>
        {/* Nome */}
        <td className="px-3 py-2.5 max-w-[200px] truncate font-medium text-xs" title={mutuo.nome}>
          {mutuo.nome}
          {mutuo.observacoes && (
            <p className="text-[10px] text-muted-foreground truncate">{mutuo.observacoes}</p>
          )}
        </td>
        {/* Tipo / Categoria */}
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground">{mutuo.tipo}</span>
            {mutuo.categoria && (
              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${ehSaida ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-700'}`}>
                {mutuo.categoria}
              </span>
            )}
          </div>
        </td>
        {/* Parceiro */}
        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate" title={parceiro}>
          {parceiro}
        </td>
        {/* Data */}
        <td className="px-3 py-2.5 text-center text-xs tabular-nums">
          {formatDate(mutuo.data_captacao)}
        </td>
        {/* Valor captado */}
        <td className="px-3 py-2.5 text-right text-xs font-mono font-semibold tabular-nums">
          {formatCurrency(valorTotal)}
        </td>
        {/* Conciliado */}
        <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums text-blue-600">
          {conciliadoTotal > 0 ? formatCurrency(conciliadoTotal) : <span className="text-muted-foreground">—</span>}
        </td>
        {/* Saldo */}
        <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums">
          <span className={saldo > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatCurrency(saldo)}</span>
        </td>
        {/* Parcelas progress */}
        <td className="px-3 py-2.5 text-center">
          {parcelas.length > 0 ? (
            <div className="flex flex-col items-center gap-0.5">
              <div className="text-[10px] text-muted-foreground">{parcelas.filter(p => p.status === 'paga').length}/{parcelas.length}</div>
              <div className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : <span className="text-[10px] text-muted-foreground">—</span>}
        </td>
        {/* Ações */}
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={onToggleExpand}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isExpanded ? 'Ocultar parcelas' : 'Ver parcelas'}>
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onEdit(mutuo)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Editar">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (window.confirm('Excluir este mútuo e todas as parcelas?')) deleteMutuo.mutate(mutuo.id) }}
              className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Parcelas inline */}
      {isExpanded && (
        <tr>
          <td colSpan={12} className="p-0 bg-muted/10">
            <div className="border-t border-b border-dashed">
              <table className="tbl-bf w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-[10px] text-muted-foreground">
                    <th className="px-4 py-1.5 text-left font-semibold w-10">#</th>
                    <th className="px-4 py-1.5 text-left font-semibold">Vencimento</th>
                    <th className="px-4 py-1.5 text-right font-semibold">Valor</th>
                    <th className="px-4 py-1.5 text-right font-semibold">Pago</th>
                    <th className="px-4 py-1.5 text-center font-semibold">Status</th>
                    <th className="px-4 py-1.5 text-center font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map(p => (
                    <ParcelaRow key={p.id} parcela={p} mutuoId={mutuo.id} onUpdate={updateParcela} />
                  ))}
                  <AddParcelaRow mutuoId={mutuo.id} nextNumero={nextNumero} />
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── KPI Card ────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, sub }: {
  icon: typeof DollarSign; label: string; value: string; color: string; sub?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────

export default function MutuosPage() {
  const { restartTour } = useTour('mutuos', pageTours.mutuos)
  const { data: mutuos, isLoading } = useMutuos()

  const [tab, setTab] = useState<Tab>('todos')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingMutuo, setEditingMutuo] = useState<Mutuo | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const selection = useSelection()
  const [batchAction, setBatchAction] = useState<'categoria' | 'delete' | null>(null)
  const [batchCategoria, setBatchCategoria] = useState('')
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const batchDelete = useBatchDeleteMutuos()
  const batchUpdateCategory = useBatchUpdateMutuosCategory()

  const openCreate = () => { setEditingMutuo(null); setShowModal(true) }
  const openEdit = (m: Mutuo) => { setEditingMutuo(m); setShowModal(true) }

  const all = mutuos ?? []
  const mutuosEntrada = all.filter(m => mutuoDirecao(m) === 'entrada')
  const mutuosSaida   = all.filter(m => mutuoDirecao(m) === 'saida')

  // KPIs
  const kpis = useMemo(() => {
    const totalCaptado      = mutuosEntrada.reduce((s, m) => s + Number(m.valor_captado), 0)
    const totalConcEntrada  = mutuosEntrada.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0)
    const totalEmprestado   = mutuosSaida.reduce((s, m) => s + Number(m.valor_captado), 0)
    const totalDevolvido    = mutuosSaida.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0)
    const totalJuros        = mutuosEntrada.reduce((s, m) => {
      const dev = (m.parcelas ?? []).reduce((ss, p) => ss + Number(p.valor), 0)
      return s + Math.max(0, dev - Number(m.valor_captado))
    }, 0)
    return { totalCaptado, totalConcEntrada, totalEmprestado, totalDevolvido, totalJuros }
  }, [mutuosEntrada, mutuosSaida])

  // Filtros aplicados
  const filtrados = useMemo(() => {
    let arr = all
    if (tab === 'entrada') arr = mutuosEntrada
    else if (tab === 'saida') arr = mutuosSaida

    const q = search.toLowerCase().trim()
    if (q) arr = arr.filter(m =>
      m.nome.toLowerCase().includes(q) ||
      (m.categoria ?? '').toLowerCase().includes(q) ||
      (m.instituicao ?? '').toLowerCase().includes(q) ||
      ((m as any).fornecedor?.nome ?? '').toLowerCase().includes(q),
    )

    if (statusFilter !== 'todos') arr = arr.filter(m => m.status === statusFilter)
    if (categoriaFilter) arr = arr.filter(m => (m.categoria ?? '') === categoriaFilter)
    if (dataDe) arr = arr.filter(m => m.data_captacao >= dataDe)
    if (dataAte) arr = arr.filter(m => m.data_captacao <= dataAte)

    return arr
  }, [all, tab, search, statusFilter, categoriaFilter, dataDe, dataAte, mutuosEntrada, mutuosSaida])

  const categorias = useMemo(() => {
    const set = new Set<string>()
    all.forEach(m => { if (m.categoria) set.add(m.categoria) })
    return Array.from(set).sort()
  }, [all])

  const advancedActiveCount = [categoriaFilter, dataDe, dataAte].filter(Boolean).length

  const clearAdvanced = () => { setCategoriaFilter(''); setDataDe(''); setDataAte('') }

  const TABS = [
    { key: 'todos' as Tab, label: 'Todos', count: all.length },
    { key: 'entrada' as Tab, label: 'Captações', count: mutuosEntrada.length, icon: ArrowUpRight, color: 'text-emerald-600' },
    { key: 'saida' as Tab, label: 'Adiantamentos Feitos', count: mutuosSaida.length, icon: ArrowDownRight, color: 'text-red-600' },
  ]

  const handleBatchCategory = async () => {
    if (!batchCategoria.trim()) return
    setIsBatchProcessing(true)
    try {
      await batchUpdateCategory.mutateAsync({ ids: Array.from(selection.selected), categoria: batchCategoria.trim() })
      selection.clear(); setBatchAction(null); setBatchCategoria('')
    } finally { setIsBatchProcessing(false) }
  }

  const handleBatchDelete = async () => {
    setIsBatchProcessing(true)
    try {
      await batchDelete.mutateAsync(Array.from(selection.selected))
      selection.clear(); setBatchAction(null)
    } finally { setIsBatchProcessing(false) }
  }

  return (
    <div>
      <PageHeader title="Capital & Mútuos" description="Capital de giro, empréstimos, financiamentos e adiantamentos do projeto" icon={Landmark} onHelp={restartTour} />

      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={ArrowUpRight}  label="Captado Total"    value={formatCurrency(kpis.totalCaptado)}     color="text-emerald-600" sub={`${mutuosEntrada.length} operaç.`} />
        <KpiCard icon={CheckCircle2}  label="Extrato Recebido" value={formatCurrency(kpis.totalConcEntrada)} color="text-blue-600"    sub="entradas conciliadas" />
        <KpiCard icon={TrendingDown}  label="Custo Juros"      value={formatCurrency(kpis.totalJuros)}       color="text-red-500"     sub="devolução − captado" />
        <KpiCard icon={ArrowDownRight} label="Adiantado"        value={formatCurrency(kpis.totalEmprestado)}  color="text-red-600"     sub={`${mutuosSaida.length} operaç.`} />
        <KpiCard icon={DollarSign}    label="Devolvido"         value={formatCurrency(kpis.totalDevolvido)}   color="text-amber-600"   sub="entradas conciliadas" />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon && <t.icon className={`h-3.5 w-3.5 ${tab === t.key ? 'text-primary-foreground' : (t.color ?? '')}`} />}
            {t.label}
            <span className={`rounded-full px-1.5 text-[9px] font-bold ${tab === t.key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, categoria, parceiro..."
            className="w-full rounded-lg border bg-background pl-10 pr-3 py-2 text-sm" />
        </div>

        {/* Status filter */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {([['todos', 'Todos'], ['ativo', 'Ativo'], ['quitado', 'Quitado'], ['inadimplente', 'Inadimplente']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                statusFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>{label}</button>
          ))}
        </div>

        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
              showAdvanced || advancedActiveCount > 0 ? 'border-primary/50 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Filtros avançados
            {advancedActiveCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{advancedActiveCount}</span>
            )}
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" />Nova Operação
          </button>
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold">Filtros avançados</span>
            {advancedActiveCount > 0 && (
              <button onClick={clearAdvanced} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent">
                <X className="h-3 w-3" />Limpar ({advancedActiveCount})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={LABEL}>Categoria</label>
              <select value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)} className={inputCls}>
                <option value="">Todas</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Data Captação — de</label>
              <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={LABEL}>Data Captação — até</label>
              <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Landmark className="mb-3 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-medium">{all.length === 0 ? 'Nenhuma operação cadastrada' : 'Nenhum resultado'}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {all.length === 0
              ? 'Cadastre captações e adiantamentos para refletirem no fluxo de caixa.'
              : 'Ajuste os filtros para ver mais itens.'}
          </p>
          {all.length === 0 && (
            <button onClick={openCreate} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />Cadastrar Primeira Operação
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border bg-card max-h-[calc(100vh-380px)]">
          <table className="tbl-bf w-full text-xs">
            <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <th className="px-2 py-2.5 text-center w-8">
                  <input type="checkbox"
                    checked={selection.count === filtrados.length && filtrados.length > 0}
                    onChange={() => selection.toggleAll(filtrados.map(m => m.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Direção</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo · Categoria</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parceiro</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Extrato</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parcelas</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map(m => (
                <MutuoRow
                  key={m.id}
                  mutuo={m}
                  onEdit={openEdit}
                  isSelected={selection.isSelected(m.id)}
                  onToggleSelect={() => selection.toggle(m.id)}
                  isExpanded={expandedId === m.id}
                  onToggleExpand={() => setExpandedId(expandedId === m.id ? null : m.id)}
                />
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-bold">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-xs">TOTAL FILTRADO ({filtrados.length} operações)</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                  {formatCurrency(filtrados.reduce((s, m) => s + Number(m.valor_captado), 0))}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-600">
                  {formatCurrency(filtrados.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* BulkActionBar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={(() => {
          const sel = filtrados.filter(m => selection.selected.has(m.id))
          if (sel.length === 0) return undefined
          const total = sel.reduce((s, m) => s + Number(m.valor_captado), 0)
          const conc = sel.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0)
          return [
            { label: 'Valor', value: formatCurrency(total), tone: 'primary' as const },
            { label: 'Extrato', value: formatCurrency(conc), tone: 'emerald' as const },
          ]
        })()}
      >
        <div className="flex items-center gap-2">
          <button onClick={() => setBatchAction('categoria')}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            <Tags className="h-3.5 w-3.5" />Alterar Categoria
          </button>
          <button onClick={() => setBatchAction('delete')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />Excluir
          </button>
        </div>
      </BulkActionBar>

      <MutuoFormModal open={showModal} onClose={() => { setEditingMutuo(null); setShowModal(false) }} initialData={editingMutuo} />

      {/* Batch: categoria */}
      {batchAction === 'categoria' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><Tags className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="text-base font-semibold">Alterar Categoria em Lote</h3>
                <p className="text-xs text-muted-foreground">{selection.count} mútuos selecionados</p>
              </div>
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nova categoria</label>
              <input type="text" autoFocus placeholder="Ex: Empréstimos Bancários" value={batchCategoria}
                onChange={e => setBatchCategoria(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBatchAction(null)} disabled={isBatchProcessing} className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
              <button disabled={!batchCategoria.trim() || isBatchProcessing} onClick={handleBatchCategory} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isBatchProcessing ? 'Aplicando...' : 'Aplicar Categoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch: delete */}
      {batchAction === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10"><Trash2 className="h-5 w-5 text-red-600" /></div>
              <div>
                <h3 className="text-base font-semibold">Confirmar Exclusão</h3>
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="mb-5 text-sm">
              Você está prestes a excluir <strong>{selection.count} mútuos</strong> (e todas as suas parcelas).<br /><br />
              Tem certeza?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBatchAction(null)} disabled={isBatchProcessing} className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={handleBatchDelete} disabled={isBatchProcessing} className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50">
                {isBatchProcessing ? 'Excluindo...' : 'Sim, Excluir Mútuos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
