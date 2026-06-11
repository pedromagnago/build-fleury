import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  useParcelas, useCreateParcela, useDeleteParcela,
  useContasBancarias, useCreateContaBancaria,
  useUpdateContaBancaria, useDeleteContaBancaria,
  useAmortizacoesAvulsas,
  type Parcela, type ContaBancaria,
} from '@/hooks/useFinanceiro'
import { usePedidos, useFornecedores, type Pedido, type Fornecedor } from '@/hooks/useCompras'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'

/** Data de referência para pagamento: previsão editável se definida, senão vencimento contratual. */
const dataPrev = (p: { data_prevista_pagamento?: string | null; data_vencimento: string }) =>
  p.data_prevista_pagamento ?? p.data_vencimento
import { useMutuos } from '@/hooks/useMutuos'
import { toast } from 'sonner'
import { useDropzone } from 'react-dropzone'
import BulkActionBar from '@/components/BulkActionBar'
import PagamentosBulkActions from '@/components/PagamentosBulkActions'
import EditParcelaModal from '@/components/financeiro/EditParcelaModal'
import ConsolidarPedidosWizard from '@/components/financeiro/ConsolidarPedidosWizard'
import { VinculosMovsPanel } from '@/components/conciliacao/VinculosMovsPanel'
import { useSelection } from '@/hooks/useSelection'
import {
  Wallet, Plus, X, Check, AlertTriangle, Clock,
  CheckCircle2, CreditCard, Search, CalendarClock,
  Calendar, Users, Upload, Paperclip, ChevronDown, ChevronRight, Trash2,
  Pencil, Package, Power, PowerOff, Link as LinkIcon, Inbox, Download,
} from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'
import RecepcaoPage from '@/pages/RecepcaoPage'

// ---------------------------------------------------------------------------
// Helper: detecta mov bancária pré-existente conciliada com a parcela.
// Evita duplicação no extrato quando a baixa já foi feita manualmente.
// Retorna null se nenhuma, ou objeto com info da mov se existir.
// ---------------------------------------------------------------------------
async function findMovConciliadaParaParcela(
  parcelaId: string,
  tipoOrigem: 'parcela' | 'mutuo_parcela',
): Promise<{ movId: string; data: string; valor: number; descricao: string } | null> {
  const col = tipoOrigem === 'parcela' ? 'parcela_id' : 'mutuo_parcela_id'
  const { data: cps } = await supabase
    .from('conciliacao_parcelas')
    .select(`conciliacao_id, conciliacoes!inner(id, movimentacao_id, status, movimentacoes_bancarias!inner(id, data, valor, descricao))`)
    .eq(col, parcelaId)
  if (!cps || cps.length === 0) return null
  for (const cp of cps as any[]) {
    const conc = Array.isArray(cp.conciliacoes) ? cp.conciliacoes[0] : cp.conciliacoes
    if (!conc) continue
    if (conc.status !== 'confirmado' && conc.status !== 'aprovado') continue
    const mov = Array.isArray(conc.movimentacoes_bancarias) ? conc.movimentacoes_bancarias[0] : conc.movimentacoes_bancarias
    if (!mov) continue
    return { movId: mov.id, data: mov.data, valor: Number(mov.valor), descricao: mov.descricao }
  }
  return null
}

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

type Tab = 'parcelas' | 'agenda' | 'por_pedido' | 'por_fornecedor' | 'recepcao'

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
    { key: 'por_pedido', label: 'Por Pedido', icon: Package },
    { key: 'por_fornecedor', label: 'Por Fornecedor', icon: Users },
    { key: 'recepcao', label: 'Recepção (NF/IA)', icon: Inbox },
  ]

  return (
    <div>
      <PageHeader title="Pagamentos" description="Parcelas, agenda, recepção de notas" icon={Wallet} onHelp={restartTour} />

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

      {tab === 'parcelas' && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className={`${INPUT} pl-9`} />
        </div>
      )}

      {tab === 'parcelas' && <ParcelasTab search={search} />}
      {tab === 'agenda' && <AgendaTab onPickDay={(isoDate: string) => {
        // Converte ISO p/ formato BR e abre Parcelas filtrado por data de vencimento
        const [y, m, d] = isoDate.split('-')
        setSearch(`${d}/${m}/${y}`)
        setTab('parcelas')
      }} />}
      {tab === 'por_pedido' && <PorPedidoTab />}
      {tab === 'por_fornecedor' && <PorFornecedorTab />}
      {tab === 'recepcao' && <RecepcaoPage />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PARCELAS TAB — with full payment flow modal
// ═══════════════════════════════════════════════════════════════

type TypeFilter = 'todos' | 'pedidos' | 'mutuos' | 'avulsas' | 'amortizacoes'
type ParcelaTipoFilter = 'todos' | 'contratual' | 'adiantamento'
type DueFilter = 'todas' | 'hoje' | 'semana' | 'mes' | 'vencidas' | 'pagas' | 'parcial'

// Estorno unificado: limpa conciliacao + mov + zera parcela/mutuo_parcela.
async function estornarParcela(p: Parcela, isMutuo: boolean, qc: ReturnType<typeof useQueryClient>) {
  if (!window.confirm(`Estornar baixa de ${formatCurrency(p.valor_pago || p.valor)}?\nIsso apaga a movimentacao bancaria e a conciliacao vinculadas.`)) return
  try {
    const linkCol = isMutuo ? 'mutuo_parcela_id' : 'parcela_id'
    const { data: links } = await supabase
      .from('conciliacao_parcelas').select('conciliacao_id').eq(linkCol, p.id)
    const concIds = Array.from(new Set((links ?? []).map((l: any) => l.conciliacao_id as string)))
    if (concIds.length > 0) {
      const { data: concs } = await supabase
        .from('conciliacoes').select('movimentacao_id').in('id', concIds)
      const movIds = Array.from(new Set((concs ?? []).map((c: any) => c.movimentacao_id as string)))
      await supabase.from('conciliacao_parcelas').delete().in('conciliacao_id', concIds)
      await supabase.from('conciliacoes').delete().in('id', concIds)
      if (movIds.length > 0) {
        await supabase.from('movimentacoes_bancarias').delete().in('id', movIds)
      }
    }
    if (isMutuo) {
      await supabase.from('mutuo_parcelas').update({
        status: 'pendente',
        valor_pago: 0,
        data_pagamento_real: null,
        conta_bancaria_id: null,
        forma_pagamento: null,
      }).eq('id', p.id)
    } else {
      await supabase.from('parcelas').update({
        status: 'a_vencer',
        valor_pago: 0,
        data_pagamento_real: null,
        forma_pagamento: null,
        comprovante_path: null,
      }).eq('id', p.id)
    }
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['mutuos'] })
    qc.invalidateQueries({ queryKey: ['movimentacoes'] })
    qc.invalidateQueries({ queryKey: ['conciliacoes'] })
    qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
    toast.success('Baixa estornada')
  } catch (err: any) {
    toast.error('Erro ao estornar: ' + (err?.message ?? String(err)))
  }
}

