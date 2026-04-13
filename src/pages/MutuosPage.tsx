import { useState } from 'react'
import {
  Landmark,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useMutuos, useCreateMutuo, useDeleteMutuo, useUpdateMutuoParcela } from '@/hooks/useMutuos'
import type { Mutuo, MutuoParcela } from '@/hooks/useMutuos'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

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

// --- Create Mutuo Modal ---
function CreateMutuoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutuo = useCreateMutuo()
  const [form, setForm] = useState({
    nome: '', tipo: 'MÚTUO' as Mutuo['tipo'], categoria: 'Mútuo', instituicao: '',
    valor_captado: '', data_captacao: '', taxa_juros_mensal: '', observacoes: '',
  })
  const [parcelasText, setParcelasText] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parcelas = parseParcelasText(parcelasText)
    createMutuo.mutate(
      {
        mutuo: {
          nome: form.nome, tipo: form.tipo, categoria: form.categoria, instituicao: form.instituicao || null,
          valor_captado: parseFloat(form.valor_captado.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
          data_captacao: form.data_captacao,
          taxa_juros_mensal: parseFloat(form.taxa_juros_mensal.replace(',', '.')) || 0,
          observacoes: form.observacoes || null, status: 'ativo',
        },
        parcelas,
      },
      {
        onSuccess: () => {
          onClose()
          setForm({ nome: '', tipo: 'MÚTUO', categoria: 'Mútuo', instituicao: '', valor_captado: '', data_captacao: '', taxa_juros_mensal: '', observacoes: '' })
          setParcelasText('')
        },
      }
    )
  }

  const inputCls = 'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-2xl rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Novo Mútuo / Empréstimo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre a captação e as parcelas de devolução</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
              <input type="text" required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inputCls} placeholder="Ex: MÚTUO, Empréstimo Bradesco" />
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
              <input type="text" list="mutuo-cat-list" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputCls} placeholder="Ex: Mútuo, Capital de Giro" />
              <datalist id="mutuo-cat-list">
                <option value="Mútuo" />
                <option value="Capital de Giro" />
                <option value="Financiamento" />
                <option value="Cartão" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Instituição</label>
              <input type="text" value={form.instituicao} onChange={e => setForm({ ...form, instituicao: e.target.value })} className={inputCls} placeholder="Banco, pessoa, etc." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor Captado (R$) *</label>
              <input type="text" required value={form.valor_captado} onChange={e => setForm({ ...form, valor_captado: e.target.value })} className={inputCls} placeholder="704.000,00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Captação *</label>
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

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Parcelas de Devolução (data;valor — uma por linha)</label>
            <textarea value={parcelasText} onChange={e => setParcelasText(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} placeholder={`08/04/2026;9000,00\n08/04/2026;14716,35\n17/04/2026;32008,00`} />
            {parcelasText && (
              <p className="mt-1 text-xs text-muted-foreground">{parseParcelasText(parcelasText).length} parcela(s) reconhecida(s) — Total: {formatCurrency(parseParcelasText(parcelasText).reduce((s, p) => s + p.valor, 0))}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:bg-accent">Cancelar</button>
            <button type="submit" disabled={createMutuo.isPending} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Plus className="h-4 w-4" /> {createMutuo.isPending ? 'Salvando...' : 'Cadastrar Mútuo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Mutuo Card ---
function MutuoCard({ mutuo }: { mutuo: Mutuo }) {
  const [expanded, setExpanded] = useState(false)
  const deleteMutuo = useDeleteMutuo()
  const updateParcela = useUpdateMutuoParcela()

  const parcelas = (mutuo.parcelas ?? []).sort((a, b) => a.numero_parcela - b.numero_parcela)
  const totalDevolucao = parcelas.reduce((s, p) => s + Number(p.valor), 0)
  const totalPago = parcelas.reduce((s, p) => s + Number(p.valor_pago || 0), 0)
  const totalPendente = totalDevolucao - totalPago
  const custoJuros = totalDevolucao - Number(mutuo.valor_captado)
  const todayStr = new Date().toISOString().split('T')[0]!

  const handleBaixar = (parcela: MutuoParcela) => {
    updateParcela.mutate({ id: parcela.id, status: 'paga', valor_pago: parcela.valor, data_pagamento_real: todayStr })
  }

  const mutuoStatusBadge = mutuo.status === 'ativo'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
    : mutuo.status === 'quitado'
    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
    : 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  const mutuoStatusLabel = mutuo.status === 'ativo' ? 'Ativo' : mutuo.status === 'quitado' ? 'Quitado' : 'Inadimplente'

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Landmark className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold">{mutuo.nome}</h3>
            <p className="text-xs text-muted-foreground">
              {mutuo.tipo} {mutuo.instituicao ? `• ${mutuo.instituicao}` : ''} • Captado em {formatDate(mutuo.data_captacao)}
              {mutuo.categoria && <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{mutuo.categoria}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${mutuoStatusBadge}`}>{mutuoStatusLabel}</span>
          <button
            onClick={() => { if (window.confirm('Excluir este mútuo e todas as parcelas?')) deleteMutuo.mutate(mutuo.id) }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 divide-x md:grid-cols-4">
        <KpiCell icon={ArrowUpRight} iconColor="text-emerald-500" label="Captado" value={formatCurrency(Number(mutuo.valor_captado))} valueColor="text-emerald-600 dark:text-emerald-400" />
        <KpiCell icon={ArrowDownRight} iconColor="text-red-500" label="Devolução Total" value={formatCurrency(totalDevolucao)} valueColor="text-red-600 dark:text-red-400" />
        <KpiCell icon={TrendingDown} iconColor="text-amber-500" label="Custo Juros" value={formatCurrency(custoJuros)} valueColor="text-amber-600 dark:text-amber-400" />
        <KpiCell icon={DollarSign} iconColor="text-blue-500" label="Pendente" value={formatCurrency(totalPendente)} valueColor="text-blue-600 dark:text-blue-400" />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Vencimento</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 text-right font-medium">Pago</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
                <th className="px-4 py-2 text-center font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map(p => {
                const isVencida = p.status !== 'paga' && p.data_vencimento < todayStr
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground">{p.numero_parcela}</td>
                    <td className="px-4 py-2">{formatDate(p.data_vencimento)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(Number(p.valor))}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(Number(p.valor_pago || 0))}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(isVencida ? 'vencida' : p.status)}`}>
                        {isVencida ? <><AlertTriangle className="h-3 w-3" /> Vencida</> : p.status === 'paga' ? <><CheckCircle2 className="h-3 w-3" /> Paga</> : <><Clock className="h-3 w-3" /> {statusLabel(p.status)}</>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.status !== 'paga' && (
                        <button onClick={() => handleBaixar(p)} disabled={updateParcela.isPending}
                          className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30 disabled:opacity-50">
                          Baixar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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

// --- Main Page ---
export default function MutuosPage() {
  const { restartTour } = useTour('mutuos', pageTours.mutuos)

  const { data: mutuos, isLoading } = useMutuos()
  const [showCreate, setShowCreate] = useState(false)

  const totalCaptado = (mutuos ?? []).reduce((s, m) => s + Number(m.valor_captado), 0)
  const totalDevolucao = (mutuos ?? []).reduce((s, m) => s + (m.parcelas ?? []).reduce((ss, p) => ss + Number(p.valor), 0), 0)
  const totalJuros = totalDevolucao - totalCaptado

  return (
    <div className="space-y-6">
      <PageHeader title="Capital de Giro" description="Gerencie mútuos, empréstimos e financiamentos do projeto" icon={Landmark} onHelp={restartTour}>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Novo Mútuo
        </button>
      </PageHeader>

      {/* Summary cards */}
      <div id="tour-mutuos-summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={ArrowUpRight} iconColor="text-emerald-500" label="Total Captado" value={formatCurrency(totalCaptado)} valueColor="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50/50 dark:bg-emerald-500/5" />
        <SummaryCard icon={ArrowDownRight} iconColor="text-red-500" label="Total Devolução" value={formatCurrency(totalDevolucao)} valueColor="text-red-600 dark:text-red-400" bg="bg-red-50/50 dark:bg-red-500/5" />
        <SummaryCard icon={TrendingDown} iconColor="text-amber-500" label="Custo Financeiro (Juros)" value={formatCurrency(totalJuros)} valueColor="text-amber-600 dark:text-amber-400" bg="bg-amber-50/50 dark:bg-amber-500/5" />
      </div>

      {/* Mutuos list */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : !mutuos?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Landmark className="mb-3 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-medium">Nenhum mútuo cadastrado</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cadastre seus empréstimos e mútuos para que as entradas e saídas apareçam no fluxo de caixa projetado.
          </p>
          <button onClick={() => setShowCreate(true)} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Cadastrar Primeiro Mútuo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {mutuos.map(m => <MutuoCard key={m.id} mutuo={m} />)}
        </div>
      )}

      <CreateMutuoModal open={showCreate} onClose={() => setShowCreate(false)} />
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
