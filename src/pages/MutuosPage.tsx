import { useState, useEffect } from 'react'
import {
  Landmark,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Save,
  X,
  CheckSquare,
  Square,
  Tags,
} from 'lucide-react'
import { useMutuos, useCreateMutuo, useDeleteMutuo, useUpdateMutuo, useUpdateMutuoParcela, useCreateMutuoParcela, useDeleteMutuoParcela, useBatchDeleteMutuos, useBatchUpdateMutuosCategory } from '@/hooks/useMutuos'
import { useFornecedores } from '@/hooks/useCompras'
import type { Mutuo, MutuoParcela } from '@/hooks/useMutuos'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

const Checkbox = ({ checked, onChange, className = '' }: { checked: boolean; onChange: () => void; className?: string }) => (
  <button onClick={(e) => { e.stopPropagation(); onChange() }} className={`shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground ${className}`}>
    {checked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
  </button>
)

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function statusBadge(s: string) {
  if (s === 'paga') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
  if (s === 'vencida') return 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  if (s === 'parcialmente_paga') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

function statusLabel(s: string) {
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

const inputCls = 'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

// Direção do mútuo: 'entrada' = projeto recebeu; 'saida' = projeto emprestou
export function mutuoDirecao(m: { categoria?: string | null; tipo?: string | null }): 'entrada' | 'saida' {
  const cat = String(m.categoria ?? '').toLowerCase()
  if (cat.includes('adiantamento a receber') || cat.includes('adiantamento feito') || cat.includes('emprestimo concedido') || cat.includes('empréstimo concedido')) {
    return 'saida'
  }
  return 'entrada'
}

const CATEGORIAS_ENTRADA = ['Capital de Giro', 'Mútuo Captação', 'Empréstimo Tomado', 'Financiamento', 'Cartão', 'Adiantamento Recebido']
const CATEGORIAS_SAIDA   = ['Adiantamento Feito', 'Empréstimo Concedido', 'Adiantamento a Receber']

// ─── Mutuo Form Modal (create + edit) ───────────────────────

function MutuoFormModal({ open, onClose, initialData }: { open: boolean; onClose: () => void; initialData?: Mutuo | null }) {
  const createMutuo = useCreateMutuo()
  const updateMutuo = useUpdateMutuo()
  const isEditing = !!initialData

  const [form, setForm] = useState({
    direcao: 'entrada' as 'entrada' | 'saida',
    nome: '', tipo: 'MÚTUO' as Mutuo['tipo'], categoria: 'Capital de Giro',
    instituicao: '', fornecedor_id: '', valor_captado: '', data_captacao: '',
    taxa_juros_mensal: '', observacoes: '', status: 'ativo' as Mutuo['status'],
  })
  const [parcelasText, setParcelasText] = useState('')
  const { data: fornecedores } = useFornecedores()

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
      })
    } else if (open) {
      setForm({
        direcao: 'entrada',
        nome: '', tipo: 'MÚTUO', categoria: 'Capital de Giro', instituicao: '', fornecedor_id: '',
        valor_captado: '', data_captacao: '', taxa_juros_mensal: '', observacoes: '', status: 'ativo',
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
      createMutuo.mutate({ mutuo: payload, parcelas }, { onSuccess: () => onClose() })
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
          {/* Seletor de direção */}
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
              <input type="text" list="mutuo-cat-list" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputCls} placeholder="Ex: Capital de Giro, Adiantamento Feito" />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Taxa Juros Mensal (%)</label>
              <input type="text" value={form.taxa_juros_mensal} onChange={e => setForm({ ...form, taxa_juros_mensal: e.target.value })} className={inputCls} placeholder="1,5" />
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
                <p className="mt-1 text-xs text-muted-foreground">{parseParcelasText(parcelasText).length} parcela(s) reconhecida(s) — Total: {formatCurrency(parseParcelasText(parcelasText).reduce((s, p) => s + p.valor, 0))}</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {form.direcao === 'entrada'
                  ? 'Parcelas que o projeto vai pagar de volta (saída no fluxo).'
                  : 'Parcelas que o terceiro devolverá ao projeto (entrada no fluxo).'}
              </p>
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

// ─── Parcela Inline Edit Row ────────────────────────────────

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
    onUpdate.mutate({
      id: parcela.id,
      valor: newValor,
      data_vencimento: editDate,
    })
    setEditing(false)
  }

  const handleBaixar = () => {
    onUpdate.mutate({ id: parcela.id, status: 'paga', valor_pago: parcela.valor, data_pagamento_real: todayStr })
  }

  const handleEstornar = () => {
    if (!window.confirm('Deseja estornar o pagamento desta parcela?')) return
    onUpdate.mutate({ id: parcela.id, status: 'pendente', valor_pago: 0, data_pagamento_real: null })
  }

  const handleDelete = () => {
    if (!window.confirm('Excluir esta parcela permanentemente?')) return
    deleteParcela.mutate(parcela.id)
  }

  if (editing) {
    return (
      <tr className="border-b last:border-0 bg-primary/5">
        <td className="px-4 py-2 text-muted-foreground">{parcela.numero_parcela}</td>
        <td className="px-4 py-2">
          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm w-36" />
        </td>
        <td className="px-4 py-2 text-right">
          <input type="text" value={editValor} onChange={e => setEditValor(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm text-right w-28" />
        </td>
        <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(Number(parcela.valor_pago || 0))}</td>
        <td className="px-4 py-2 text-center">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(parcela.status)}`}>
            {statusLabel(parcela.status)}
          </span>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-center gap-1">
            <button onClick={handleSaveEdit} disabled={onUpdate.isPending} className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50" title="Salvar">
              <Save className="h-3 w-3" />
            </button>
            <button onClick={() => { setEditing(false); setEditValor(String(parcela.valor)); setEditDate(parcela.data_vencimento) }} className="rounded-md bg-muted p-1.5 text-muted-foreground hover:bg-accent" title="Cancelar">
              <X className="h-3 w-3" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b last:border-0 hover:bg-accent/50 transition-colors group">
      <td className="px-4 py-2 text-muted-foreground">{parcela.numero_parcela}</td>
      <td className="px-4 py-2">{formatDate(parcela.data_vencimento)}</td>
      <td className="px-4 py-2 text-right font-medium">{formatCurrency(Number(parcela.valor))}</td>
      <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(Number(parcela.valor_pago || 0))}</td>
      <td className="px-4 py-2 text-center">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(isVencida ? 'vencida' : parcela.status)}`}>
          {isVencida ? <><AlertTriangle className="h-3 w-3" /> Vencida</> : isPaga ? <><CheckCircle2 className="h-3 w-3" /> Paga</> : <><Clock className="h-3 w-3" /> {statusLabel(parcela.status)}</>}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-center gap-1">
          {/* Baixar ou Estornar */}
          {isPaga ? (
            <button onClick={handleEstornar} disabled={onUpdate.isPending}
              className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30 disabled:opacity-50"
              title="Estornar: reverter o pagamento">
              <RotateCcw className="h-3 w-3 inline mr-0.5" />
              Estornar
            </button>
          ) : (
            <button onClick={handleBaixar} disabled={onUpdate.isPending}
              className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30 disabled:opacity-50">
              Baixar
            </button>
          )}
          {/* Editar */}
          <button onClick={() => setEditing(true)}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-opacity" title="Editar parcela">
            <Edit2 className="h-3 w-3" />
          </button>
          {/* Excluir */}
          <button onClick={handleDelete} disabled={deleteParcela.isPending}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity disabled:opacity-50" title="Excluir parcela">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Add Parcela Inline ─────────────────────────────────────

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
            <Plus className="h-3 w-3" /> Adicionar parcela
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
      <td className="px-4 py-2 text-muted-foreground text-xs">#{nextNumero}</td>
      <td className="px-4 py-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm w-36" />
      </td>
      <td className="px-4 py-2 text-right">
        <input type="text" value={valor} onChange={e => setValor(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm text-right w-28" placeholder="0,00" />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <div className="flex items-center justify-center gap-1">
          <button onClick={handleAdd} disabled={createParcela.isPending} className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50" title="Adicionar">
            <Plus className="h-3 w-3" />
          </button>
          <button onClick={() => setShow(false)} className="rounded-md bg-muted p-1.5 text-muted-foreground hover:bg-accent" title="Cancelar">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Mutuo Card ─────────────────────────────────────────────

function MutuoCard({ mutuo, onEdit, selected, onToggleSelect }: { mutuo: Mutuo; onEdit: (m: Mutuo) => void; selected: boolean; onToggleSelect: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const deleteMutuo = useDeleteMutuo()
  const updateParcela = useUpdateMutuoParcela()

  const parcelas = (mutuo.parcelas ?? []).sort((a, b) => a.numero_parcela - b.numero_parcela)
  const totalDevolucao = parcelas.reduce((s, p) => s + Number(p.valor), 0)
  const totalPago = parcelas.reduce((s, p) => s + Number(p.valor_pago || 0), 0)
  const nextNumero = parcelas.length > 0 ? Math.max(...parcelas.map(p => p.numero_parcela)) + 1 : 1
  const direcao = mutuoDirecao(mutuo)
  const ehSaida = direcao === 'saida'
  const valorTotal = Number(mutuo.valor_captado)
  // Diferenciamos por direção da mov conciliada:
  // - Captação (entrada): o que realmente entrou no caixa = valor_conciliado_entrada
  // - Adiantamento feito (saída): o que saiu (pagamento efetivado) = valor_conciliado_saida
  //   e o que já voltou (devolução recebida) = valor_conciliado_entrada
  const entradaConciliada = Number(mutuo.valor_conciliado_entrada || 0)
  const saidaConciliada   = Number(mutuo.valor_conciliado_saida || 0)
  const efetivado  = ehSaida ? saidaConciliada : entradaConciliada
  const jaRecebido = ehSaida ? entradaConciliada : 0
  const saldoAReceber = ehSaida
    ? Math.max(0, valorTotal - entradaConciliada) // devolução pendente
    : Math.max(0, valorTotal - entradaConciliada) // captação pendente

  const mutuoStatusBadge = mutuo.status === 'ativo'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
    : mutuo.status === 'quitado'
    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
    : 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  const mutuoStatusLabel = mutuo.status === 'ativo' ? 'Ativo' : mutuo.status === 'quitado' ? 'Quitado' : 'Inadimplente'

  return (
    <div className={`overflow-hidden rounded-xl border bg-card transition-colors ${selected ? 'border-primary ring-1 ring-primary/20' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onChange={onToggleSelect} />
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${ehSaida ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            {ehSaida ? <ArrowDownRight className="h-5 w-5 text-red-500" /> : <ArrowUpRight className="h-5 w-5 text-emerald-500" />}
          </div>
          <div>
            <h3 className="font-semibold">{mutuo.nome}</h3>
            <p className="text-xs text-muted-foreground">
              {mutuo.tipo} {mutuo.fornecedor ? `• Fornecedor: ${mutuo.fornecedor.nome}` : mutuo.instituicao ? `• Instituição: ${mutuo.instituicao}` : ''} • {ehSaida ? 'Emprestado' : 'Captado'} em {formatDate(mutuo.data_captacao)}
              {mutuo.categoria && <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ehSaida ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-700'}`}>{mutuo.categoria}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${mutuoStatusBadge}`}>{mutuoStatusLabel}</span>
          <button onClick={() => onEdit(mutuo)} className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Editar mútuo">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={() => { if (window.confirm('Excluir este mútuo e todas as parcelas?')) deleteMutuo.mutate(mutuo.id) }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 divide-x md:grid-cols-4">
        {ehSaida ? (
          <>
            <KpiCell icon={ArrowDownRight} iconColor="text-red-500" label="Emprestado" value={formatCurrency(valorTotal)} valueColor="text-red-600 dark:text-red-400" />
            <KpiCell icon={CheckCircle2} iconColor="text-slate-500" label="Saída (Extrato)" value={formatCurrency(efetivado)} valueColor="text-slate-600 dark:text-slate-400" />
            <KpiCell icon={ArrowUpRight} iconColor="text-emerald-500" label="Devolvido" value={formatCurrency(jaRecebido)} valueColor="text-emerald-600 dark:text-emerald-400" />
            <KpiCell icon={DollarSign} iconColor="text-amber-500" label="A Receber" value={formatCurrency(saldoAReceber)} valueColor="text-amber-600 dark:text-amber-400" />
          </>
        ) : (
          <>
            <KpiCell icon={ArrowUpRight} iconColor="text-emerald-500" label="Captado (Planejado)" value={formatCurrency(valorTotal)} valueColor="text-emerald-600 dark:text-emerald-400" />
            <KpiCell icon={CheckCircle2} iconColor="text-blue-500" label="Recebido (Extrato)" value={formatCurrency(efetivado)} valueColor="text-blue-600 dark:text-blue-400" />
            <KpiCell icon={DollarSign} iconColor="text-amber-500" label="A Receber" value={formatCurrency(saldoAReceber)} valueColor="text-amber-600 dark:text-amber-400" />
            <KpiCell icon={ArrowDownRight} iconColor="text-red-500" label="Devolução Planejada" value={formatCurrency(totalDevolucao)} valueColor="text-red-600 dark:text-red-400" />
          </>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-5 py-3 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{parcelas.filter(p => p.status === 'paga').length} / {parcelas.length} parcelas pagas</span>
          <span>{totalDevolucao > 0 ? ((totalPago / totalDevolucao) * 100).toFixed(0) : 0}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${totalDevolucao > 0 ? (totalPago / totalDevolucao) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Expand parcelas */}
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-center gap-1.5 border-t py-2 text-xs text-muted-foreground hover:bg-accent transition-colors">
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Ocultar parcelas' : `Ver ${parcelas.length} parcelas`}
      </button>

      {expanded && (
        <div className="border-t">
          <table className="tbl-bf w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Vencimento</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 text-right font-medium">Pago</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
                <th className="px-4 py-2 text-center font-medium">Ações</th>
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
      )}

      {/* Observações */}
      {mutuo.observacoes && (
        <div className="border-t px-5 py-2">
          <p className="text-xs text-muted-foreground italic">{mutuo.observacoes}</p>
        </div>
      )}
    </div>
  )
}

function KpiCell({ icon: Icon, iconColor, label, value, valueColor }: { icon: typeof DollarSign; iconColor: string; label: string; value: string; valueColor: string }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`h-3 w-3 ${iconColor}`} /> {label}
      </div>
      <p className={`mt-0.5 text-sm font-semibold ${valueColor}`}>{value}</p>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────

export default function MutuosPage() {
  const { restartTour } = useTour('mutuos', pageTours.mutuos)

  const { data: mutuos, isLoading } = useMutuos()
  const [showModal, setShowModal] = useState(false)
  const [editingMutuo, setEditingMutuo] = useState<Mutuo | null>(null)

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchAction, setBatchAction] = useState<'categoria' | 'delete' | null>(null)
  const [batchCategoria, setBatchCategoria] = useState('')
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  
  const batchDelete = useBatchDeleteMutuos()
  const batchUpdateCategory = useBatchUpdateMutuosCategory()

  const openCreate = () => { setEditingMutuo(null); setShowModal(true) }
  const openEdit = (m: Mutuo) => { setEditingMutuo(m); setShowModal(true) }
  const closeModal = () => { setEditingMutuo(null); setShowModal(false) }

  const toggleSelectMutuo = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleBatchCategory = async () => {
    if (!batchCategoria.trim()) return
    setIsBatchProcessing(true)
    try {
      await batchUpdateCategory.mutateAsync({ ids: Array.from(selectedIds), categoria: batchCategoria.trim() })
      setSelectedIds(new Set())
      setBatchAction(null)
      setBatchCategoria('')
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const handleBatchDelete = async () => {
    setIsBatchProcessing(true)
    try {
      await batchDelete.mutateAsync(Array.from(selectedIds))
      setSelectedIds(new Set())
      setBatchAction(null)
    } finally {
      setIsBatchProcessing(false)
    }
  }

  const hasSelection = selectedIds.size > 0

  const [filtroDirecao, setFiltroDirecao] = useState<'todos' | 'entrada' | 'saida'>('todos')

  const mutuosEntrada = (mutuos ?? []).filter(m => mutuoDirecao(m) === 'entrada')
  const mutuosSaida   = (mutuos ?? []).filter(m => mutuoDirecao(m) === 'saida')

  const totalCaptado   = mutuosEntrada.reduce((s, m) => s + Number(m.valor_captado), 0)
  // "Recebido real" = entradas efetivadas via extrato
  const totalCaptadoReal = mutuosEntrada.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0)
  const totalCaptacaoPendente = Math.max(0, totalCaptado - totalCaptadoReal)
  const totalDevCaptacao = mutuosEntrada.reduce((s, m) => s + (m.parcelas ?? []).reduce((ss, p) => ss + Number(p.valor), 0), 0)
  const totalJuros     = totalDevCaptacao - totalCaptado

  const totalEmprestado  = mutuosSaida.reduce((s, m) => s + Number(m.valor_captado), 0)
  // "Saiu" = saídas efetivadas via extrato; "Devolvido" = entradas conciliadas ao adiantamento feito
  const totalSaidaReal   = mutuosSaida.reduce((s, m) => s + Number(m.valor_conciliado_saida || 0), 0)
  const totalDevolvido   = mutuosSaida.reduce((s, m) => s + Number(m.valor_conciliado_entrada || 0), 0)
  const totalAReceberSaida = Math.max(0, totalEmprestado - totalDevolvido)

  const mutuosFiltrados = filtroDirecao === 'todos' ? (mutuos ?? [])
    : filtroDirecao === 'entrada' ? mutuosEntrada : mutuosSaida

  return (
    <div className="space-y-6 relative">
      <PageHeader title="Capital & Mútuos" description="Capital de giro, empréstimos, financiamentos e adiantamentos do projeto" icon={Landmark} onHelp={restartTour}>
        <div className="flex items-center gap-2">
          {mutuos && mutuos.length > 0 && (
             <button onClick={() => setSelectedIds(selectedIds.size === mutuos.length ? new Set() : new Set(mutuos.map(m => m.id)))} className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
               <CheckSquare className="h-4 w-4" />
               <span className="hidden sm:inline">{selectedIds.size === mutuos.length ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
             </button>
          )}
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nova Operação
          </button>
        </div>
      </PageHeader>

      {/* ─── BATCH ACTIONS TOOLBAR ─── */}
      {hasSelection && (
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{selectedIds.size} selecionados</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setBatchAction('categoria')}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Tags className="h-3.5 w-3.5" /> Alterar Categoria
            </button>
            <button
              onClick={() => setBatchAction('delete')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              title="Limpar seleção"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Summary cards: duas linhas (entrada / saída) */}
      <div id="tour-mutuos-summary" className="space-y-3">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">↗ Captações — entradas no projeto</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <SummaryCard icon={ArrowUpRight} iconColor="text-emerald-500" label="Captado (Planejado)" value={formatCurrency(totalCaptado)} valueColor="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50/50 dark:bg-emerald-500/5" />
            <SummaryCard icon={CheckCircle2} iconColor="text-blue-500" label="Recebido (Extrato)" value={formatCurrency(totalCaptadoReal)} valueColor="text-blue-600 dark:text-blue-400" bg="bg-blue-50/50 dark:bg-blue-500/5" />
            <SummaryCard icon={DollarSign} iconColor="text-amber-500" label="A Receber" value={formatCurrency(totalCaptacaoPendente)} valueColor="text-amber-600 dark:text-amber-400" bg="bg-amber-50/50 dark:bg-amber-500/5" />
            <SummaryCard icon={TrendingDown} iconColor="text-red-500" label="Custo Juros" value={formatCurrency(totalJuros)} valueColor="text-red-600 dark:text-red-400" bg="bg-red-50/50 dark:bg-red-500/5" />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">↘ Adiantamentos feitos — saídas do projeto</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <SummaryCard icon={ArrowDownRight} iconColor="text-red-500" label="Emprestado (Planejado)" value={formatCurrency(totalEmprestado)} valueColor="text-red-600 dark:text-red-400" bg="bg-red-50/50 dark:bg-red-500/5" />
            <SummaryCard icon={CheckCircle2} iconColor="text-slate-500" label="Saída Efetivada" value={formatCurrency(totalSaidaReal)} valueColor="text-slate-600 dark:text-slate-400" bg="bg-slate-50/50 dark:bg-slate-500/5" />
            <SummaryCard icon={ArrowUpRight} iconColor="text-emerald-500" label="Devolvido" value={formatCurrency(totalDevolvido)} valueColor="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50/50 dark:bg-emerald-500/5" />
            <SummaryCard icon={DollarSign} iconColor="text-amber-500" label="A Receber" value={formatCurrency(totalAReceberSaida)} valueColor="text-amber-600 dark:text-amber-400" bg="bg-amber-50/50 dark:bg-amber-500/5" />
          </div>
        </div>
      </div>

      {/* Filtro de direção */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1 w-fit text-xs font-medium">
        {(['todos', 'entrada', 'saida'] as const).map(d => (
          <button key={d} onClick={() => setFiltroDirecao(d)}
            className={`rounded px-3 py-1.5 transition-colors ${filtroDirecao === d ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {d === 'todos' ? `Todos (${(mutuos ?? []).length})` : d === 'entrada' ? `Captações (${mutuosEntrada.length})` : `Adiantamentos feitos (${mutuosSaida.length})`}
          </button>
        ))}
      </div>

      {/* Mutuos list */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : !mutuos?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Landmark className="mb-3 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-medium">Nenhuma operação cadastrada</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cadastre captações (entradas) e adiantamentos feitos (saídas) para refletirem no fluxo de caixa.
          </p>
          <button onClick={openCreate} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Cadastrar Primeira Operação
          </button>
        </div>
      ) : mutuosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nenhuma operação neste filtro.
        </div>
      ) : (
        <div className="space-y-4">
          {mutuosFiltrados.map(m => (
             <MutuoCard key={m.id} mutuo={m} onEdit={openEdit} selected={selectedIds.has(m.id)} onToggleSelect={() => toggleSelectMutuo(m.id)} />
          ))}
        </div>
      )}

      <MutuoFormModal open={showModal} onClose={closeModal} initialData={editingMutuo} />

      {/* ─── BATCH ACTION DIALOGS ─── */}
      {batchAction === 'categoria' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Tags className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Alterar Categoria em Lote</h3>
                <p className="text-xs text-muted-foreground">{selectedIds.size} mútuos selecionados</p>
              </div>
            </div>
            <div className="mb-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Nova categoria para os mútuos selecionados</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Empréstimos Bancários"
                  value={batchCategoria}
                  onChange={e => setBatchCategoria(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBatchAction(null)} disabled={isBatchProcessing} className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                Cancelar
              </button>
              <button disabled={!batchCategoria.trim() || isBatchProcessing} onClick={handleBatchCategory} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isBatchProcessing ? 'Aplicando...' : 'Aplicar Categoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchAction === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 dark:bg-red-500/20">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Confirmar Exclusão</h3>
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="mb-5 text-sm">
              Você está prestes a excluir <strong>{selectedIds.size} mútuos</strong> (e todas as suas parcelas associadas).
              <br /><br />
              Tem certeza que deseja continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBatchAction(null)} disabled={isBatchProcessing} className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                Cancelar
              </button>
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

function SummaryCard({ icon: Icon, iconColor, label, value, valueColor, bg }: { icon: typeof DollarSign; iconColor: string; label: string; value: string; valueColor: string; bg: string }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className={`flex items-center gap-2 text-xs ${iconColor}`}>
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className={`mt-1 text-xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}