function ParcelasTab({ search }: { search: string }) {
  const { currentCompany } = useProject()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { data: parcelas = [], isLoading } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: contas = [] } = useContasBancarias()
  const createParcela = useCreateParcela()
  const deleteParcela = useDeleteParcela()
  const [showForm, setShowForm] = useState(false)
  const [payingParcela, setPayingParcela] = useState<Parcela | null>(null)
  const [payingMutuo, setPayingMutuo] = useState<Parcela | null>(null)
  const [editingParcela, setEditingParcela] = useState<Parcela | null>(null)
  const [viewingVinculos, setViewingVinculos] = useState<Parcela | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
  const [parcelaTipoFilter, setParcelaTipoFilter] = useState<ParcelaTipoFilter>('todos')
  const [dueFilter, setDueFilter] = useState<DueFilter>(
    searchParams.get('filtro') === 'vencidas' ? 'vencidas' : 'todas'
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fornecedorFilter, setFornecedorFilter] = useState('')
  const [soAberto, setSoAberto] = useState(false)
  const [nfFilter, setNfFilter] = useState<'todos' | 'com_nf' | 'sem_nf'>('todos')
  const [nfNumeroFilter, setNfNumeroFilter] = useState('')
  const [vencDe, setVencDe] = useState('')
  const [vencAte, setVencAte] = useState('')
  const [formaPgtoFilter, setFormaPgtoFilter] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')
  const selection = useSelection()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: mutuos = [] } = useMutuos()
  const { data: amortizacoesAvulsas = [] } = useAmortizacoesAvulsas()

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
  const scrollToRow = (id: string) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-parcela-id="${id}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-primary/40')
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 1500)
      }
    }, 50)
  }
  const selectVencidas = () => {
    const ids = filtered.filter(p => p.status !== 'paga' && dataPrev(p) < today).map(p => p.id)
    selection.selectAll(ids)
    if (ids.length === 0) toast.info('Nenhuma parcela vencida')
    else { toast.success(`${ids.length} parcela(s) vencida(s) selecionada(s)`); scrollToRow(ids[0]!) }
  }
  const selectSemana = () => {
    const ids = filtered.filter(p => p.status !== 'paga' && dataPrev(p) >= today && dataPrev(p) <= weekEnd).map(p => p.id)
    selection.selectAll(ids)
    if (ids.length === 0) toast.info('Nenhuma parcela vence esta semana')
    else { toast.success(`${ids.length} parcela(s) desta semana selecionada(s)`); scrollToRow(ids[0]!) }
  }

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

  // Janelas de tempo para o filtro de vencimento
  const monthEnd = (() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]!
  })()

  // Formas de pagamento únicas extraídas dos dados (para o select)
  const formasPagtoUnicas = useMemo(() => {
    const set = new Set<string>()
    parcelas.forEach(p => { if (p.forma_pagamento) set.add(p.forma_pagamento) })
    return Array.from(set).sort()
  }, [parcelas])

  // Contador de filtros avançados ativos
  const advancedActiveCount = [fornecedorFilter, soAberto, nfFilter !== 'todos', nfNumeroFilter, vencDe, vencAte, formaPgtoFilter, valorMin, valorMax].filter(Boolean).length

  const clearAdvanced = () => {
    setFornecedorFilter('')
    setSoAberto(false)
    setNfFilter('todos')
    setNfNumeroFilter('')
    setVencDe('')
    setVencAte('')
    setFormaPgtoFilter('')
    setValorMin('')
    setValorMax('')
  }

  const filtered = parcelas.filter((p) => {
    const q = search.toLowerCase().trim()
    // Aceita data em formato BR (DD/MM/YYYY ou DD/MM) e converte para ISO p/ casar com previsão/pagamento
    let isoFromQuery = ''
    const brFull = q.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const brShort = q.match(/^(\d{2})\/(\d{2})$/)
    if (brFull) isoFromQuery = `${brFull[3]}-${brFull[2]}-${brFull[1]}`
    else if (brShort) isoFromQuery = `-${brShort[2]}-${brShort[1]}` // partial match para qualquer ano
    const matchesSearch = !q ||
      (p.pedido_item ?? p.descricao ?? '').toLowerCase().includes(q) ||
      ((p as any).fornecedor_nome ?? '').toLowerCase().includes(q) ||
      ((p as any).pedido_numero != null ? String((p as any).pedido_numero).includes(q) : false) ||
      p.status.includes(q) ||
      (isoFromQuery && (
        dataPrev(p).includes(isoFromQuery) ||
        (p.data_pagamento_real ?? '').includes(isoFromQuery)
      )) ||
      // ISO direto (YYYY-MM-DD)
      (q.match(/^\d{4}-\d{2}-\d{2}$/) && (
        dataPrev(p).includes(q) ||
        (p.data_pagamento_real ?? '').includes(q)
      ))
    if (!matchesSearch) return false
    if (typeFilter === 'pedidos' && !p.pedido_id) return false
    if (typeFilter === 'avulsas' && p.pedido_id) return false
    // Filtro pelo tipo da parcela: contratual = plano de cond_pagamento;
    // adiantamento = PIX antecipado fora do cronograma. Default null = contratual.
    if (parcelaTipoFilter !== 'todos') {
      const t = (p as any).tipo ?? 'contratual'
      if (t !== parcelaTipoFilter) return false
    }
    // ── Filtros avançados (antes do narrowing de status) ─────────────────────
    if (soAberto && p.status === 'paga') return false
    if (fornecedorFilter && (p as any).fornecedor_id !== fornecedorFilter) return false
    if (nfFilter === 'com_nf' && !(p as any).nf_numero) return false
    if (nfFilter === 'sem_nf' && !!(p as any).nf_numero) return false
    if (nfNumeroFilter) {
      const nf = ((p as any).nf_numero as string | null) ?? ''
      if (!nf.toLowerCase().includes(nfNumeroFilter.toLowerCase())) return false
    }
    if (formaPgtoFilter && (p.forma_pagamento ?? '').toLowerCase() !== formaPgtoFilter.toLowerCase()) return false
    if (valorMin && p.valor < parseFloat(valorMin)) return false
    if (valorMax && p.valor > parseFloat(valorMax)) return false
    // Filtro por previsão de pagamento (data_prevista_pagamento ?? data_vencimento)
    const venc = dataPrev(p)
    if (vencDe && venc < vencDe) return false
    if (vencAte && venc > vencAte) return false
    if (dueFilter === 'pagas') return p.status === 'paga'
    if (dueFilter === 'parcial') return p.status === 'parcialmente_paga'
    if (p.status === 'paga') return dueFilter === 'todas'
    if (dueFilter === 'hoje') return venc === today
    if (dueFilter === 'semana') return venc >= today && venc <= weekEnd
    if (dueFilter === 'mes') return venc >= today && venc <= monthEnd
    if (dueFilter === 'vencidas') return venc < today
    return true // 'todas'
  })

  // Merge mutuo parcelas into the list — APENAS de captação (parcelas = devolução = SAÍDA).
  // Adiantamentos feitos têm parcelas que são RECEBIMENTOS (entram no caixa) — vão pra Recebimentos.
  const mutuoParcelas = useMemo(() => {
    const result: Array<Parcela & { _source: 'mutuo'; _mutuoNome: string }> = []
    const isAdiantamentoFeito = (m: any) => {
      const cat = String(m.categoria ?? '').toLowerCase()
      return cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')
    }
    mutuos.forEach(m => {
      if (isAdiantamentoFeito(m)) return // pula — pertence a Recebimentos
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

  // Amortizações avulsas viram "parcelas virtuais" (já pagas) pra somar no total.
  const amortizacoesParcelas = useMemo(() => {
    const result: Array<Parcela & { _source: 'amortizacao'; _mutuoNome: string }> = []
    for (const a of amortizacoesAvulsas) {
      result.push({
        id: a.id,
        company_id: currentCompany?.id ?? '',
        pedido_id: null,
        despesa_indireta_id: null,
        numero_parcela: 0,
        valor: a.valor,
        valor_pago: a.valor, // amortização avulsa já está paga (tem mov bancária)
        data_vencimento: a.data,
        data_pagamento_real: a.data,
        data_prevista_pagamento: null,
        status: 'paga',
        forma_pagamento: null,
        conta_bancaria_id: a.conta_bancaria_id,
        comprovante_path: null,
        deleted_at: null,
        created_at: a.data,
        descricao: `Amortização avulsa — ${a.mutuo_nome}`,
        _source: 'amortizacao',
        _mutuoNome: a.mutuo_nome,
      } as any)
    }
    if (search) {
      const q = search.toLowerCase()
      return result.filter(p => p.descricao?.toLowerCase().includes(q) || p._mutuoNome.toLowerCase().includes(q))
    }
    return result
  }, [amortizacoesAvulsas, search, currentCompany])

  // Aplica filtros avançados às fontes extras (mútuos e amortizações)
  const applyAdvancedToExtras = (list: any[]) => {
    return list.filter(p => {
      // mútuos e amortizações nunca têm NF — excluir quando filtro exige NF
      if (nfFilter === 'com_nf') return false
      if (soAberto && p.status === 'paga') return false
      const venc = dataPrev(p)
      if (vencDe && venc < vencDe) return false
      if (vencAte && venc > vencAte) return false
      if (valorMin && p.valor < parseFloat(valorMin)) return false
      if (valorMax && p.valor > parseFloat(valorMax)) return false
      // dueFilter aplicado às extras da mesma forma que às parcelas de pedido
      if (dueFilter === 'pagas') return p.status === 'paga'
      if (p.status === 'paga') return dueFilter === 'todas'
      if (dueFilter === 'hoje') return venc === today
      if (dueFilter === 'semana') return venc >= today && venc <= weekEnd
      if (dueFilter === 'mes') return venc >= today && venc <= monthEnd
      if (dueFilter === 'vencidas') return venc < today
      return true
    })
  }

  const allFiltered = useMemo(() => {
    // If type filter is 'mutuos', show only mutuos
    if (typeFilter === 'mutuos') {
      return applyAdvancedToExtras(mutuoParcelas).sort((a: any, b: any) => dataPrev(a).localeCompare(dataPrev(b)))
    }
    if (typeFilter === 'amortizacoes') {
      return applyAdvancedToExtras(amortizacoesParcelas).sort((a: any, b: any) => dataPrev(a).localeCompare(dataPrev(b)))
    }
    const combined = [
      ...filtered.map(p => ({ ...p, _source: 'pedido' as const, _mutuoNome: '' })),
      ...(typeFilter === 'todos' ? applyAdvancedToExtras(mutuoParcelas) : []),
      ...(typeFilter === 'todos' ? applyAdvancedToExtras(amortizacoesParcelas) : []),
    ]
    return combined.sort((a, b) => dataPrev(a).localeCompare(dataPrev(b)))
  }, [filtered, mutuoParcelas, amortizacoesParcelas, typeFilter, soAberto, nfFilter, dueFilter, vencDe, vencAte, valorMin, valorMax, today, weekEnd, monthEnd])

  const totals = allFiltered.reduce(
    (acc, p) => ({
      total: acc.total + p.valor,
      pago: acc.pago + Math.min(p.valor_pago, p.valor),
      pendente: acc.pendente + Math.max(0, p.valor - p.valor_pago),
    }),
    { total: 0, pago: 0, pendente: 0 }
  )

  // Contadores rápidos (sobre todas as parcelas, não só o filtro atual — para o usuário enxergar prioridades mesmo navegando)
  const allParcelasCombined = useMemo(() => [
    ...parcelas,
    ...mutuoParcelas,
  ], [parcelas, mutuoParcelas])
  const counters = useMemo(() => {
    let vencidas = 0, vencidasValor = 0
    let hoje = 0, hojeValor = 0
    let semana = 0, semanaValor = 0
    allParcelasCombined.forEach((p) => {
      if (p.status === 'paga') return
      const v = dataPrev(p)
      const restante = Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0))
      if (v && v < today) { vencidas++; vencidasValor += restante }
      else if (v === today) { hoje++; hojeValor += restante }
      else if (v > today && v <= weekEnd) { semana++; semanaValor += restante }
    })
    return { vencidas, vencidasValor, hoje, hojeValor, semana, semanaValor }
  }, [allParcelasCombined, today, weekEnd])

  const handleExportCSV = () => {
    const headers = ['Vencimento', 'Previsto', 'Parcela', 'Pedido', 'Fornecedor', 'Descrição', 'NF', 'Valor', 'Valor Pago', 'Pgto Real', 'Status']
    const rows = allFiltered.map(p => [
      localDate(p.data_vencimento).toLocaleDateString('pt-BR'),
      (p as any).data_prevista_pagamento && (p as any).data_prevista_pagamento !== p.data_vencimento
        ? localDate((p as any).data_prevista_pagamento).toLocaleDateString('pt-BR')
        : '',
      String(p.numero_parcela ?? ''),
      (p as any).pedido_numero != null ? `PED #${(p as any).pedido_numero}` : ((p as any)._source === 'mutuo' ? 'MÚTUO' : ''),
      ((p as any).fornecedor_nome ?? (p as any)._mutuoNome ?? ''),
      (p.pedido_item ?? p.descricao ?? 'Avulsa'),
      (p as any).nf_numero ?? '',
      p.valor.toFixed(2).replace('.', ','),
      (p.valor_pago ?? 0).toFixed(2).replace('.', ','),
      p.data_pagamento_real ? localDate(p.data_pagamento_real).toLocaleDateString('pt-BR') : '',
      p.status,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagamentos_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${allFiltered.length} parcela(s) exportada(s)`)
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MiniCard label="Total" value={formatCurrency(totals.total)} />
        <MiniCard label="Pago" value={formatCurrency(totals.pago)} accent="emerald" />
        <MiniCard label="Pendente" value={formatCurrency(totals.pendente)} accent="amber" />
        <button
          type="button"
          onClick={() => setDueFilter('vencidas')}
          className={`rounded-xl border bg-card p-3 text-left transition-colors hover:border-red-500/40 ${dueFilter === 'vencidas' ? 'border-red-500/60 bg-red-500/5' : ''}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Vencidas</p>
          <p className="mt-1 text-lg font-bold text-red-500">{counters.vencidas}</p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(counters.vencidasValor)}</p>
        </button>
        <button
          type="button"
          onClick={() => setDueFilter('hoje')}
          className={`rounded-xl border bg-card p-3 text-left transition-colors hover:border-amber-500/40 ${dueFilter === 'hoje' ? 'border-amber-500/60 bg-amber-500/5' : ''}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Hoje</p>
          <p className="mt-1 text-lg font-bold text-amber-600">{counters.hoje}</p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(counters.hojeValor)}</p>
        </button>
        <button
          type="button"
          onClick={() => setDueFilter('semana')}
          className={`rounded-xl border bg-card p-3 text-left transition-colors hover:border-amber-400/40 ${dueFilter === 'semana' ? 'border-amber-500/60 bg-amber-500/5' : ''}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Esta semana</p>
          <p className="mt-1 text-lg font-bold text-amber-500">{counters.semana}</p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(counters.semanaValor)}</p>
        </button>
      </div>

      {/* ── Barra de filtros principal ─────────────────────────────────────── */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova Parcela
        </button>

        {/* Quick filter — Vencimento */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {([
            ['todas', 'Todas'],
            ['vencidas', 'Vencidas'],
            ['hoje', 'Hoje'],
            ['semana', 'Esta semana'],
            ['mes', 'Este mês'],
            ['pagas', 'Pagas'],
            ['parcial', 'Parcial'],
          ] as const).map(([k, label]) => {
            const tone =
              k === 'vencidas' ? 'data-[on=true]:text-red-600' :
              k === 'hoje' ? 'data-[on=true]:text-amber-600' :
              k === 'pagas' ? 'data-[on=true]:text-emerald-600' :
              k === 'parcial' ? 'data-[on=true]:text-blue-600' : ''
            return (
              <button key={k} onClick={() => { setDueFilter(k); if (k === 'pagas' || k === 'parcial') setSoAberto(false) }} data-on={dueFilter === k}
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${tone} ${
                  dueFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{label}</button>
            )
          })}
        </div>

        {/* Type Filter Chips */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {([['todos', 'Todas'], ['pedidos', 'Pedidos'], ['mutuos', 'Mútuos'], ['amortizacoes', 'Amortiz.'], ['avulsas', 'Avulsas']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${typeFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              title={k === 'amortizacoes' ? 'Saídas conciliadas a mútuo (avulso) — pagamento de principal sem parcela específica' : undefined}
            >{label}</button>
          ))}
        </div>

        {/* Parcela Tipo (contratual / adiantamento) */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5" title="Contratual = parcela do cronograma. Adiantamento = PIX antecipado fora do cronograma.">
          {([['todos', 'Todas'], ['contratual', 'Contr.'], ['adiantamento', 'Adiant.']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setParcelaTipoFilter(k)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${parcelaTipoFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >{label}</button>
          ))}
        </div>

        <div className="ml-auto flex gap-1.5">
          <button onClick={handleExportCSV} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground" title={`Exportar ${allFiltered.length} parcelas como CSV`}>
            <Download className="h-3 w-3" /> Exportar ({allFiltered.length})
          </button>
          <button onClick={selectVencidas} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10" title="Selecionar parcelas vencidas">Sel. vencidas</button>
          <button onClick={selectSemana} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/10" title="Selecionar parcelas desta semana">Sel. semana</button>
          {/* Botão filtros avançados */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
              showAdvanced || advancedActiveCount > 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Filtros avançados
            {advancedActiveCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {advancedActiveCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Painel de filtros avançados ────────────────────────────────────── */}
      {showAdvanced && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Filtros avançados</span>
            {advancedActiveCount > 0 && (
              <button onClick={clearAdvanced} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="h-3 w-3" /> Limpar filtros ({advancedActiveCount})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {/* Fornecedor */}
            <div>
              <label className={LABEL}>Fornecedor</label>
              <select value={fornecedorFilter} onChange={e => setFornecedorFilter(e.target.value)} className={INPUT}>
                <option value="">Todos</option>
                {fornecedores.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            {/* Apenas em aberto */}
            <div className="flex flex-col justify-end">
              <label className={LABEL}>Status de pagamento</label>
              <button
                type="button"
                onClick={() => { setSoAberto(v => { if (!v && dueFilter === 'pagas') setDueFilter('todas'); return !v }) }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  soAberto ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {soAberto ? <Check className="h-3.5 w-3.5 text-amber-600" /> : <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40" />}
                Apenas em aberto
              </button>
            </div>
            {/* Nota Fiscal — toggle com/sem + busca por número */}
            <div>
              <label className={LABEL}>Nota Fiscal</label>
              <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
                {([['todos', 'Todas'], ['com_nf', 'Com NF'], ['sem_nf', 'Sem NF']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setNfFilter(k)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors ${nfFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >{label}</button>
                ))}
              </div>
            </div>
            {/* Número da NF */}
            <div>
              <label className={LABEL}>Número da NF</label>
              <input
                type="text"
                placeholder="ex: 000.003.006"
                value={nfNumeroFilter}
                onChange={e => setNfNumeroFilter(e.target.value)}
                className={INPUT}
              />
            </div>
            {/* Vencimento de */}
            <div>
              <label className={LABEL}>Vencimento — de</label>
              <input type="date" value={vencDe} onChange={e => setVencDe(e.target.value)} className={INPUT} />
            </div>
            {/* Vencimento até */}
            <div>
              <label className={LABEL}>Vencimento — até</label>
              <input type="date" value={vencAte} onChange={e => setVencAte(e.target.value)} className={INPUT} />
            </div>
            {/* Forma de pagamento */}
            <div>
              <label className={LABEL}>Forma de pagamento</label>
              <select value={formaPgtoFilter} onChange={e => setFormaPgtoFilter(e.target.value)} className={INPUT}>
                <option value="">Todas</option>
                {formasPagtoUnicas.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
                {/* Opções fixas de fallback caso não haja dados suficientes */}
                {['PIX', 'Boleto', 'TED', 'DOC', 'Cheque'].filter(f => !formasPagtoUnicas.includes(f)).map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            {/* Valor mínimo */}
            <div>
              <label className={LABEL}>Valor mínimo (R$)</label>
              <input
                type="number" min="0" step="0.01" placeholder="0,00"
                value={valorMin} onChange={e => setValorMin(e.target.value)} className={INPUT}
              />
            </div>
            {/* Valor máximo */}
            <div>
              <label className={LABEL}>Valor máximo (R$)</label>
              <input
                type="number" min="0" step="0.01" placeholder="Sem limite"
                value={valorMax} onChange={e => setValorMax(e.target.value)} className={INPUT}
              />
            </div>
          </div>
          {/* Resumo do filtro ativo */}
          {advancedActiveCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fornecedorFilter && (
                <FilterTag label={`Fornecedor: ${fornecedores.find(f => f.id === fornecedorFilter)?.nome ?? '—'}`} onRemove={() => setFornecedorFilter('')} />
              )}
              {soAberto && <FilterTag label="Apenas em aberto" onRemove={() => setSoAberto(false)} />}
              {nfFilter !== 'todos' && <FilterTag label={nfFilter === 'com_nf' ? 'Com NF' : 'Sem NF'} onRemove={() => setNfFilter('todos')} />}
              {nfNumeroFilter && <FilterTag label={`NF: ${nfNumeroFilter}`} onRemove={() => setNfNumeroFilter('')} />}
              {vencDe && <FilterTag label={`Venc ≥ ${localDate(vencDe).toLocaleDateString('pt-BR')}`} onRemove={() => setVencDe('')} />}
              {vencAte && <FilterTag label={`Venc ≤ ${localDate(vencAte).toLocaleDateString('pt-BR')}`} onRemove={() => setVencAte('')} />}
              {formaPgtoFilter && <FilterTag label={`Forma: ${formaPgtoFilter}`} onRemove={() => setFormaPgtoFilter('')} />}
              {valorMin && <FilterTag label={`Valor ≥ ${formatCurrency(parseFloat(valorMin))}`} onRemove={() => setValorMin('')} />}
              {valorMax && <FilterTag label={`Valor ≤ ${formatCurrency(parseFloat(valorMax))}`} onRemove={() => setValorMax('')} />}
            </div>
          )}
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────────── */}

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

      {isLoading ? <Spinner /> : allFiltered.length === 0 ? <EmptyState msg="Nenhuma parcela encontrada" /> : (
        <div className="overflow-auto rounded-xl border bg-card max-h-[calc(100vh-260px)]">
          <table className="tbl-bf w-full text-sm">
            <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <th className="px-2 py-2.5 text-center">
                  <input type="checkbox"
                    checked={selection.count === allFiltered.length && allFiltered.length > 0}
                    onChange={() => selection.toggleAll(allFiltered.map(p => p.id))}
                    className="h-3.5 w-3.5 rounded accent-primary" />
                </th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vencimento</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-blue-600/70">Previsto</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parcela</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pedido</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fornecedor</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">NF</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
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
                const isEditingRow = editingParcela?.id === p.id || payingParcela?.id === p.id
                const venc = dataPrev(p)
                const isVencida = p.status !== 'paga' && venc && venc < today
                const isHoje = p.status !== 'paga' && venc === today
                const isSemana = p.status !== 'paga' && venc > today && venc <= weekEnd
                const pedidoNumero = (p as any).pedido_numero as number | null | undefined
                const fornecedorNome = (p as any).fornecedor_nome as string | null | undefined
                const nfNumero = (p as any).nf_numero as string | null | undefined
                return (
                  <tr key={p.id} data-parcela-id={p.id} className={`group transition-colors ${isEditingRow ? 'row-editing' : 'hover:bg-muted/20'}`}>
                    <td className="px-2 py-2.5 text-center">
                      <input type="checkbox" checked={selection.isSelected(p.id)}
                        onChange={() => selection.toggle(p.id)}
                        className="h-3.5 w-3.5 rounded accent-primary" />
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                      {localDate(p.data_vencimento).toLocaleDateString('pt-BR')}
                    </td>
                    <td className={`px-3 py-2.5 text-center text-xs font-medium ${
                      isVencida ? 'text-red-600' : isHoje ? 'text-amber-600' : isSemana ? 'text-amber-500' : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      <div className="flex items-center justify-center gap-1">
                        {(p as any).data_prevista_pagamento
                          ? localDate((p as any).data_prevista_pagamento).toLocaleDateString('pt-BR')
                          : <span className="text-muted-foreground/40">—</span>}
                        {isVencida && <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-600">VENC</span>}
                        {isHoje && <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-bold text-amber-600">HOJE</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                      {p.numero_parcela}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {isMutuo ? (
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">MÚTUO</span>
                      ) : pedidoNumero != null ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">PED #{pedidoNumero}</span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[180px]" title={fornecedorNome ?? ''}>
                      {fornecedorNome ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium truncate max-w-[260px]" title={p.pedido_item ?? p.descricao ?? ''}>
                      {p.pedido_item ?? p.descricao ?? 'Avulsa'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {nfNumero ? (
                        <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-400" title={`NF ${nfNumero}`}>
                          NF {nfNumero}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium">{formatCurrency(p.valor)}</td>
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
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewingVinculos(p)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                          title="Ver movimentos vinculados">
                          <LinkIcon className="h-3 w-3" />
                        </button>
                        {/* Edit button — works for all parcelas */}
                        {!isMutuo && (
                          <button onClick={() => setEditingParcela(p)} className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors" title="Editar">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {p.status !== 'paga' && !isMutuo && (
                          <button onClick={() => setPayingParcela(p)} className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                            Pagar
                          </button>
                        )}
                        {p.status !== 'paga' && isMutuo && (
                          <button
                            onClick={() => setPayingMutuo(p)}
                            className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                          >
                            Baixar
                          </button>
                        )}
                        {p.status !== 'paga' && !isMutuo && (
                          <button onClick={() => { if (window.confirm('Excluir parcela?')) deleteParcela.mutate(p.id) }} className="rounded-md p-1 text-red-500 hover:bg-red-500/10 transition-colors text-[10px]" title="Excluir">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        {(p.status === 'paga' || p.status === 'parcialmente_paga') && (
                          <button
                            onClick={() => estornarParcela(p, isMutuo, qc)}
                            className="rounded-md bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20 transition-colors"
                            title="Estornar baixa (apaga mov + conciliacao)"
                          >
                            Estornar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={(() => {
          // Usa allFiltered (parcelas + mutuoParcelas + amortizacoesParcelas)
          // pra que a barra mostre totais corretamente em qualquer aba (Pedidos,
          // Mútuos, Amortizações, Avulsas). Filtrar só `parcelas` deixava o
          // summary vazio quando o usuário selecionava mútuos/amortizações.
          const sel = allFiltered.filter(p => selection.selected.has(p.id))
          if (sel.length === 0) return undefined
          const total = sel.reduce((s, p) => s + Number(p.valor || 0), 0)
          const pago = sel.reduce((s, p) => s + Math.min(Number(p.valor_pago || 0), Number(p.valor || 0)), 0)
          const pendente = sel.reduce((s, p) => s + Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0)), 0)
          const vencidas = sel.filter(p => p.status !== 'paga' && dataPrev(p) < new Date().toISOString().split('T')[0]!).length
          return [
            { label: 'Valor', value: formatCurrency(total), tone: 'primary' as const },
            ...(pago > 0 ? [{ label: 'Pago', value: formatCurrency(pago), tone: 'emerald' as const }] : []),
            { label: 'Pendente', value: formatCurrency(pendente), tone: 'amber' as const },
            ...(vencidas > 0 ? [{ label: 'Vencidas', value: String(vencidas), tone: 'red' as const }] : []),
          ]
        })()}
      >
        <PagamentosBulkActions
          parcelas={parcelas}
          allParcelas={allFiltered}
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

      {/* Mutuo Baixa Modal — pra mantermos paridade com Pagamento (cria mov + conciliacao) */}
      {payingMutuo && currentCompany && (
        <MutuoBaixaModal
          parcela={payingMutuo}
          mutuos={mutuos as any[]}
          contas={contas}
          companyId={currentCompany.id}
          onClose={() => setPayingMutuo(null)}
          onDone={() => {
            setPayingMutuo(null)
            qc.invalidateQueries({ queryKey: ['mutuos'] })
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['movimentacoes'] })
            qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
          }}
        />
      )}

      {/* Edit Parcela Modal */}
      {editingParcela && (
        <EditParcelaModal
          parcela={editingParcela}
          onClose={() => setEditingParcela(null)}
          onDone={() => {
            setEditingParcela(null)
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['itens_compra'] })
            qc.invalidateQueries({ queryKey: ['movimentacoes'] })
            qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
          }}
        />
      )}

      {viewingVinculos && (
        <VinculosMovsPanel
          origem={(viewingVinculos as any)._source === 'mutuo' ? 'mutuo_parcela' : 'parcela'}
          origemId={viewingVinculos.id}
          titulo={viewingVinculos.pedido_item ?? viewingVinculos.descricao ?? 'Parcela'}
          subtitulo={`Venc ${localDate(viewingVinculos.data_vencimento).toLocaleDateString('pt-BR')} · Parcela ${viewingVinculos.numero_parcela}`}
          valor={Number(viewingVinculos.valor)}
          onClose={() => setViewingVinculos(null)}
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
    const valorPago = parseFloat(form.valor_pago) || 0

    // Validações ANTES de entrar no try — feedback claro, sem silenciar etapas.
    if (valorPago <= 0) {
      toast.error('Informe um valor de pagamento maior que zero')
      return
    }
    if (!form.conta_bancaria_id) {
      toast.error('Selecione a conta bancária — sem conta a baixa não vira movimento no extrato')
      return
    }

    // Anti-duplicação: já existe mov conciliada com esta parcela?
    const movExistente = await findMovConciliadaParaParcela(parcela.id, 'parcela')
    if (movExistente) {
      const ok = window.confirm(
        `Já existe um lançamento no extrato vinculado a esta parcela:\n\n` +
        `${movExistente.data} · ${formatCurrency(movExistente.valor)} · ${movExistente.descricao}\n\n` +
        `Registrar a baixa agora vai criar OUTRA mov no extrato (duplicação).\n\n` +
        `Cancele e use a mov existente, ou clique OK para criar mesmo assim.`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      // 1. Upload comprovante (if any)
      let comprovantePath: string | null = null
      if (file) {
        const filePath = `${companyId}/${parcela.id}/${file.name}`
        const { error: upErr } = await supabase.storage.from('comprovantes').upload(filePath, file, { upsert: true })
        if (upErr) console.error('Upload error:', upErr)
        else comprovantePath = filePath
      }

      // 2. Update parcela — usa .select() pra garantir que pelo menos 1 linha foi
      // afetada. RLS pode silenciar UPDATE retornando { data: null, error: null }
      // sem nenhuma linha tocada; sem checar isso, o fluxo continuaria como se
      // tivesse pago e a parcela ficaria intacta. Esse era o sintoma reportado.
      const { data: updRows, error: e1 } = await supabase
        .from('parcelas')
        .update({
          data_pagamento_real: form.data_pagamento,
          valor_pago: parcela.valor_pago + valorPago,
          forma_pagamento: form.forma_pagamento,
          conta_bancaria_id: form.conta_bancaria_id,
          status: (parcela.valor_pago + valorPago) >= parcela.valor ? 'paga' : 'parcialmente_paga',
          ...(comprovantePath ? { comprovante_path: comprovantePath } : {}),
          ...(form.observacoes ? { observacoes: form.observacoes } : {}),
        })
        .eq('id', parcela.id)
        .select('id')
      if (e1) throw e1
      if (!updRows || updRows.length === 0) {
        throw new Error('UPDATE não afetou nenhuma linha (RLS ou parcela inexistente). Reabra a tela e tente de novo.')
      }

      // 3. Update itens_compra: valor_consumido += valor_pago
      if (parcela.pedido_id) {
        const pedidoData = pedidos.find((p) => p.id === parcela.pedido_id)
        if (pedidoData?.item_compra_id) {
          const { error: eRpc } = await supabase.rpc('increment_valor_consumido', {
            p_item_id: pedidoData.item_compra_id,
            p_valor: valorPago,
          })
          if (eRpc) {
            console.warn('RPC increment_valor_consumido falhou, usando fallback:', eRpc.message)
            const { data: item } = await supabase
              .from('itens_compra')
              .select('valor_consumido')
              .eq('id', pedidoData.item_compra_id)
              .single()
            if (item) {
              await supabase
                .from('itens_compra')
                .update({ valor_consumido: (item.valor_consumido ?? 0) + valorPago })
                .eq('id', pedidoData.item_compra_id)
            }
          }
        }
      }

      // 4. Create bank transaction + auto-conciliation (mov visível na Conciliação e no Fluxo).
      // conta_bancaria_id já foi validada acima — este bloco SEMPRE executa.
      const { data: movRow, error: eMov } = await supabase.from('movimentacoes_bancarias').insert({
        company_id: companyId,
        conta_id: form.conta_bancaria_id,
        data: form.data_pagamento,
        descricao: descLabel,
        valor: valorPago,
        tipo: 'saida',
        parcela_id: parcela.id,
      }).select('id').single()
      if (eMov) throw eMov
      if (!movRow) throw new Error('Mov bancária não foi criada (resposta vazia do banco)')

      const { data: concRow, error: eConc } = await supabase.from('conciliacoes').insert({
        company_id: companyId,
        movimentacao_id: movRow.id,
        match_type: 'manual',
        confidence: 100,
        status: 'aprovado',
      }).select('id').single()
      if (eConc) throw eConc
      if (!concRow) throw new Error('Conciliação não foi criada (resposta vazia do banco)')

      const { error: eCp } = await supabase.from('conciliacao_parcelas').insert({
        conciliacao_id: concRow.id,
        parcela_id: parcela.id,
        valor_aplicado: valorPago,
      })
      if (eCp) throw eCp

      // 5. Audit log
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        tabela: 'parcelas',
        registro_id: parcela.id,
        acao: 'UPDATE', agente: 'humano',
        dados_antes: { operacao: 'pagamento', id: parcela.id, status: parcela.status, valor_pago: parcela.valor_pago },
        dados_depois: { status: 'paga', valor_pago: parcela.valor_pago + valorPago, forma: form.forma_pagamento, mov_id: movRow.id, conc_id: concRow.id },
      })

      toast.success('Pagamento registrado com sucesso')
      onDone()
    } catch (err) {
      console.error('[Pagamento] falhou:', err)
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
// MUTUO BAIXA MODAL — Cria mov_bancaria + conciliacao auto, igual PaymentModal
// ═══════════════════════════════════════════════════════════════

function MutuoBaixaModal({
  parcela, mutuos, contas, companyId, onClose, onDone,
}: {
  parcela: Parcela
  mutuos: any[]
  contas: ContaBancaria[]
  companyId: string
  onClose: () => void
  onDone: () => void
}) {
  const mutuoId = (parcela as any).mutuo_id ?? (parcela as any).raw?.mutuo_id ?? null
  const mutuo = mutuos.find(m => m.id === mutuoId)
  // Direcao da PARCELA do mutuo (oposta a do principal):
  // - Captacao (nao Adi-Feito): principal=ENTRADA → parcelas=SAIDA (paga ao credor)
  // - Adiantamento Feito: principal=SAIDA → parcelas=ENTRADA (terceiro devolve ao projeto)
  const isAdiantamentoFeito = (mutuo?.categoria || '').toLowerCase().includes('adiantamento') &&
                              (mutuo?.categoria || '').toLowerCase().includes('feito')
  const tipoMov: 'entrada' | 'saida' = isAdiantamentoFeito ? 'entrada' : 'saida'
  const restante = Number(parcela.valor) - Number(parcela.valor_pago || 0)

  const [form, setForm] = useState({
    data_pagamento: new Date().toISOString().split('T')[0]!,
    valor_pago: String(restante),
    forma_pagamento: 'PIX',
    conta_bancaria_id: contas.find(c => c.ativa)?.id ?? '',
    observacoes: '',
  })
  const [saving, setSaving] = useState(false)

  const descLabel = `Baixa mutuo: ${mutuo?.nome ?? 'MUTUO'} — Parc ${parcela.numero_parcela}`

  const handleBaixar = async () => {
    if (!form.conta_bancaria_id) {
      toast.error('Selecione a conta bancaria')
      return
    }
    // Anti-duplicação: já existe mov conciliada com esta parcela de mútuo?
    const movExistente = await findMovConciliadaParaParcela(parcela.id, 'mutuo_parcela')
    if (movExistente) {
      const ok = window.confirm(
        `Já existe um lançamento no extrato vinculado a esta parcela de mútuo:\n\n` +
        `${movExistente.data} · ${formatCurrency(movExistente.valor)} · ${movExistente.descricao}\n\n` +
        `Registrar a baixa agora vai criar OUTRA mov no extrato (duplicação).\n\n` +
        `Cancele e use a mov existente, ou clique OK para criar mesmo assim.`
      )
      if (!ok) return
    }
    setSaving(true)
    const valorPago = parseFloat(form.valor_pago) || 0
    try {
      // 1) Atualiza mutuo_parcela
      const novoPago = Number(parcela.valor_pago || 0) + valorPago
      const { error: e1 } = await supabase.from('mutuo_parcelas').update({
        valor_pago: novoPago,
        status: novoPago >= Number(parcela.valor) - 0.01 ? 'paga' : 'pendente',
        data_pagamento_real: form.data_pagamento,
        conta_bancaria_id: form.conta_bancaria_id,
        forma_pagamento: form.forma_pagamento,
        observacoes: form.observacoes || null,
      }).eq('id', parcela.id)
      if (e1) throw e1

      // 2) Cria mov_bancaria
      const { data: movRow, error: eMov } = await supabase.from('movimentacoes_bancarias').insert({
        company_id: companyId,
        conta_id: form.conta_bancaria_id,
        data: form.data_pagamento,
        descricao: descLabel,
        valor: valorPago,
        tipo: tipoMov,
      }).select('id').single()
      if (eMov) throw eMov

      // 3) Cria conciliacao aprovada + link polimorfico mutuo_parcela_id
      const { data: concRow, error: eConc } = await supabase.from('conciliacoes').insert({
        company_id: companyId,
        movimentacao_id: movRow!.id,
        match_type: 'manual',
        confidence: 100,
        status: 'aprovado',
      }).select('id').single()
      if (eConc) throw eConc

      const { error: eLink } = await supabase.from('conciliacao_parcelas').insert({
        conciliacao_id: concRow!.id,
        mutuo_parcela_id: parcela.id,
        valor_aplicado: valorPago,
      })
      if (eLink) throw eLink

      toast.success('Baixa registrada')
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
            <h3 className="font-semibold">Baixar Parcela de Mútuo</h3>
            <p className="text-xs text-muted-foreground">{mutuo?.nome ?? 'MUTUO'} — Parcela {parcela.numero_parcela}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-4 rounded-lg bg-muted/30 p-3 text-xs">
            <div><span className="text-muted-foreground">Valor:</span> <strong>{formatCurrency(parcela.valor)}</strong></div>
            <div><span className="text-muted-foreground">Pago:</span> <strong>{formatCurrency(parcela.valor_pago)}</strong></div>
            <div><span className="text-muted-foreground">Tipo:</span> <strong className={tipoMov === 'entrada' ? 'text-emerald-600' : 'text-red-500'}>{tipoMov === 'entrada' ? 'Entrada' : 'Saída'}</strong></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Data</label>
              <input type="date" value={form.data_pagamento} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Valor</label>
              <input type="number" step="0.01" value={form.valor_pago} onChange={(e) => setForm({ ...form, valor_pago: e.target.value })} className={INPUT} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Conta Bancária *</label>
            <select value={form.conta_bancaria_id} onChange={(e) => setForm({ ...form, conta_bancaria_id: e.target.value })} className={INPUT}>
              <option value="">Selecione...</option>
              {contas.filter(c => c.ativa).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL}>Forma de Pagamento</label>
            <select value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} className={INPUT}>
              <option value="PIX">PIX</option>
              <option value="TED">TED/DOC</option>
              <option value="Boleto">Boleto</option>
              <option value="Cartão">Cartão</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          <div>
            <label className={LABEL}>Observações</label>
            <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className={INPUT} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={handleBaixar} disabled={saving || !form.conta_bancaria_id} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Check className="h-4 w-4" />{saving ? 'Processando...' : 'Confirmar Baixa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AGENDA TAB — Weekly/Monthly calendar view
// ═══════════════════════════════════════════════════════════════

function AgendaTab({ onPickDay }: { onPickDay?: (isoDate: string) => void }) {
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
      .filter((p) => p.status !== 'paga' && days.includes(dataPrev(p)))
      .forEach((p) => {
        map.get(dataPrev(p))?.push(p)
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
      <div className="overflow-x-auto">
      <div className={`grid gap-2 min-w-[560px] ${view === 'semana' ? 'grid-cols-7' : 'grid-cols-7'}`}>
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
              onClick={() => { if (ps.length > 0 && onPickDay) onPickDay(day) }}
              className={`min-h-[80px] rounded-lg border p-2 text-xs transition-colors ${
                isToday ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-muted/20'
              } ${view === 'semana' ? '' : 'min-h-[70px]'} ${ps.length > 0 ? 'cursor-pointer hover:border-primary/40' : ''}`}
              title={ps.length > 0 ? `Clique para ver as ${ps.length} parcela(s) de ${d.toLocaleDateString('pt-BR')}` : undefined}
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
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// POR PEDIDO TAB — master/detail (pedido → parcelas)
// ═══════════════════════════════════════════════════════════════

type PorPedidoStatus = 'todos' | 'pendente' | 'atrasado' | 'pago'

function PorPedidoTab() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const { data: parcelas = [], isLoading } = useParcelas()
  const { data: pedidos = [] } = usePedidos()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: contas = [] } = useContasBancarias()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PorPedidoStatus>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchModal, setBatchModal] = useState(false)
  const [payingParcela, setPayingParcela] = useState<Parcela | null>(null)
  const [editingParcela, setEditingParcela] = useState<Parcela | null>(null)
  const [viewingVinculos, setViewingVinculos] = useState<Parcela | null>(null)

  const today = new Date().toISOString().split('T')[0]!

  // Agrupa parcelas (que tenham pedido_id) por pedido_id
  const groups = useMemo(() => {
    const map = new Map<string, { pedido: Pedido | null; parcelas: Parcela[] }>()
    parcelas.forEach((p) => {
      if (!p.pedido_id) return
      if (!map.has(p.pedido_id)) {
        const ped = pedidos.find((pd) => pd.id === p.pedido_id) ?? null
        map.set(p.pedido_id, { pedido: ped, parcelas: [] })
      }
      map.get(p.pedido_id)!.parcelas.push(p)
    })

    return [...map.entries()].map(([pid, g]) => {
      const sorted = [...g.parcelas].sort((a, b) => a.numero_parcela - b.numero_parcela)
      const total = sorted.reduce((s, p) => s + Number(p.valor || 0), 0)
      const pago = sorted.reduce((s, p) => s + Math.min(Number(p.valor_pago || 0), Number(p.valor || 0)), 0)
      const pendente = sorted.reduce((s, p) => s + Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0)), 0)
      const totalCount = sorted.length
      const pagasCount = sorted.filter((p) => p.status === 'paga').length
      const vencidaCount = sorted.filter((p) => p.status !== 'paga' && dataPrev(p) < today).length
      const proxNaoVencida = sorted
        .filter((p) => p.status !== 'paga' && dataPrev(p) >= today)
        .sort((a, b) => dataPrev(a).localeCompare(dataPrev(b)))[0]
      const proxVencida = sorted
        .filter((p) => p.status !== 'paga' && dataPrev(p) < today)
        .sort((a, b) => dataPrev(a).localeCompare(dataPrev(b)))[0]
      const fornecedor = fornecedores.find((f) => f.id === g.pedido?.fornecedor_id) ?? null

      let aggStatus: 'pago' | 'atrasado' | 'pendente' = 'pendente'
      if (pagasCount === totalCount) aggStatus = 'pago'
      else if (vencidaCount > 0) aggStatus = 'atrasado'

      return {
        id: pid,
        pedido: g.pedido,
        fornecedor,
        parcelas: sorted,
        total,
        pago,
        pendente,
        totalCount,
        pagasCount,
        vencidaCount,
        proxVenc: proxNaoVencida ? dataPrev(proxNaoVencida) : null,
        proxVencida: proxVencida ? dataPrev(proxVencida) : null,
        aggStatus,
      }
    })
  }, [parcelas, pedidos, fornecedores, today])

  const filteredGroups = useMemo(() => {
    const order: Record<string, number> = { atrasado: 0, pendente: 1, pago: 2 }
    return groups
      .filter((g) => {
        if (statusFilter !== 'todos' && g.aggStatus !== statusFilter) return false
        if (search) {
          const q = search.toLowerCase().trim()
          const numeroPedido = String(g.pedido?.numero_pedido ?? '')
          const itemDesc = (g.pedido?.item_descricao ?? g.parcelas[0]?.pedido_item ?? '').toLowerCase()
          const fornNome = (g.fornecedor?.nome ?? '').toLowerCase()
          if (!numeroPedido.includes(q) && !itemDesc.includes(q) && !fornNome.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (a.aggStatus !== b.aggStatus) return (order[a.aggStatus] ?? 9) - (order[b.aggStatus] ?? 9)
        const av = a.proxVencida ?? a.proxVenc ?? '9999-99-99'
        const bv = b.proxVencida ?? b.proxVenc ?? '9999-99-99'
        return av.localeCompare(bv)
      })
  }, [groups, statusFilter, search])

  const totals = useMemo(
    () =>
      filteredGroups.reduce(
        (acc, g) => ({
          total: acc.total + g.total,
          pago: acc.pago + g.pago,
          pendente: acc.pendente + g.pendente,
          vencidas: acc.vencidas + g.vencidaCount,
        }),
        { total: 0, pago: 0, pendente: 0, vencidas: 0 }
      ),
    [filteredGroups]
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPedido = (g: (typeof filteredGroups)[number]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const pendentes = g.parcelas.filter((p) => p.status !== 'paga')
      const allSel = pendentes.length > 0 && pendentes.every((p) => next.has(p.id))
      pendentes.forEach((p) => (allSel ? next.delete(p.id) : next.add(p.id)))
      return next
    })
  }

  const totalSelected = useMemo(
    () =>
      parcelas
        .filter((p) => selectedIds.has(p.id))
        .reduce((s, p) => s + Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0)), 0),
    [selectedIds, parcelas]
  )

  if (isLoading) return <Spinner />

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniCard label="Pedidos" value={String(filteredGroups.length)} />
        <MiniCard label="Total" value={formatCurrency(totals.total)} />
        <MiniCard label="Pago" value={formatCurrency(totals.pago)} accent="emerald" />
        <MiniCard label="A pagar" value={formatCurrency(totals.pendente)} accent="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº pedido, fornecedor, item..."
            className={`${INPUT} pl-9`}
          />
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
          {([
            ['todos', 'Todos'],
            ['pendente', 'Pendentes'],
            ['atrasado', 'Atrasados'],
            ['pago', 'Pagos'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                statusFilter === k
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium">
            <strong>{selectedIds.size}</strong> parcela(s) selecionada(s) — Total:{' '}
            <strong>{formatCurrency(totalSelected)}</strong>
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Limpar
            </button>
            <button
              onClick={() => setBatchModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Check className="h-3.5 w-3.5" /> Pagar selecionadas
            </button>
          </div>
        </div>
      )}

      {filteredGroups.length === 0 ? (
        <EmptyState msg="Nenhum pedido com parcelas encontrado" />
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const aggCfg =
              g.aggStatus === 'pago'
                ? statusConfig['paga']!
                : g.aggStatus === 'atrasado'
                ? statusConfig['vencida']!
                : statusConfig['a_vencer']!
            const itemDesc = g.pedido?.item_descricao ?? g.parcelas[0]?.pedido_item ?? '—'
            const proxLabel = g.proxVencida ?? g.proxVenc
            const isExpanded = expandedId === g.id
            return (
              <div key={g.id} className="rounded-xl border bg-card transition-shadow hover:shadow-sm">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : g.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        PED #{g.pedido?.numero_pedido ?? '—'}
                      </span>
                      <h4 className="truncate text-sm font-semibold">{g.fornecedor?.nome ?? 'Sem fornecedor'}</h4>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{itemDesc}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      <span>
                        {g.pagasCount} de {g.totalCount} pagas
                      </span>
                      {g.vencidaCount > 0 && (
                        <span className="font-semibold text-red-500">{g.vencidaCount} vencida(s)</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden items-center gap-4 text-xs md:flex">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Total</p>
                      <p className="font-semibold">{formatCurrency(g.total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Pago</p>
                      <p className="font-semibold text-emerald-500">{formatCurrency(g.pago)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">A pagar</p>
                      <p className="font-semibold text-amber-500">{formatCurrency(g.pendente)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Próx. venc.</p>
                      <p className="flex items-center justify-end gap-1 font-semibold">
                        {proxLabel ? localDate(proxLabel).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${aggCfg.color}`}
                    >
                      <aggCfg.icon className="h-2.5 w-2.5" />
                      {aggCfg.label}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-4 pb-3 pt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Parcelas{' '}
                        {g.pedido?.cond_pagamento ? (
                          <span className="ml-1 normal-case text-muted-foreground/70">
                            (cond. {g.pedido.cond_pagamento})
                          </span>
                        ) : null}
                      </p>
                      {g.parcelas.some((p) => p.status !== 'paga') && (
                        <button
                          onClick={() => toggleSelectPedido(g)}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Selecionar todas pendentes
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                    <table className="tbl-bf w-full text-xs">
                      <thead>
                        <tr className="text-[9px] uppercase text-muted-foreground">
                          <th className="w-8 py-1"></th>
                          <th className="py-1 text-center">#</th>
                          <th className="py-1 text-right">Valor</th>
                          <th className="py-1 text-right">Pago</th>
                          <th className="py-1 text-center">Previsão</th>
                          <th className="py-1 text-center">Pagamento</th>
                          <th className="py-1 text-center">Status</th>
                          <th className="py-1 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {g.parcelas.map((p) => {
                          const cfg = statusConfig[p.status] ?? statusConfig['futura']!
                          return (
                            <tr key={p.id} className="hover:bg-muted/10">
                              <td className="py-1.5 text-center">
                                {p.status !== 'paga' && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => toggleSelect(p.id)}
                                    className="h-3.5 w-3.5 rounded accent-primary"
                                  />
                                )}
                              </td>
                              <td className="py-1.5 text-center text-muted-foreground">{p.numero_parcela}</td>
                              <td className="py-1.5 text-right font-medium">{formatCurrency(p.valor)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">
                                {formatCurrency(p.valor_pago)}
                              </td>
                              <td className="py-1.5 text-center">
                                {localDate(dataPrev(p)).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="py-1.5 text-center text-muted-foreground">
                                {p.data_pagamento_real
                                  ? localDate(p.data_pagamento_real).toLocaleDateString('pt-BR')
                                  : '—'}
                              </td>
                              <td className="py-1.5 text-center">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${cfg.color}`}
                                >
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="py-1.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setViewingVinculos(p)}
                                    title="Ver movimentos vinculados"
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingParcela(p)}
                                    title="Editar"
                                    className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  {p.status !== 'paga' && (
                                    <button
                                      onClick={() => setPayingParcela(p)}
                                      className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20"
                                    >
                                      Pagar
                                    </button>
                                  )}
                                  {(p.status === 'paga' || p.status === 'parcialmente_paga') && (
                                    <button
                                      onClick={() => estornarParcela(p, false, qc)}
                                      title="Estornar baixa"
                                      className="rounded-md bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20"
                                    >
                                      Estornar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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

      {editingParcela && (
        <EditParcelaModal
          parcela={editingParcela}
          onClose={() => setEditingParcela(null)}
          onDone={() => {
            setEditingParcela(null)
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['itens_compra'] })
            qc.invalidateQueries({ queryKey: ['movimentacoes'] })
            qc.invalidateQueries({ queryKey: ['dashboard-kpis'] })
          }}
        />
      )}

      {viewingVinculos && (
        <VinculosMovsPanel
          origem="parcela"
          origemId={viewingVinculos.id}
          titulo={viewingVinculos.pedido_item ?? viewingVinculos.descricao ?? 'Parcela'}
          subtitulo={`Venc ${localDate(viewingVinculos.data_vencimento).toLocaleDateString('pt-BR')} · Parcela ${viewingVinculos.numero_parcela}`}
          valor={Number(viewingVinculos.valor)}
          onClose={() => setViewingVinculos(null)}
        />
      )}
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
  const [showConsolidar, setShowConsolidar] = useState(false)

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
      const totalPend = pendentes.reduce((s, p) => s + Math.max(0, p.valor - p.valor_pago), 0)
      const totalPago = g.parcelas.reduce((s, p) => s + Math.min(Number(p.valor_pago || 0), Number(p.valor || 0)), 0)

      const today = new Date().toISOString().split('T')[0]!
      const proxVenc = pendentes
        .filter((p) => dataPrev(p) >= today)
        .sort((a, b) => dataPrev(a).localeCompare(dataPrev(b)))[0]

      return {
        id: fid,
        nome: g.fornecedor?.nome ?? 'Sem Fornecedor',
        pendentes,
        totalPendente: totalPend,
        totalPago,
        proxVenc: proxVenc ? dataPrev(proxVenc) : null,
      }
    }).sort((a, b) => b.totalPendente - a.totalPendente)
  }, [parcelas, pedidos, fornecedores])

  // Count consolidatable groups
  const consolidatableCount = useMemo(() => {
    const keys = new Set<string>()
    pedidos.forEach(ped => {
      if (!ped.fornecedor_id || !ped.data_entrega_prevista) return
      keys.add(`${ped.fornecedor_id}|${ped.data_entrega_prevista}|${ped.cond_pagamento ?? ''}`)
    })
    // Count keys that have 2+ pedidos
    let count = 0
    for (const key of keys) {
      const parts = key.split('|')
      const matching = pedidos.filter(p =>
        p.fornecedor_id === parts[0] && p.data_entrega_prevista === parts[1] && (p.cond_pagamento ?? '') === parts[2]
      )
      if (matching.length >= 2) count++
    }
    return count
  }, [pedidos])

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
      .reduce((s, p) => s + Math.max(0, p.valor - p.valor_pago), 0)
  }, [selectedIds, parcelas])

  if (isLoading) return <Spinner />
  if (groups.length === 0) return <EmptyState msg="Sem dados de fornecedores" />

  return (
    <>
      {/* Consolidar button */}
      {consolidatableCount > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowConsolidar(true)}
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Package className="h-4 w-4" />
            Consolidar Pedidos
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold">
              {consolidatableCount} grupo(s)
            </span>
          </button>
        </div>
      )}

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
              <div className="border-t px-4 pb-3 pt-2 space-y-3">
                {(() => {
                  // Sub-agrupa parcelas pendentes deste fornecedor por pedido
                  const byPedido = new Map<string, { pedido?: Pedido; itemDesc: string; parcelas: typeof g.pendentes }>()
                  g.pendentes.forEach((p) => {
                    const key = p.pedido_id ?? `__avulsa__${p.id}`
                    const ped = p.pedido
                    const itemDesc = p.pedido_item ?? p.descricao ?? 'Avulsa'
                    if (!byPedido.has(key)) byPedido.set(key, { pedido: ped, itemDesc, parcelas: [] })
                    byPedido.get(key)!.parcelas.push(p)
                  })
                  const subgrupos = [...byPedido.values()].sort((a, b) => {
                    const an = a.pedido?.numero_pedido ?? Number.MAX_SAFE_INTEGER
                    const bn = b.pedido?.numero_pedido ?? Number.MAX_SAFE_INTEGER
                    return an - bn
                  })
                  return subgrupos.map((sub, idx) => {
                    const subTotal = sub.parcelas.reduce((s, p) => s + (p.valor - p.valor_pago), 0)
                    const subPendentes = sub.parcelas.filter((p) => p.status !== 'paga')
                    const allSelected =
                      subPendentes.length > 0 && subPendentes.every((p) => selectedIds.has(p.id))
                    const toggleSubSelect = () => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        subPendentes.forEach((p) => (allSelected ? next.delete(p.id) : next.add(p.id)))
                        return next
                      })
                    }
                    return (
                      <div key={sub.pedido?.id ?? idx} className="rounded-lg border border-border/50 bg-muted/10">
                        <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            {sub.pedido?.numero_pedido != null && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                PED #{sub.pedido.numero_pedido}
                              </span>
                            )}
                            <span className="truncate text-[11px] font-medium">{sub.itemDesc}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-[10px] text-muted-foreground">
                              {sub.parcelas.length} parc. · {formatCurrency(subTotal)}
                            </span>
                            {subPendentes.length > 0 && (
                              <button
                                onClick={toggleSubSelect}
                                className="text-[10px] text-primary hover:underline"
                              >
                                {allSelected ? 'Desmarcar' : 'Selecionar pendentes'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                        <table className="tbl-bf w-full text-xs">
                          <thead>
                            <tr className="text-[9px] uppercase text-muted-foreground">
                              <th className="w-8 py-1"></th>
                              <th className="py-1 text-center">#</th>
                              <th className="py-1 text-right">Valor</th>
                              <th className="py-1 text-center">Previsão</th>
                              <th className="py-1 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {sub.parcelas.map((p) => {
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
                                  <td className="py-1.5 text-center text-muted-foreground">{p.numero_parcela}</td>
                                  <td className="py-1.5 text-right font-medium">{formatCurrency(p.valor - p.valor_pago)}</td>
                                  <td className="py-1.5 text-center">{localDate(dataPrev(p)).toLocaleDateString('pt-BR')}</td>
                                  <td className="py-1.5 text-center">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )
                  })
                })()}
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

      {/* Consolidar Pedidos Wizard */}
      {showConsolidar && (
        <ConsolidarPedidosWizard
          pedidos={pedidos}
          parcelas={parcelas}
          onClose={() => setShowConsolidar(false)}
          onDone={() => {
            setShowConsolidar(false)
            qc.invalidateQueries({ queryKey: ['parcelas'] })
            qc.invalidateQueries({ queryKey: ['pedidos'] })
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
    // Anti-duplicação: identifica parcelas que já têm mov conciliada no extrato.
    const duplicadas: Array<{ parc: typeof selected[number]; mov: { data: string; valor: number; descricao: string } }> = []
    for (const parc of selected) {
      const movExistente = await findMovConciliadaParaParcela(parc.id, 'parcela')
      if (movExistente) duplicadas.push({ parc, mov: movExistente })
    }
    if (duplicadas.length > 0) {
      const lista = duplicadas.slice(0, 5).map(d =>
        `• ${d.mov.data} · ${formatCurrency(d.mov.valor)} · ${d.mov.descricao}`
      ).join('\n')
      const extra = duplicadas.length > 5 ? `\n... e mais ${duplicadas.length - 5}` : ''
      const ok = window.confirm(
        `${duplicadas.length} parcela(s) já têm lançamento no extrato:\n\n${lista}${extra}\n\n` +
        `Pagar em lote vai criar movs duplicadas. Continuar mesmo assim?`
      )
      if (!ok) return
    }
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

        // 3. Bank transaction + auto-conciliacao (paridade com Conciliacao + Fluxo)
        if (form.conta_bancaria_id) {
          const { data: movRow, error: eMov } = await supabase.from('movimentacoes_bancarias').insert({
            company_id: companyId,
            conta_id: form.conta_bancaria_id,
            data: form.data_pagamento,
            descricao: desc,
            valor: valorPago,
            tipo: 'saida',
            parcela_id: parc.id,
          }).select('id').single()
          if (eMov) throw eMov
          if (movRow) {
            const { data: concRow, error: eConc } = await supabase.from('conciliacoes').insert({
              company_id: companyId,
              movimentacao_id: movRow.id,
              match_type: 'manual',
              confidence: 100,
              status: 'aprovado',
            }).select('id').single()
            if (eConc) throw eConc
            if (concRow) {
              await supabase.from('conciliacao_parcelas').insert({
                conciliacao_id: concRow.id,
                parcela_id: parc.id,
                valor_aplicado: valorPago,
              })
            }
          }
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

export function ContasTab({ search }: { search: string }) {
  const { data: contas = [], isLoading } = useContasBancarias()
  const createConta = useCreateContaBancaria()
  const updateConta = useUpdateContaBancaria()
  const deleteConta = useDeleteContaBancaria()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '' })

  const startEdit = (c: ContaBancaria) => {
    setEditingId(c.id)
    setForm({
      nome: c.nome, banco: c.banco ?? '', agencia: c.agencia ?? '',
      conta: c.conta ?? '', tipo: c.tipo ?? 'corrente', saldo_inicial: String(c.saldo_inicial),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      await updateConta.mutateAsync({
        id: editingId,
        nome: form.nome, banco: form.banco || null,
        agencia: form.agencia || null, conta: form.conta || null,
        tipo: form.tipo || null, saldo_inicial: form.saldo_inicial ? parseFloat(form.saldo_inicial) : 0,
      })
      setEditingId(null)
    } else {
      await createConta.mutateAsync({
        nome: form.nome, banco: form.banco || null,
        agencia: form.agencia || null, conta: form.conta || null,
        tipo: form.tipo || null, saldo_inicial: form.saldo_inicial ? parseFloat(form.saldo_inicial) : 0,
      })
    }
    setShowForm(false)
    setForm({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '' })
  }

  const handleToggleAtiva = async (c: ContaBancaria) => {
    await updateConta.mutateAsync({ id: c.id, ativa: !c.ativa })
  }

  const handleDelete = async (c: ContaBancaria) => {
    if (!window.confirm(`Excluir conta "${c.nome}"? Esta a\u00e7\u00e3o \u00e9 irrevers\u00edvel.`)) return
    deleteConta.mutate(c.id)
  }

  const filtered = contas.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) || (c.banco ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '' }) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </div>

      {(showForm || editingId) && (
        <div className="mb-4 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? 'Editar Conta' : 'Nova Conta'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Nome *</label><input type="text" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required className={INPUT} /></div>
              <div><label className={LABEL}>Banco</label><input type="text" value={form.banco} onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Tipo</label><select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className={INPUT}><option value="corrente">Corrente</option><option value="poupanca">Poupan\u00e7a</option><option value="investimento">Investimento</option></select></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={LABEL}>Ag\u00eancia</label><input type="text" value={form.agencia} onChange={(e) => setForm((p) => ({ ...p, agencia: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Conta</label><input type="text" value={form.conta} onChange={(e) => setForm((p) => ({ ...p, conta: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Saldo Inicial (R$)</label><input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm((p) => ({ ...p, saldo_inicial: e.target.value }))} className={INPUT} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button type="submit" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" />{editingId ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState msg="Nenhuma conta cadastrada" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className={`rounded-xl border bg-card p-5 transition-shadow hover:shadow-md ${!c.ativa ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{c.nome}</h4>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.ativa ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
                    {c.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {c.banco && <p>Banco: <span className="font-medium text-foreground">{c.banco}</span></p>}
                {c.agencia && <p>Ag\u00eancia: <span className="font-medium text-foreground">{c.agencia}</span></p>}
                {c.conta && <p>Conta: <span className="font-medium text-foreground">{c.conta}</span></p>}
                {c.tipo && <p>Tipo: <span className="font-medium text-foreground capitalize">{c.tipo}</span></p>}
              </div>
              <div className="mt-3 border-t pt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Inicial</p>
                  <p className="text-lg font-bold">{formatCurrency(c.saldo_inicial)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { startEdit(c); setShowForm(true) }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleAtiva(c)}
                    className={`rounded-lg p-2 transition-colors ${c.ativa ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                    title={c.ativa ? 'Inativar' : 'Ativar'}
                  >
                    {c.ativa ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Excluir (somente sem movimenta\u00e7\u00f5es)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
      {label}
      <button type="button" onClick={onRemove} className="rounded-full hover:bg-primary/20 p-0.5">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

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
