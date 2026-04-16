import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  useParcelas, useCreateParcela, useDeleteParcela,
  useContasBancarias, useCreateContaBancaria,
  type Parcela, type ContaBancaria,
} from '@/hooks/useFinanceiro'
import { usePedidos, useFornecedores, type Pedido, type Fornecedor } from '@/hooks/useCompras'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import { useMutuos, useUpdateMutuoParcela } from '@/hooks/useMutuos'
import { toast } from 'sonner'
import { useDropzone } from 'react-dropzone'
import BulkActionBar from '@/components/BulkActionBar'
import PagamentosBulkActions from '@/components/PagamentosBulkActions'
import { useSelection } from '@/hooks/useSelection'
import {
  Wallet, Plus, X, Check, AlertTriangle, Clock,
  CheckCircle2, CreditCard, Search, CalendarClock,
  Calendar, Users, Upload, Paperclip, ChevronDown, ChevronRight, Trash2
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  futura: { label: 'Futura', color: 'bg-slate-500/10 text-slate-500', icon: Clock },
  a_vencer: { label: 'A Vencer', color: 'bg-amber-500/10 text-amber-600', icon: CalendarClock },
  paga: { label: 'Paga', color: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  vencida: { label: 'Vencida', color: 'bg-red-500/10 text-red-500', icon: AlertTriangle },
  parcialmente_paga: { label: 'Parcial', color: 'bg-blue-500/10 text-blue-500', icon: CreditCard },
}

type Tab = 'parcelas' | 'agenda' | 'por_fornecedor' | 'contas'

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function PagamentosPage() {
  const { restartTour } = useTour('pagamentos', pageTours.pagamentos)
  const [searchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'parcelas')
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const TABS: Array<{ key: Tab; label: string; icon: typeof Clock }> = [
    { key: 'parcelas', label: 'Parcelas', icon: CalendarClock },
    { key: 'agenda', label: 'Agenda', icon: Calendar },
    { key: 'por_fornecedor', label: 'Por Fornecedor', icon: Users },
    { key: 'contas', label: 'Contas Bancárias', icon: CreditCard },
  ]

  return (
    <div>
      <PageHeader title="Pagamentos" description="Parcelas, agenda e contas bancárias" icon={Wallet} onHelp={restartTour} />

      <div id="tour-pag-filters" className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'parcelas' || tab === 'contas') && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className={`${INPUT} pl-9`} />
        </div>
      )}

      {tab === 'parcelas' && <ParcelasTab search={search} />}
      {tab === 'agenda' && <AgendaTab />}
      {tab === 'por_fornecedor' && <PorFornecedorTab />}
      {tab === 'contas' && <ContasTab search={search} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PARCELAS TAB — with full payment flow modal
// ═══════════════════════════════════════════════════════════════

function ParcelasTab({ search }: { search: string }) {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: parcelas = [], isLoading } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: contas = [] } = useContasBancarias()
  const createParcela = useCreateParcela()
  const deleteParcela = useDeleteParcela()
  const [showForm, setShowForm] = useState(false)
  const [payingParcela, setPayingParcela] = useState<Parcela | null>(null)
  const selection = useSelection()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: mutuos = [] } = useMutuos()
  const updateMutuoParcela = useUpdateMutuoParcela()

  // Build fornecedor lookup map for bulk actions
  const fornecedorMap = useMemo(() => {
    const map = new Map<string, string>()
    pedidos.forEach(p => {
      const f = fornecedores.find(f => f.id === p.fornecedor_id)
      if (f) map.set(p.id, f.nome)
    })
    return map
  }, [pedidos, fornecedores])

  // Quick selection helpers
  const today = new Date().toISOString().split('T')[0]!
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!
  const selectVencidas = () => selection.selectAll(filtered.filter(p => p.status !== 'paga' && p.data_vencimento < today).map(p => p.id))
  const selectSemana = () => selection.selectAll(filtered.filter(p => p.status !== 'paga' && p.data_vencimento >= today && p.data_vencimento <= weekEnd).map(p => p.id))

  const [form, setForm] = useState({
    pedido_id: '', numero_parcela: '1', valor: '', data_vencimento: '',
    forma_pagamento: '', status: 'futura', descricao: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createParcela.mutateAsync({
      pedido_id: form.pedido_id || null,
      numero_parcela: parseInt(form.numero_parcela),
      valor: parseFloat(form.valor),
      data_vencimento: form.data_vencimento,
      forma_pagamento: form.forma_pagamento || null,
      status: form.status as Parcela['status'],
      descricao: !form.pedido_id ? form.descricao || null : null,
    })
    setShowForm(false)
    setForm({ pedido_id: '', numero_parcela: '1', valor: '', data_vencimento: '', forma_pagamento: '', status: 'futura', descricao: '' })
  }

  const filtered = parcelas.filter((p) =>
    (p.pedido_item ?? p.descricao ?? '').toLowerCase().includes(search.toLowerCase()) ||
    p.status.includes(search.toLowerCase())
  )

  // Merge mutuo parcelas into the list
  const mutuoParcelas = useMemo(() => {
    const result: Array<Parcela & { _source: 'mutuo'; _mutuoNome: string }> = []
    mutuos.forEach(m => {
      ;(m.parcelas ?? []).forEach((mp: any) => {
        result.push({
          id: mp.id,
          company_id: mp.company_id,
          pedido_id: null,
          despesa_indireta_id: null,
          numero_parcela: mp.numero_parcela,
          valor: Number(mp.valor),
          valor_pago: Number(mp.valor_pago || 0),
          data_vencimento: mp.data_vencimento,
          data_pagamento_real: mp.data_pagamento_real ?? null,
          status: mp.status,
          forma_pagamento: null,
          comprovante_path: null,
          pedido_item: null,
          descricao: `${m.nome} (${m.tipo})`,
          observacoes: null,
          _source: 'mutuo' as const,
          _mutuoNome: m.nome,
        } as any)
      })
    })
    if (search) {
      const q = search.toLowerCase()
      return result.filter(p => p.descricao?.toLowerCase().includes(q) || p._mutuoNome.toLowerCase().includes(q))
    }
    return result
  }, [mutuos, search])

  const allFiltered = useMemo(() => {
    const combined = [
      ...filtered.map(p => ({ ...p, _source: 'pedido' as const, _mutuoNome: '' })),
      ...mutuoParcelas,
    ]
    return combined.sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''))
  }, [filtered, mutuoParcelas])

  const totals = allFiltered.reduce(
    (acc, p) => ({
      total: acc.total + p.valor,
      pago: acc.pago + p.valor_pago,
      pendente: acc.pendente + (p.status !== 'paga' ? p.valor - p.valor_pago : 0),
    }),
    { total: 0, pago: 0, pendente: 0 }
  )

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniCard label="Total Parcelas" value={formatCurrency(totals.total)} />
        <MiniCard label="Pago" value={formatCurrency(totals.pago)} accent="emerald" />
        <MiniCard label="Pendente" value={formatCurrency(totals.pendente)} accent="amber" />
        <MiniCard label="Qtd." value={`${filtered.length} + ${mutuoParcelas.length} mút.`} />
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova Parcela
        </button>
        <div className="ml-auto flex gap-1.5">
          <button onClick={selectVencidas} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10">Vencidas</button>
          <button onClick={selectSemana} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/10">Esta semana</button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Nova Parcela</h3>
            <button onClick={() => setShowForm(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div><label className={LABEL}>Pedido</label><select value={form.pedido_id} onChange={(e) => setForm((p) => ({ ...p, pedido_id: e.target.value }))} className={INPUT}><option value="">Avulsa</option>{pedidos.map((pd) => <option key={pd.id} value={pd.id}>{pd.item_descricao ?? pd.id.slice(0, 8)}</option>)}</select></div>
              {!form.pedido_id && (
                <div><label className={LABEL}>Descrição *</label><input type="text" value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} required className={INPUT} /></div>
              )}
              <div><label className={LABEL}>Nº Parcela</label><input type="number" min="1" value={form.numero_parcela} onChange={(e) => setForm((p) => ({ ...p, numero_parcela: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Valor (R$) *</label><input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} required className={INPUT} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Vencimento *</label><input type="date" value={form.data_vencimento} onChange={(e) => setForm((p) => ({ ...p, data_vencimento: e.target.value }))} required className={INPUT} /></div>
              <div><label className={LABEL}>Forma Pagamento</label><input type="text" value={form.forma_pagamento} onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))} placeholder="PIX, Boleto" className={INPUT} /></div>
              <div><label className={LABEL}>Status</label><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={INPUT}><option value="futura">Futura</option><option value="a_vencer">A Vencer</option></select></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Criar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhuma parcela encontrada" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2.5 text-center">
                  <input type="checkbox"
                    checked={selection.count === allFiltered.length && allFiltered.length > 0}
                    onChange={() => selection.toggleAll(allFiltered.map(p => p.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vencimento</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-8"></th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allFiltered.map((p) => {
                const cfg = statusConfig[p.status] ?? statusConfig['futura']!
                const isMutuo = (p as any)._source === 'mutuo'
                return (
                  <tr key={p.id} className="group hover:bg-muted/20">
                    <td className="px-2 py-2.5 text-center">
                      <input type="checkbox" checked={selection.isSelected(p.id)}
                        onChange={() => selection.toggle(p.id)}
                        className="h-3.5 w-3.5 rounded accent-primary" />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        {isMutuo && <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">MÚTUO</span>}
                        {p.pedido_item ?? p.descricao ?? 'Avulsa'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{p.numero_parcela}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium">{formatCurrency(p.valor)}</td>
                    <td className="px-3 py-2.5 text-center text-xs">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-center text-xs">{p.data_pagamento_real ? localDate(p.data_pagamento_real).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${cfg.color}`}>
                        <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {!isMutuo && p.comprovante_path && (
                        <button onClick={() => window.open(supabase.storage.from('comprovantes').getPublicUrl(p.comprovante_path!).data.publicUrl)} title="Ver comprovante" className="text-muted-foreground hover:text-primary">
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center flex items-center justify-center gap-1">
                      {p.status !== 'paga' && !isMutuo && (
                        <button onClick={() => setPayingParcela(p)} className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                          Pagar
                        </button>
                      )}
                      {p.status !== 'paga' && isMutuo && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Confirmar baixa de ${formatCurrency(p.valor)}?`)) {
                              updateMutuoParcela.mutate({ id: p.id, status: 'paga', valor_pago: p.valor, data_pagamento_real: new Date().toISOString().split('T')[0] })
                            }
                          }}
                          disabled={updateMutuoParcela.isPending}
                          className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          Baixar
                        </button>
                      )}
                      {p.status !== 'paga' && !isMutuo && (
                        <button onClick={() => { if (window.confirm('Excluir parcela?')) deleteParcela.mutate(p.id) }} className="rounded-md p-1 text-red-500 hover:bg-red-500/10 transition-colors text-[10px]" title="Excluir">
                          <Trash2 className="h-3 w-3" />
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

      {/* Bulk Action Bar */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <PagamentosBulkActions
          parcelas={parcelas}
          selectedIds={selection.selected}
          fornecedorMap={fornecedorMap}
          onDone={selection.clear}
        />
      </BulkActionBar>

      {/* Payment Modal */}
      {payingParcela && currentCompany && (
        <PaymentModal
          parcela={payingParcela}
          pedidos={pedidos}
          contas={contas}
          companyId={currentCompany.id}
          onClose={() => setPayingParcela(null)}
          onDone={() => {
            setPayingParcela(null)
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['itens_compra'] })
            qc.invalidateQueries({ queryKey: ['movimentacoes'] })
            qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
          }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT MODAL — Full payment flow with upload
// ═══════════════════════════════════════════════════════════════

function PaymentModal({
  parcela, pedidos, contas, companyId, onClose, onDone,
}: {
  parcela: Parcela
  pedidos: Pedido[]
  contas: ContaBancaria[]
  companyId: string
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    data_pagamento: new Date().toISOString().split('T')[0]!,
    valor_pago: String(parcela.valor - parcela.valor_pago),
    forma_pagamento: 'PIX',
    conta_bancaria_id: contas.find((c) => c.ativa)?.id ?? '',
    observacoes: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxFiles: 1,
    onDrop: (files) => setFile(files[0] ?? null),
  })

  const pedido = pedidos.find((p) => p.id === parcela.pedido_id)
  const descLabel = `Pgto ${pedido?.fornecedor_nome ?? '—'} - ${parcela.pedido_item ?? parcela.descricao ?? 'Avulsa'}`

  const handlePay = async () => {
    setSaving(true)
    const valorPago = parseFloat(form.valor_pago) || 0

    try {
      // 1. Upload comprovante (if any)
      let comprovantePath: string | null = null
      if (file) {
        const filePath = `${companyId}/${parcela.id}/${file.name}`
        const { error: upErr } = await supabase.storage.from('comprovantes').upload(filePath, file, { upsert: true })
        if (upErr) console.error('Upload error:', upErr)
        else comprovantePath = filePath
      }

      // 2. Update parcela
      const { error: e1 } = await supabase
        .from('parcelas')
        .update({
          data_pagamento_real: form.data_pagamento,
          valor_pago: parcela.valor_pago + valorPago,
          forma_pagamento: form.forma_pagamento,
          conta_bancaria_id: form.conta_bancaria_id || null,
          status: (parcela.valor_pago + valorPago) >= parcela.valor ? 'paga' : 'parcialmente_paga',
          ...(comprovantePath ? { comprovante_path: comprovantePath } : {}),
          ...(form.observacoes ? { observacoes: form.observacoes } : {}),
        })
        .eq('id', parcela.id)
      if (e1) throw e1

      // 3. Update itens_compra: valor_consumido += valor_pago
      if (parcela.pedido_id) {
        // Find item_compra_id via pedido
        const pedidoData = pedidos.find((p) => p.id === parcela.pedido_id)
        if (pedidoData?.item_compra_id) {
          await supabase.rpc('increment_valor_consumido', {
            p_item_id: pedidoData.item_compra_id,
            p_valor: valorPago,
          }).then(({ error }) => {
            if (error) {
              // Fallback: direct SQL-like update via raw approach
              console.warn('RPC not found, using direct update fallback')
              supabase
                .from('itens_compra')
                .select('valor_consumido')
                .eq('id', pedidoData.item_compra_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    supabase
                      .from('itens_compra')
                      .update({
                        valor_consumido: (data.valor_consumido ?? 0) + valorPago,
                        // valor_saldo: GENERATED ALWAYS — auto-calculated by PostgreSQL
                      })
                      .eq('id', pedidoData.item_compra_id)
                      .then(() => {})
                  }
                })
            }
          })
        }
      }

      // 4. Create bank transaction
      if (form.conta_bancaria_id) {
        await supabase.from('movimentacoes_bancarias').insert({
          company_id: companyId,
          conta_id: form.conta_bancaria_id,
          data: form.data_pagamento,
          descricao: descLabel,
          valor: valorPago,
          tipo: 'saida',
          parcela_id: parcela.id,
        })
      }

      // 5. Audit log
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        tabela: 'parcelas',
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'pagamento', id: parcela.id, status: parcela.status, valor_pago: parcela.valor_pago },
        dados_depois: { status: 'paga', valor_pago: parcela.valor_pago + valorPago, forma: form.forma_pagamento },
      })

      toast.success('Pagamento registrado com sucesso')
      onDone()
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h3 className="font-semibold">Registrar Pagamento</h3>
            <p className="text-xs text-muted-foreground">{parcela.pedido_item ?? parcela.descricao ?? 'Avulsa'} — Parcela {parcela.numero_parcela}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          {/* Summary */}
          <div className="flex gap-4 rounded-lg bg-muted/30 p-3 text-xs">
            <div><span className="text-muted-foreground">Valor total:</span> <strong>{formatCurrency(parcela.valor)}</strong></div>
            <div><span className="text-muted-foreground">Já pago:</span> <strong>{formatCurrency(parcela.valor_pago)}</strong></div>
            <div><span className="text-muted-foreground">Restante:</span> <strong className="text-amber-500">{formatCurrency(parcela.valor - parcela.valor_pago)}</strong></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={LABEL}>Data Pagamento *</label><input type="date" value={form.data_pagamento} onChange={(e) => setForm((p) => ({ ...p, data_pagamento: e.target.value }))} className={INPUT} /></div>
            <div><label className={LABEL}>Valor Pago (R$) *</label><input type="number" step="0.01" value={form.valor_pago} onChange={(e) => setForm((p) => ({ ...p, valor_pago: e.target.value }))} className={INPUT} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Forma Pagamento</label>
              <select value={form.forma_pagamento} onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))} className={INPUT}>
                <option value="PIX">PIX</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
                <option value="Cheque">Cheque</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Conta Bancária</label>
              <select value={form.conta_bancaria_id} onChange={(e) => setForm((p) => ({ ...p, conta_bancaria_id: e.target.value }))} className={INPUT}>
                <option value="">Nenhuma</option>
                {contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome} {c.banco ? `(${c.banco})` : ''}</option>)}
              </select>
            </div>
          </div>

          {/* Upload comprovante */}
          <div>
            <label className={LABEL}>Comprovante</label>
            <div
              {...getRootProps()}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-4 w-4 text-muted-foreground" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                <span className="text-muted-foreground">Arraste PDF/JPG/PNG ou clique</span>
              )}
            </div>
          </div>

          {/* Observação — Fix #08 */}
          <div>
            <label className={LABEL}>Observação</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              rows={2}
              className={`${INPUT} resize-none`}
              placeholder="Notas sobre o pagamento (opcional)"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
          <button onClick={handlePay} disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Check className="h-4 w-4" />{saving ? 'Processando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AGENDA TAB — Weekly/Monthly calendar view
// ═══════════════════════════════════════════════════════════════

function AgendaTab() {
  const { data: parcelas = [], isLoading } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: contas = [] } = useContasBancarias()
  const [view, setView] = useState<'semana' | 'mes'>('semana')

  const today = new Date()
  const todayISO = today.toISOString().split('T')[0]!

  // Build date range
  const { days, label } = useMemo(() => {
    const d = new Date(today)
    if (view === 'semana') {
      const dow = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
      const days: string[] = []
      for (let i = 0; i < 7; i++) {
        const dd = new Date(monday)
        dd.setDate(monday.getDate() + i)
        days.push(dd.toISOString().split('T')[0]!)
      }
      const label = `Semana de ${localDate(days[0]!).toLocaleDateString('pt-BR')} a ${localDate(days[6]!).toLocaleDateString('pt-BR')}`
      return { days, label }
    } else {
      const year = d.getFullYear()
      const month = d.getMonth()
      const lastDay = new Date(year, month + 1, 0).getDate()
      const days: string[] = []
      for (let i = 1; i <= lastDay; i++) {
        const dd = new Date(year, month, i)
        days.push(dd.toISOString().split('T')[0]!)
      }
      const label = `${d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`
      return { days, label }
    }
  }, [view])

  // Group parcelas by date
  const byDate = useMemo(() => {
    const map = new Map<string, Parcela[]>()
    days.forEach((d) => map.set(d, []))
    parcelas
      .filter((p) => p.status !== 'paga' && days.includes(p.data_vencimento))
      .forEach((p) => {
        map.get(p.data_vencimento)?.push(p)
      })
    return map
  }, [parcelas, days])

  // Totals
  const totalPeriod = useMemo(() => {
    let sum = 0
    byDate.forEach((ps) => ps.forEach((p) => { sum += p.valor - p.valor_pago }))
    return sum
  }, [byDate])

  // Projected balance
  const saldoAtual = contas.find((c) => c.ativa)?.saldo_inicial ?? 0
  const saldoProjetado = saldoAtual - totalPeriod
  const isNegative = saldoProjetado < 0

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  if (isLoading) return <Spinner />

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold capitalize">{label}</h3>
        </div>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <button onClick={() => setView('semana')} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${view === 'semana' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Semana</button>
          <button onClick={() => setView('mes')} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${view === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Mês</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <MiniCard label={`Total ${view === 'semana' ? 'Semana' : 'Mês'}`} value={formatCurrency(totalPeriod)} accent="amber" />
        <MiniCard label="Saldo Atual (1ª conta)" value={formatCurrency(saldoAtual)} />
        <div className={`rounded-xl border p-3 ${isNegative ? 'border-red-500/30 bg-red-500/5' : 'bg-card'}`}>
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Saldo Projetado</p>
            {isNegative && <AlertTriangle className="h-3 w-3 text-red-500" />}
          </div>
          <p className={`mt-1 text-lg font-bold ${isNegative ? 'text-red-500' : 'text-emerald-500'}`}>{formatCurrency(saldoProjetado)}</p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className={`grid gap-2 ${view === 'semana' ? 'grid-cols-7' : 'grid-cols-7'}`}>
        {view === 'mes' && dayNames.map((n) => (
          <div key={n} className="text-center text-[9px] font-semibold uppercase text-muted-foreground py-1">{n}</div>
        ))}
        {view === 'mes' && (() => {
          const firstDay = localDate(days[0]!).getDay()
          const blanks = firstDay === 0 ? 6 : firstDay - 1
          return Array.from({ length: blanks }).map((_, i) => <div key={`blank-${i}`} />)
        })()}
        {days.map((day) => {
          const ps = byDate.get(day) ?? []
          const dayTotal = ps.reduce((s, p) => s + p.valor - p.valor_pago, 0)
          const isToday = day === todayISO
          const d = localDate(day)

          return (
            <div
              key={day}
              className={`min-h-[80px] rounded-lg border p-2 text-xs transition-colors ${
                isToday ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-muted/20'
              } ${view === 'semana' ? '' : 'min-h-[70px]'}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-[10px] font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {view === 'semana' ? dayNames[d.getDay()] : ''} {d.getDate()}/{d.getMonth() + 1}
                </span>
                {dayTotal > 0 && <span className="text-[9px] font-bold text-amber-500">{formatCurrency(dayTotal)}</span>}
              </div>
              <div className="space-y-1">
                {ps.slice(0, view === 'semana' ? 5 : 3).map((p) => {
                  const ped = pedidos.find((pd) => pd.id === p.pedido_id)
                  const cfg = statusConfig[p.status]!
                  return (
                    <div key={p.id} className={`rounded px-1.5 py-0.5 text-[9px] ${cfg.color}`}>
                      <div className="truncate font-medium">{ped?.fornecedor_nome ?? p.pedido_item ?? p.descricao ?? 'Avulsa'}</div>
                      <div className="font-bold">{formatCurrency(p.valor - p.valor_pago)}</div>
                    </div>
                  )
                })}
                {ps.length > (view === 'semana' ? 5 : 3) && (
                  <div className="text-[8px] text-muted-foreground">+{ps.length - (view === 'semana' ? 5 : 3)} mais</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// POR FORNECEDOR TAB — with batch payment
// ═══════════════════════════════════════════════════════════════

function PorFornecedorTab() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: parcelas = [], isLoading } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: contas = [] } = useContasBancarias()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchModal, setBatchModal] = useState(false)

  // Group parcelas by fornecedor
  const groups = useMemo(() => {
    const map = new Map<string, { fornecedor: Fornecedor | null; parcelas: (Parcela & { pedido?: Pedido })[] }>()

    parcelas.forEach((p) => {
      const ped = pedidos.find((pd) => pd.id === p.pedido_id)
      const fid = ped?.fornecedor_id ?? '__avulso__'
      if (!map.has(fid)) {
        const forn = fornecedores.find((f) => f.id === fid) ?? null
        map.set(fid, { fornecedor: forn, parcelas: [] })
      }
      map.get(fid)!.parcelas.push({ ...p, pedido: ped })
    })

    return [...map.entries()].map(([fid, g]) => {
      const pendentes = g.parcelas.filter((p) => p.status !== 'paga')
      const pagas = g.parcelas.filter((p) => p.status === 'paga')
      const totalPend = pendentes.reduce((s, p) => s + p.valor - p.valor_pago, 0)
      const totalPago = pagas.reduce((s, p) => s + p.valor_pago, 0)

      const today = new Date().toISOString().split('T')[0]!
      const proxVenc = pendentes
        .filter((p) => p.data_vencimento >= today)
        .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))[0]

      return {
        id: fid,
        nome: g.fornecedor?.nome ?? 'Sem Fornecedor',
        pendentes,
        totalPendente: totalPend,
        totalPago,
        proxVenc: proxVenc?.data_vencimento ?? null,
      }
    }).sort((a, b) => b.totalPendente - a.totalPendente)
  }, [parcelas, pedidos, fornecedores])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = useMemo(() => {
    return parcelas
      .filter((p) => selectedIds.has(p.id))
      .reduce((s, p) => s + p.valor - p.valor_pago, 0)
  }, [selectedIds, parcelas])

  if (isLoading) return <Spinner />
  if (groups.length === 0) return <EmptyState msg="Sem dados de fornecedores" />

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium">
            <strong>{selectedIds.size}</strong> parcela(s) selecionada(s) — Total: <strong>{formatCurrency(totalSelected)}</strong>
          </p>
          <button onClick={() => setBatchModal(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
            <Check className="h-3.5 w-3.5" /> Pagar Selecionadas
          </button>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border bg-card transition-shadow hover:shadow-sm">
            <button
              onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              {expandedId === g.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div className="flex-1">
                <h4 className="text-sm font-semibold">{g.nome}</h4>
                <p className="text-[10px] text-muted-foreground">{g.pendentes.length} pendente(s)</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Pendente</p>
                  <p className="font-semibold text-amber-500">{formatCurrency(g.totalPendente)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Pago</p>
                  <p className="font-semibold text-emerald-500">{formatCurrency(g.totalPago)}</p>
                </div>
                {g.proxVenc && (
                  <div className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px]">{localDate(g.proxVenc).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
            </button>

            {expandedId === g.id && (
              <div className="border-t px-4 pb-3 pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[9px] uppercase text-muted-foreground">
                      <th className="py-1 w-8"></th>
                      <th className="py-1 text-left">Item</th>
                      <th className="py-1 text-center">#</th>
                      <th className="py-1 text-right">Valor</th>
                      <th className="py-1 text-center">Vencimento</th>
                      <th className="py-1 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {g.pendentes.map((p) => {
                      const cfg = statusConfig[p.status]!
                      return (
                        <tr key={p.id} className="hover:bg-muted/10">
                          <td className="py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              className="h-3.5 w-3.5 rounded border-border"
                            />
                          </td>
                          <td className="py-1.5">{p.pedido_item ?? p.descricao ?? 'Avulsa'}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{p.numero_parcela}</td>
                          <td className="py-1.5 text-right font-medium">{formatCurrency(p.valor - p.valor_pago)}</td>
                          <td className="py-1.5 text-center">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</td>
                          <td className="py-1.5 text-center">
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Batch Payment Modal */}
      {batchModal && currentCompany && (
        <BatchPaymentModal
          parcelaIds={[...selectedIds]}
          parcelas={parcelas}
          pedidos={pedidos}
          contas={contas}
          companyId={currentCompany.id}
          onClose={() => setBatchModal(false)}
          onDone={() => {
            setBatchModal(false)
            setSelectedIds(new Set())
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['itens_compra'] })
            qc.invalidateQueries({ queryKey: ['movimentacoes'] })
            qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
          }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// BATCH PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════

function BatchPaymentModal({
  parcelaIds, parcelas, pedidos, contas, companyId, onClose, onDone,
}: {
  parcelaIds: string[]
  parcelas: Parcela[]
  pedidos: Pedido[]
  contas: ContaBancaria[]
  companyId: string
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    data_pagamento: new Date().toISOString().split('T')[0]!,
    forma_pagamento: 'PIX',
    conta_bancaria_id: contas.find((c) => c.ativa)?.id ?? '',
  })
  const [saving, setSaving] = useState(false)

  const selected = parcelas.filter((p) => parcelaIds.includes(p.id))
  const totalValor = selected.reduce((s, p) => s + p.valor - p.valor_pago, 0)

  const handleBatchPay = async () => {
    setSaving(true)
    try {
      for (const parc of selected) {
        const valorPago = parc.valor - parc.valor_pago
        const pedido = pedidos.find((p) => p.id === parc.pedido_id)
        const desc = `Pgto ${pedido?.fornecedor_nome ?? '—'} - ${parc.pedido_item ?? 'Avulsa'}`

        // 1. Update parcela
        await supabase.from('parcelas').update({
          data_pagamento_real: form.data_pagamento,
          valor_pago: parc.valor,
          forma_pagamento: form.forma_pagamento,
          conta_bancaria_id: form.conta_bancaria_id || null,
          status: 'paga',
        }).eq('id', parc.id)

        // 2. Update item_compra
        if (pedido?.item_compra_id) {
          const { data: item } = await supabase
            .from('itens_compra')
            .select('valor_consumido, valor_total_orcado')
            .eq('id', pedido.item_compra_id)
            .single()
          if (item) {
            await supabase.from('itens_compra').update({
              valor_consumido: (item.valor_consumido ?? 0) + valorPago,
              // valor_saldo: GENERATED ALWAYS — auto-calculated by PostgreSQL
            }).eq('id', pedido.item_compra_id)
          }
        }

        // 3. Bank transaction
        if (form.conta_bancaria_id) {
          await supabase.from('movimentacoes_bancarias').insert({
            company_id: companyId,
            conta_id: form.conta_bancaria_id,
            data: form.data_pagamento,
            descricao: desc,
            valor: valorPago,
            tipo: 'saida',
            parcela_id: parc.id,
          })
        }

        // 4. Audit log
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          tabela: 'parcelas',
          acao: 'UPDATE', agente: 'humano',
          dados_antes: { operacao: 'pagamento_lote', id: parc.id, status: parc.status, valor_pago: parc.valor_pago },
          dados_depois: { status: 'paga', valor_pago: parc.valor, forma: form.forma_pagamento },
        })
      }

      toast.success(`${selected.length} parcela(s) paga(s) com sucesso`)
      onDone()
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h3 className="font-semibold">Pagamento em Lote</h3>
            <p className="text-xs text-muted-foreground">{selected.length} parcela(s) — {formatCurrency(totalValor)}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-5">
          <div><label className={LABEL}>Data Pagamento *</label><input type="date" value={form.data_pagamento} onChange={(e) => setForm((p) => ({ ...p, data_pagamento: e.target.value }))} className={INPUT} /></div>
          <div>
            <label className={LABEL}>Forma Pagamento</label>
            <select value={form.forma_pagamento} onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))} className={INPUT}>
              <option value="PIX">PIX</option><option value="Boleto">Boleto</option><option value="Transferência">Transferência</option><option value="Cheque">Cheque</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Conta Bancária</label>
            <select value={form.conta_bancaria_id} onChange={(e) => setForm((p) => ({ ...p, conta_bancaria_id: e.target.value }))} className={INPUT}>
              <option value="">Nenhuma</option>
              {contas.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {/* Preview */}
          <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
            {selected.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/30 px-1 py-1 text-[10px] last:border-0">
                <span className="truncate">{p.pedido_item ?? 'Avulsa'} (P{p.numero_parcela})</span>
                <span className="font-semibold">{formatCurrency(p.valor - p.valor_pago)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
          <button onClick={handleBatchPay} disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Check className="h-4 w-4" />{saving ? 'Processando...' : `Pagar ${selected.length} parcela(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONTAS BANCÁRIAS TAB
// ═══════════════════════════════════════════════════════════════

function ContasTab({ search }: { search: string }) {
  const { data: contas = [], isLoading } = useContasBancarias()
  const createConta = useCreateContaBancaria()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createConta.mutateAsync({
      nome: form.nome, banco: form.banco || null,
      agencia: form.agencia || null, conta: form.conta || null,
      tipo: form.tipo || null, saldo_inicial: form.saldo_inicial ? parseFloat(form.saldo_inicial) : 0,
    })
    setShowForm(false)
    setForm({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '' })
  }

  const filtered = contas.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) || (c.banco ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Nome *</label><input type="text" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className={INPUT} /></div>
              <div><label className={LABEL}>Banco</label><input type="text" value={form.banco} onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Tipo</label><select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={INPUT}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="investimento">Investimento</option></select></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Agência</label><input type="text" value={form.agencia} onChange={(e) => setForm((p) => ({ ...p, agencia: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Conta</label><input type="text" value={form.conta} onChange={(e) => setForm((p) => ({ ...p, conta: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Saldo Inicial (R$)</label><input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm((p) => ({ ...p, saldo_inicial: e.target.value }))} className={INPUT} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />Criar</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhuma conta cadastrada" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{c.nome}</h4>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.ativa ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
                  {c.ativa ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {c.banco && <p>Banco: <span className="font-medium text-foreground">{c.banco}</span></p>}
                {c.agencia && <p>Agência: <span className="font-medium text-foreground">{c.agencia}</span></p>}
                {c.conta && <p>Conta: <span className="font-medium text-foreground">{c.conta}</span></p>}
                {c.tipo && <p>Tipo: <span className="font-medium text-foreground capitalize">{c.tipo}</span></p>}
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">Saldo Inicial</p>
                <p className="text-lg font-bold">{formatCurrency(c.saldo_inicial)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared micro-components
// ═══════════════════════════════════════════════════════════════

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-500' : ''
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Spinner() {
  return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}
