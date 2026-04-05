import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { useCreateEtapa, useUpdateEtapa, useDeleteEtapa, type Etapa } from '@/hooks/useEtapas'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  X, Save, Trash2, AlertTriangle, FileText, BarChart3,
  DollarSign, Package, ArrowRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EtapaModalProps {
  etapa: Etapa | null  // null = creating new
  allEtapas: Etapa[]
  onClose: () => void
}

interface ImpactChange {
  id: string
  valor: number
  dataAnterior: string
  dataNova: string
  fornecedor?: string
  item?: string
}

interface ImpactData {
  pedidos: number
  parcelas: number
  delta: number
  changes: ImpactChange[]
  totalShifted: number
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86400000
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EtapaModal({ etapa, allEtapas, onClose }: EtapaModalProps) {
  const isNew = !etapa
  const { currentCompany } = useProject()
  const companyId = currentCompany?.id ?? ''

  const createEtapa = useCreateEtapa()
  const updateEtapa = useUpdateEtapa()
  const deleteEtapa = useDeleteEtapa()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'dados' | 'impacto'>('dados')
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Form state
  const [form, setForm] = useState({
    nome: etapa?.nome ?? '',
    codigo: etapa?.codigo ?? '',
    data_inicio_plan: etapa?.data_inicio_plan ?? '',
    data_fim_plan: etapa?.data_fim_plan ?? '',
    data_inicio_real: etapa?.data_inicio_real ?? '',
    data_fim_real: etapa?.data_fim_real ?? '',
    casas_total: etapa?.casas_total ?? 64,
    status: etapa?.status ?? 'futuro' as Etapa['status'],
    ordem: etapa?.ordem ?? (Math.max(0, ...allEtapas.map(e => e.ordem)) + 1),
    depende_de: etapa?.depende_de ?? '',
    observacoes: etapa?.observacoes ?? '',
  })

  const set = useCallback((key: string, value: unknown) => {
    setForm(p => ({ ...p, [key]: value }))
  }, [])

  // -- Detect date change for impact tab
  const dateChanged = useMemo(() => {
    if (!etapa) return false
    return (
      form.data_inicio_plan !== (etapa.data_inicio_plan ?? '') ||
      form.data_fim_plan !== (etapa.data_fim_plan ?? '')
    )
  }, [etapa, form.data_inicio_plan, form.data_fim_plan])

  // Auto-switch to impact tab when dates change
  useEffect(() => {
    if (dateChanged && !isNew) setActiveTab('impacto')
  }, [dateChanged, isNew])

  // -- Linked items summary (for existing etapas)
  const { data: linkedSummary } = useQuery({
    queryKey: ['etapa-linked-summary', etapa?.id],
    queryFn: async () => {
      if (!etapa) return { itens: 0, pedidos: 0, parcelas: 0, orcado: 0, consumido: 0 }

      const { data: itens } = await supabase
        .from('itens_compra')
        .select('id, valor_total_orcado, valor_consumido')
        .eq('etapa_id', etapa.id)
        .eq('company_id', companyId)

      const itemsList = itens ?? []
      const itemIds = itemsList.map(i => i.id)

      let pedidoCount = 0
      let parcelaCount = 0

      if (itemIds.length > 0) {
        const { count: pCount } = await supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .in('item_compra_id', itemIds)

        pedidoCount = pCount ?? 0

        if (pedidoCount > 0) {
          const { data: pedidoIds } = await supabase
            .from('pedidos')
            .select('id')
            .in('item_compra_id', itemIds)

          if (pedidoIds && pedidoIds.length > 0) {
            const { count: parcCount } = await supabase
              .from('parcelas')
              .select('id', { count: 'exact', head: true })
              .in('pedido_id', pedidoIds.map(p => p.id))

            parcelaCount = parcCount ?? 0
          }
        }
      }

      return {
        itens: itemsList.length,
        pedidos: pedidoCount,
        parcelas: parcelaCount,
        orcado: itemsList.reduce((s, i) => s + (i.valor_total_orcado ?? 0), 0),
        consumido: itemsList.reduce((s, i) => s + (i.valor_consumido ?? 0), 0),
      }
    },
    enabled: !!etapa?.id,
    staleTime: 5000,
  })

  // -- Impact data (when dates change)
  const { data: impact, isLoading: impactLoading } = useQuery({
    queryKey: ['etapa-impact', etapa?.id, form.data_inicio_plan, form.data_fim_plan],
    queryFn: async (): Promise<ImpactData | null> => {
      if (!etapa?.data_inicio_plan || !form.data_inicio_plan) return null
      const delta = diffDays(localDate(form.data_inicio_plan), localDate(etapa.data_inicio_plan))
      if (delta === 0) return null

      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('id, data_entrega_prevista, valor_total_real, cond_pagamento, fornecedor_id, item_compra_id, itens_compra!inner(etapa_id, descricao), fornecedores(nome)')
        .eq('company_id', companyId)
        .eq('itens_compra.etapa_id', etapa.id)

      const affectedPedidos = (pedidos ?? []) as Array<Record<string, unknown>>
      const pedidoIds = affectedPedidos.map(p => p.id as string)

      if (pedidoIds.length === 0) return { pedidos: 0, parcelas: 0, delta, changes: [], totalShifted: 0 }

      const { data: parcelas } = await supabase
        .from('parcelas')
        .select('id, pedido_id, data_vencimento, valor, status')
        .in('pedido_id', pedidoIds)

      const futureParcelas = (parcelas ?? []).filter((p: Record<string, unknown>) =>
        p.status !== 'paga' && p.status !== 'parcialmente_paga'
      )

      const pedidoMap = new Map(affectedPedidos.map(p => [p.id as string, p]))

      const changes: ImpactChange[] = futureParcelas.map((p: Record<string, unknown>) => {
        const oldDate = p.data_vencimento as string
        const newDate = localDate(oldDate)
        newDate.setDate(newDate.getDate() + delta)
        const pedido = pedidoMap.get(p.pedido_id as string)
        return {
          id: p.id as string,
          valor: p.valor as number,
          dataAnterior: oldDate,
          dataNova: newDate.toISOString().split('T')[0]!,
          fornecedor: (pedido?.fornecedores as Record<string, string> | null)?.nome ?? '—',
          item: (pedido?.itens_compra as Record<string, string> | null)?.descricao ?? '—',
        }
      })

      const totalShifted = changes.reduce((s, c) => s + c.valor, 0)

      return {
        pedidos: affectedPedidos.length,
        parcelas: futureParcelas.length,
        delta,
        changes,
        totalShifted,
      }
    },
    enabled: dateChanged && !!etapa?.id,
    staleTime: 2000,
  })

  // -- Chart data for impact
  const chartData = useMemo(() => {
    if (!impact?.changes || impact.changes.length === 0) return []
    const allDates = [
      ...impact.changes.map(c => c.dataAnterior),
      ...impact.changes.map(c => c.dataNova),
    ].sort()

    const uniqueDates = [...new Set(allDates)]
    return uniqueDates.map(d => {
      const oldTotal = impact.changes.filter(c => c.dataAnterior <= d).reduce((s, c) => s + c.valor, 0)
      const newTotal = impact.changes.filter(c => c.dataNova <= d).reduce((s, c) => s + c.valor, 0)
      return {
        date: d,
        label: localDate(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        antes: -oldTotal,
        depois: -newTotal,
      }
    })
  }, [impact])

  // -- Save handler
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.codigo.trim()) { toast.error('Código é obrigatório'); return }

    setSaving(true)
    try {
      const payload: Partial<Etapa> = {
        nome: form.nome,
        codigo: form.codigo,
        data_inicio_plan: form.data_inicio_plan || null,
        data_fim_plan: form.data_fim_plan || null,
        data_inicio_real: form.data_inicio_real || null,
        data_fim_real: form.data_fim_real || null,
        casas_total: form.casas_total,
        status: form.status as Etapa['status'],
        ordem: form.ordem,
        depende_de: form.depende_de || null,
        observacoes: form.observacoes || null,
      }

      if (isNew) {
        await createEtapa.mutateAsync(payload)
      } else {
        // Audit log
        const dadosAntes = {
          nome: etapa.nome, codigo: etapa.codigo,
          data_inicio_plan: etapa.data_inicio_plan, data_fim_plan: etapa.data_fim_plan,
          status: etapa.status, casas_total: etapa.casas_total, ordem: etapa.ordem,
        }
        const dadosDepois = {
          nome: form.nome, codigo: form.codigo,
          data_inicio_plan: form.data_inicio_plan, data_fim_plan: form.data_fim_plan,
          status: form.status, casas_total: form.casas_total, ordem: form.ordem,
        }

        await updateEtapa.mutateAsync({ id: etapa.id, ...payload })

        // Log audit
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          tabela: 'etapas',
          acao: 'UPDATE', agente: 'humano',
          dados_antes: { ...dadosAntes, id: etapa.id },
          dados_depois: dadosDepois,
        })
      }

      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar etapa')
    } finally {
      setSaving(false)
    }
  }

  // -- Delete handler
  const handleDelete = async () => {
    if (!etapa) return
    if (deleteConfirmText !== etapa.nome) {
      toast.error('Digite o nome exato da etapa')
      return
    }

    setSaving(true)
    try {
      await deleteEtapa.mutateAsync(etapa.id)

      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        tabela: 'etapas',
        acao: 'DELETE', agente: 'humano',
        dados_antes: { nome: etapa.nome, codigo: etapa.codigo, casas_total: etapa.casas_total, id: etapa.id },
        dados_depois: null,
      })

      qc.invalidateQueries({ queryKey: ['itens_compra'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      toast.success('Etapa excluída com sucesso')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir etapa')
    } finally {
      setSaving(false)
    }
  }

  const saldo = (linkedSummary?.orcado ?? 0) - (linkedSummary?.consumido ?? 0)
  const otherEtapas = allEtapas.filter(e => e.id !== etapa?.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h3 className="font-semibold">{isNew ? 'Nova Etapa' : 'Editar Etapa'}</h3>
            {etapa && <p className="text-xs text-muted-foreground">{etapa.codigo} — {etapa.nome}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        {!isNew && (
          <div className="flex border-b px-5">
            <button
              onClick={() => setActiveTab('dados')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'dados'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Dados
            </button>
            <button
              onClick={() => setActiveTab('impacto')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'impacto'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Impacto
              {dateChanged && (
                <span className="flex h-2 w-2 rounded-full bg-amber-500" />
              )}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {(activeTab === 'dados' || isNew) && (
            <DadosTab
              form={form}
              set={set}
              otherEtapas={otherEtapas}
              linkedSummary={linkedSummary}
              saldo={saldo}
              isNew={isNew}
            />
          )}

          {activeTab === 'impacto' && !isNew && (
            <ImpactoTab
              impact={impact}
              impactLoading={impactLoading}
              chartData={chartData}
              dateChanged={dateChanged}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <div>
            {!isNew && !showDelete && (
              <button
                onClick={() => setShowDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir etapa
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
              Cancelar
            </button>
            {dateChanged && !isNew ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {saving ? 'Salvando...' : 'Confirmar impacto'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Salvando...' : isNew ? 'Criar etapa' : 'Salvar alterações'}
              </button>
            )}
          </div>
        </div>

        {/* Delete Confirmation Overlay */}
        {showDelete && etapa && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 p-8">
            <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-card p-5 shadow-2xl">
              <div className="mb-3 flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
                <h4 className="font-semibold">Excluir Etapa</h4>
              </div>

              <p className="mb-2 text-sm text-muted-foreground">
                Esta etapa tem{' '}
                <strong className="text-foreground">{linkedSummary?.itens ?? 0} itens de compra</strong>,{' '}
                <strong className="text-foreground">{linkedSummary?.pedidos ?? 0} pedidos</strong> e{' '}
                <strong className="text-foreground">{linkedSummary?.parcelas ?? 0} parcelas</strong> vinculadas.
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                A exclusão é irreversível. Digite <strong className="text-red-500">"{etapa.nome}"</strong> para confirmar:
              </p>

              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={etapa.nome}
                className="mb-4 w-full rounded-lg border border-red-500/30 bg-background px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowDelete(false); setDeleteConfirmText('') }}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== etapa.nome || saving}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {saving ? 'Excluindo...' : 'Excluir permanentemente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dados Tab
// ---------------------------------------------------------------------------

function DadosTab({
  form, set, otherEtapas, linkedSummary, saldo, isNew,
}: {
  form: Record<string, unknown>
  set: (key: string, value: unknown) => void
  otherEtapas: Etapa[]
  linkedSummary?: { itens: number; pedidos: number; parcelas: number; orcado: number; consumido: number } | null
  saldo: number
  isNew: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Basic info */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nome" value={form.nome as string} onChange={v => set('nome', v)} />
        <FormField label="Código" value={form.codigo as string} onChange={v => set('codigo', v)} />
      </div>

      {/* Dates */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Datas Planejadas</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Início Planejado" type="date" value={form.data_inicio_plan as string} onChange={v => set('data_inicio_plan', v)} />
          <FormField label="Fim Planejado" type="date" value={form.data_fim_plan as string} onChange={v => set('data_fim_plan', v)} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Datas Reais</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Início Real" type="date" value={form.data_inicio_real as string} onChange={v => set('data_inicio_real', v)} />
          <FormField label="Fim Real" type="date" value={form.data_fim_real as string} onChange={v => set('data_fim_real', v)} />
        </div>
      </div>

      {/* Config */}
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Casas Total" type="number" value={String(form.casas_total)} onChange={v => set('casas_total', Number(v) || 0)} />
        <FormField label="Ordem" type="number" value={String(form.ordem)} onChange={v => set('ordem', Number(v) || 0)} />
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Status</label>
          <select
            value={form.status as string}
            onChange={e => set('status', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="futuro">Futuro</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluido">Concluído</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
      </div>

      {/* Dependency */}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Depende de</label>
        <select
          value={form.depende_de as string}
          onChange={e => set('depende_de', e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="">— Nenhuma —</option>
          {otherEtapas.map(e => (
            <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>
          ))}
        </select>
      </div>

      {/* Observations */}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Observações</label>
        <textarea
          value={form.observacoes as string}
          onChange={e => set('observacoes', e.target.value)}
          rows={2}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Financial summary (read-only, existing only) */}
      {!isNew && linkedSummary && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo Financeiro</p>
          <div className="grid grid-cols-3 gap-3">
            <FinCard icon={DollarSign} label="Orçado" value={formatCurrency(linkedSummary.orcado)} />
            <FinCard icon={Package} label="Consumido" value={formatCurrency(linkedSummary.consumido)} accent="amber" />
            <FinCard icon={DollarSign} label="Saldo" value={formatCurrency(saldo)} accent={saldo >= 0 ? 'emerald' : 'red'} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <p className="text-[10px] text-muted-foreground"><strong>{linkedSummary.itens}</strong> itens</p>
            <p className="text-[10px] text-muted-foreground"><strong>{linkedSummary.pedidos}</strong> pedidos</p>
            <p className="text-[10px] text-muted-foreground"><strong>{linkedSummary.parcelas}</strong> parcelas</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Impacto Tab
// ---------------------------------------------------------------------------

function ImpactoTab({
  impact, impactLoading, chartData, dateChanged,
}: {
  impact: ImpactData | null | undefined
  impactLoading: boolean
  chartData: Array<{ label: string; antes: number; depois: number }>
  dateChanged: boolean
}) {
  if (!dateChanged) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="text-center">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Altere as datas planejadas para ver o impacto</p>
        </div>
      </div>
    )
  }

  if (impactLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!impact) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Nenhum impacto detectado</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Delta header */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-semibold">
            Deslocamento de {impact.delta > 0 ? '+' : ''}{impact.delta} dias
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCurrency(impact.totalShifted)} em parcelas serão movidas para novas datas.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <p className="text-lg font-bold">{impact.pedidos}</p>
          <p className="text-[10px] text-muted-foreground">Pedidos afetados</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <p className="text-lg font-bold">{impact.parcelas}</p>
          <p className="text-[10px] text-muted-foreground">Parcelas afetadas</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <p className="text-lg font-bold text-amber-500">{formatCurrency(impact.totalShifted)}</p>
          <p className="text-[10px] text-muted-foreground">Total deslocado</p>
        </div>
      </div>

      {/* Changes list */}
      {impact.changes.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Parcelas Afetadas
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40">
                <tr className="text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                  <th className="px-2 py-1.5 text-center font-medium">Antes → Depois</th>
                </tr>
              </thead>
              <tbody>
                {impact.changes.slice(0, 20).map(c => (
                  <tr key={c.id} className="border-t border-border/30">
                    <td className="px-2 py-1 truncate max-w-[100px]">{c.fornecedor ?? '—'}</td>
                    <td className="px-2 py-1 truncate max-w-[120px]">{c.item ?? '—'}</td>
                    <td className="px-2 py-1 text-right font-medium">{formatCurrency(c.valor)}</td>
                    <td className="px-2 py-1 text-center">
                      <span className="text-muted-foreground">
                        {localDate(c.dataAnterior).toLocaleDateString('pt-BR')}
                      </span>
                      <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-blue-500">
                        {localDate(c.dataNova).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {impact.changes.length > 20 && (
              <p className="border-t px-2 py-1 text-[10px] text-muted-foreground">
                ...e mais {impact.changes.length - 20} parcela(s)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cash flow chart */}
      {chartData.length > 1 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fluxo de Caixa — Antes vs Depois
          </p>
          <div className="h-36 rounded-lg border bg-muted/20 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip
                  contentStyle={{ fontSize: 10, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Line type="monotone" dataKey="antes" stroke="rgb(148 163 184)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="Antes" />
                <Line type="monotone" dataKey="depois" stroke="rgb(59 130 246)" strokeWidth={2} dot={false} name="Depois" />
                <ReferenceLine y={0} stroke="rgb(239 68 68 / 0.4)" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FormField({
  label, type = 'text', value, onChange,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

function FinCard({
  icon: Icon, label, value, accent,
}: {
  icon: typeof DollarSign; label: string; value: string; accent?: string
}) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : ''
  return (
    <div className="rounded-lg bg-card p-2 text-center">
      <Icon className={`mx-auto mb-0.5 h-3.5 w-3.5 ${color || 'text-muted-foreground'}`} />
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}
