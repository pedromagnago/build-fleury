/**
 * Build Fleury — Gestão de Recebimentos
 *
 * Consolida todas as entradas do sistema:
 *  - Medições (receita do contrato principal)
 *  - Adiantamentos a receber (mútuos categoria='Adiantamento a Receber')
 *  - Captações / Capital de Giro (mútuos de captação)
 *
 * Paridade com PagamentosPage:
 *  - Filtros avançados (status, tempo, parceiro, data, valor)
 *  - Seleção bulk com BulkActionBar
 *  - Export XLSX, Baixar em lote, Estornar em lote
 *  - RecebimentoBaixaModal (mov bancária + conciliação)
 *  - EditRecebimentoModal (por origem)
 *  - estornarRecebimento (limpa conc + mov + reseta origem)
 *  - Aba Por Parceiro e Agenda
 */
import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  TrendingUp, Plus, Search, Calendar, AlertTriangle,
  CheckCircle2, Clock, DollarSign, ArrowDownCircle,
  FileText, Landmark, ExternalLink, CircleDollarSign,
  ChevronDown, X, Pencil, RotateCcw, Link as LinkIcon,
  ChevronRight, Users,
} from 'lucide-react'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useSelection } from '@/hooks/useSelection'
import { NovoAdiantamentoDialog } from '@/components/financeiro/NovoAdiantamentoDialog'
import { VinculosMovsPanel } from '@/components/conciliacao/VinculosMovsPanel'
import { aplicarDeltaOrigem } from '@/hooks/useConciliacao'
import RecebimentosBulkActions from '@/components/RecebimentosBulkActions'
import BulkActionBar from '@/components/BulkActionBar'
import RecebimentoBaixaModal, { type RecebimentoBaixaItem } from '@/components/financeiro/RecebimentoBaixaModal'
import EditRecebimentoModal, { type RecebimentoEditItem } from '@/components/financeiro/EditRecebimentoModal'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Tab = 'geral' | 'medicoes' | 'adiantamentos' | 'captacoes' | 'por_parceiro' | 'agenda'
type QuickFilter = 'todas' | 'atrasadas' | 'hoje' | 'prox30' | 'recebidas'
type StatusFilter = 'todas' | 'previsto' | 'parcial' | 'vencido' | 'recebido'

export interface RecebimentoItem {
  id: string
  origem: 'medicao' | 'adiantamento' | 'captacao'
  descricao: string
  parceiro: string | null
  valor: number
  valor_total: number
  data_prevista: string
  data_efetiva: string | null
  status: 'previsto' | 'recebido' | 'vencido' | 'parcial'
  sem_valor?: boolean
  raw: any
}

const INPUT = 'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtDateBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${(y ?? '').slice(2)}`
}

// ─── Estorno (equivalente a estornarParcela em PagamentosPage) ───────────────

async function estornarRecebimento(
  item: RecebimentoItem,
  qc: ReturnType<typeof useQueryClient>,
) {
  if (!window.confirm(
    `Estornar baixa de ${formatCurrency(item.valor_total)}?\n` +
    `Isso apaga a movimentação bancária e a conciliação vinculadas.`,
  )) return
  try {
    const fkCol =
      item.origem === 'medicao' ? 'medicao_id' :
      item.origem === 'adiantamento' ? 'mutuo_parcela_id' :
      'mutuo_id'

    const { data: links } = await supabase
      .from('conciliacao_parcelas')
      .select('conciliacao_id, valor_aplicado, medicao_id, mutuo_parcela_id, mutuo_id')
      .eq(fkCol, item.raw.id)

    const today = new Date().toISOString().split('T')[0]!

    // Reverte cada link via aplicarDeltaOrigem — mesma lógica do useUndoConciliacao,
    // garante recálculo correto de saldo/status sem UPDATE direto na origem.
    for (const link of (links ?? [])) {
      const delta = -Number(link.valor_aplicado ?? 0)
      if (link.medicao_id) await aplicarDeltaOrigem('medicao', link.medicao_id, delta, today)
      else if (link.mutuo_parcela_id) await aplicarDeltaOrigem('mutuo_parcela', link.mutuo_parcela_id, delta, today)
      else if (link.mutuo_id) await aplicarDeltaOrigem('mutuo', link.mutuo_id, delta, today)
    }

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

    await Promise.all([
      qc.invalidateQueries({ queryKey: ['medicoes'] }),
      qc.invalidateQueries({ queryKey: ['mutuos'] }),
      qc.invalidateQueries({ queryKey: ['movimentacoes'] }),
      qc.invalidateQueries({ queryKey: ['conciliacoes'] }),
      qc.invalidateQueries({ queryKey: ['parcelas'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
    ])
    toast.success('Baixa estornada com sucesso')
  } catch (err: any) {
    toast.error('Erro ao estornar: ' + (err?.message ?? String(err)))
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecebimentosPage() {
  const { data: medicoes = [] } = useMedicoes()
  const { data: mutuos = [] } = useMutuos()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  // ── Navegação / view ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('geral')

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    searchParams.get('filtro') === 'vencidas' ? 'atrasadas' : 'todas'
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [parceiroFilter, setParceiroFilter] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')
  const [soAberto, setSoAberto] = useState(false)

  // ── Ações de linha ───────────────────────────────────────────────────────────
  const [showNovo, setShowNovo] = useState(false)
  const [baixando, setBaixando] = useState<RecebimentoItem | null>(null)
  const [editando, setEditando] = useState<RecebimentoItem | null>(null)
  const [viewingVinculos, setViewingVinculos] = useState<RecebimentoItem | null>(null)

  // ── Seleção bulk ─────────────────────────────────────────────────────────────
  const selection = useSelection()

  // ── Dados consolidados ───────────────────────────────────────────────────────
  const todosRecebimentos: RecebimentoItem[] = useMemo(() => {
    const result: RecebimentoItem[] = []
    const today = new Date().toISOString().split('T')[0]!

    // 1) Medições (receita do contrato)
    for (const m of medicoes) {
      const total = Number(m.valor_planejado) || 0
      const recebidoSofar = Number(m.valor_liberado) || 0
      const saldo = total - recebidoSofar
      const recebidoFull = m.status === 'paga' || (total > 0 && saldo <= 0.01 && recebidoSofar > 0)
      const parcial = !recebidoFull && recebidoSofar > 0.01 && saldo > 0.01
      const atrasado = !recebidoFull && !parcial && m.data_prevista < today
      const valor = recebidoFull ? (recebidoSofar || total) : parcial ? saldo : total
      const descricao = parcial
        ? `Medição nº ${m.numero} (parcial: ${formatCurrency(recebidoSofar)} de ${formatCurrency(total)})`
        : `Medição nº ${m.numero}`
      result.push({
        id: `med-${m.id}`,
        origem: 'medicao',
        descricao,
        parceiro: 'Cliente (Contrato)',
        valor,
        valor_total: total,
        data_prevista: m.data_prevista,
        data_efetiva: m.data_liberacao,
        status: recebidoFull ? 'recebido' : parcial ? 'parcial' : atrasado ? 'vencido' : 'previsto',
        sem_valor: total <= 0.01,
        raw: m,
      })
    }

    // 2) Mútuos: adiantamentos feitos (parcelas = recebimentos esperados)
    for (const mut of mutuos) {
      if (mut.categoria === 'STUB_Dedupe') continue
      const cat = String(mut.categoria ?? '').toLowerCase()
      const isAdiantamentoFeito = cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')

      if (isAdiantamentoFeito) {
        for (const mp of (mut.parcelas ?? []) as any[]) {
          const totalMp = Number(mp.valor) || 0
          const pagoMp = Number(mp.valor_pago || 0)
          const saldoMp = totalMp - pagoMp
          const fullPaga = mp.status === 'paga' || (totalMp > 0 && saldoMp <= 0.01 && pagoMp > 0)
          const parcialMp = !fullPaga && pagoMp > 0.01 && saldoMp > 0.01
          const valor = fullPaga ? totalMp : parcialMp ? saldoMp : totalMp
          const descricaoMp = `Devolução: ${mut.nome}` + (mp.numero_parcela ? ` · P${mp.numero_parcela}` : '')
            + (parcialMp ? ` (parcial: ${formatCurrency(pagoMp)} de ${formatCurrency(totalMp)})` : '')
          result.push({
            id: `mutpar-${mp.id}`,
            origem: 'adiantamento',
            descricao: descricaoMp,
            parceiro: (mut as any).fornecedor?.nome ?? '—',
            valor,
            valor_total: totalMp,
            data_prevista: mp.data_vencimento,
            data_efetiva: fullPaga ? mp.data_pagamento_real : null,
            status: fullPaga ? 'recebido' : parcialMp ? 'parcial' : 'previsto',
            sem_valor: totalMp <= 0.01,
            raw: { ...mp, _mutuoNome: mut.nome },
          })
        }
        continue
      }

      // 3) Captação / Capital de Giro (entrada de dinheiro no projeto)
      const totalMut = Number(mut.valor_captado) || 0
      const concEntrada = Number((mut as any).valor_conciliado_entrada || 0)
      const concSaida = Number((mut as any).valor_conciliado_saida || 0)
      const conciliadoTotal = concEntrada + concSaida
      const saldoMut = Math.max(0, totalMut - conciliadoTotal)
      const quitado = mut.status === 'quitado' || (totalMut > 0 && saldoMut <= 0.01 && conciliadoTotal > 0)
      const parcialMut = !quitado && conciliadoTotal > 0.01 && saldoMut > 0.01
      const valorMut = quitado ? totalMut : parcialMut ? saldoMut : totalMut
      const descricaoMut = mut.nome + (parcialMut ? ` (parcial: ${formatCurrency(conciliadoTotal)} de ${formatCurrency(totalMut)})` : '')
      result.push({
        id: `mut-${mut.id}`,
        origem: 'captacao',
        descricao: descricaoMut,
        parceiro: (mut as any).fornecedor?.nome ?? '—',
        valor: valorMut,
        valor_total: totalMut,
        data_prevista: mut.data_captacao,
        data_efetiva: quitado ? mut.data_captacao : null,
        status: quitado ? 'recebido' : parcialMut ? 'parcial' : 'previsto',
        sem_valor: totalMut <= 0.01,
        raw: mut,
      })
    }

    result.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
    return result
  }, [medicoes, mutuos])

  // ── Aplicar filtros ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]!
  const em30 = new Date(); em30.setDate(em30.getDate() + 30)
  const em30Str = em30.toISOString().split('T')[0]!

  const filtrados = useMemo(() => {
    let arr = todosRecebimentos

    // Filtro de tab / origem
    if (tab === 'medicoes') arr = arr.filter(r => r.origem === 'medicao')
    else if (tab === 'adiantamentos') arr = arr.filter(r => r.origem === 'adiantamento')
    else if (tab === 'captacoes') arr = arr.filter(r => r.origem === 'captacao')

    // Filtro de texto
    const q = search.toLowerCase().trim()
    if (q) {
      arr = arr.filter(r =>
        r.descricao.toLowerCase().includes(q) ||
        (r.parceiro ?? '').toLowerCase().includes(q) ||
        String(r.valor_total).includes(q),
      )
    }

    // Filtro de status
    if (statusFilter !== 'todas') arr = arr.filter(r => r.status === statusFilter)

    // Filtro de tempo (quick filter)
    if (quickFilter === 'atrasadas') arr = arr.filter(r => r.status !== 'recebido' && r.data_prevista < today)
    else if (quickFilter === 'hoje') arr = arr.filter(r => r.status !== 'recebido' && r.data_prevista === today)
    else if (quickFilter === 'prox30') arr = arr.filter(r => r.status !== 'recebido' && r.data_prevista >= today && r.data_prevista <= em30Str)
    else if (quickFilter === 'recebidas') arr = arr.filter(r => r.status === 'recebido')

    // Filtros avançados
    if (soAberto) arr = arr.filter(r => r.status !== 'recebido')
    if (parceiroFilter) arr = arr.filter(r => (r.parceiro ?? '') === parceiroFilter)
    if (dataDe) arr = arr.filter(r => r.data_prevista >= dataDe)
    if (dataAte) arr = arr.filter(r => r.data_prevista <= dataAte)
    if (valorMin) arr = arr.filter(r => r.valor_total >= parseFloat(valorMin))
    if (valorMax) arr = arr.filter(r => r.valor_total <= parseFloat(valorMax))

    return arr
  }, [todosRecebimentos, tab, search, statusFilter, quickFilter, soAberto, parceiroFilter, dataDe, dataAte, valorMin, valorMax, today, em30Str])

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const inicioMes = today.substring(0, 7) + '-01'
    let totalReceber = 0, recebidoMes = 0, atrasado = 0, prox30 = 0
    for (const r of todosRecebimentos) {
      const emAberto = r.status === 'previsto' || r.status === 'parcial' || r.status === 'vencido'
      if (emAberto) {
        totalReceber += r.valor
        if (r.data_prevista < today) atrasado += r.valor
        if (r.data_prevista >= today && r.data_prevista <= em30Str) prox30 += r.valor
      }
      if (r.status === 'recebido' && r.data_efetiva && r.data_efetiva >= inicioMes) {
        recebidoMes += r.valor
      }
    }
    return { totalReceber, recebidoMes, atrasado, prox30 }
  }, [todosRecebimentos, today, em30Str])

  // ── Listas auxiliares ────────────────────────────────────────────────────────
  const parceiros = useMemo(() => {
    const set = new Set<string>()
    todosRecebimentos.forEach(r => { if (r.parceiro) set.add(r.parceiro) })
    return Array.from(set).sort()
  }, [todosRecebimentos])

  const counts = useMemo(() => ({
    geral: todosRecebimentos.length,
    medicoes: todosRecebimentos.filter(r => r.origem === 'medicao').length,
    adiantamentos: todosRecebimentos.filter(r => r.origem === 'adiantamento').length,
    captacoes: todosRecebimentos.filter(r => r.origem === 'captacao').length,
  }), [todosRecebimentos])

  const advancedActiveCount = [parceiroFilter, soAberto, dataDe, dataAte, valorMin, valorMax].filter(Boolean).length

  const clearAdvanced = () => {
    setParceiroFilter(''); setSoAberto(false)
    setDataDe(''); setDataAte('')
    setValorMin(''); setValorMax('')
  }

  // ── Quick selection ───────────────────────────────────────────────────────────
  const selectAtrasadas = () => {
    const ids = filtrados.filter(r => r.status !== 'recebido' && r.data_prevista < today).map(r => r.id)
    selection.selectAll(ids)
    if (ids.length === 0) toast.info('Nenhum recebimento em atraso')
    else toast.success(`${ids.length} recebimento(s) em atraso selecionado(s)`)
  }
  const selectProx30 = () => {
    const ids = filtrados.filter(r => r.status !== 'recebido' && r.data_prevista >= today && r.data_prevista <= em30Str).map(r => r.id)
    selection.selectAll(ids)
    if (ids.length === 0) toast.info('Nenhum recebimento nos próximos 30 dias')
    else toast.success(`${ids.length} recebimento(s) selecionado(s)`)
  }

  const TABS: Array<{ key: Tab; label: string; icon: typeof Clock; count?: number }> = [
    { key: 'geral', label: 'Todos', icon: DollarSign, count: counts.geral },
    { key: 'medicoes', label: 'Medições', icon: FileText, count: counts.medicoes },
    { key: 'adiantamentos', label: 'Adiantamentos', icon: Landmark, count: counts.adiantamentos },
    { key: 'captacoes', label: 'Capital de Giro', icon: ArrowDownCircle, count: counts.captacoes },
    { key: 'por_parceiro', label: 'Por Parceiro', icon: Users },
    { key: 'agenda', label: 'Agenda', icon: Calendar },
  ]

  return (
    <div>
      <PageHeader
        title="Recebimentos"
        description="Medições, adiantamentos e capital de giro"
        icon={TrendingUp}
      />

      {/* KPIs clicáveis */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={Clock} label="A Receber" value={formatCurrency(kpis.totalReceber)} color="text-amber-600"
          active={false}
        />
        <KpiCard
          icon={CheckCircle2} label="Recebido no Mês" value={formatCurrency(kpis.recebidoMes)} color="text-emerald-600"
          active={quickFilter === 'recebidas'}
          onClick={() => { setQuickFilter(q => q === 'recebidas' ? 'todas' : 'recebidas'); setTab('geral') }}
        />
        <KpiCard
          icon={AlertTriangle} label="Em Atraso" value={formatCurrency(kpis.atrasado)} color="text-red-500"
          active={quickFilter === 'atrasadas'}
          onClick={() => { setQuickFilter(q => q === 'atrasadas' ? 'todas' : 'atrasadas'); setTab('geral') }}
        />
        <KpiCard
          icon={Calendar} label="Próximos 30 dias" value={formatCurrency(kpis.prox30)} color="text-blue-600"
          active={quickFilter === 'prox30'}
          onClick={() => { setQuickFilter(q => q === 'prox30' ? 'todas' : 'prox30'); setTab('geral') }}
        />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[9px] font-bold ${
                tab === t.key ? 'bg-primary-foreground/20' : 'bg-muted'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Abas especiais */}
      {tab === 'por_parceiro' && (
        <PorParceiroTab items={todosRecebimentos} />
      )}
      {tab === 'agenda' && (
        <AgendaRecebimentosTab items={todosRecebimentos} />
      )}

      {/* Conteúdo principal (abas de listagem) */}
      {(tab === 'geral' || tab === 'medicoes' || tab === 'adiantamentos' || tab === 'captacoes') && (
        <>
          {/* Barra de filtros principal */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* Busca */}
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar descrição, parceiro ou valor..."
                className="w-full rounded-lg border bg-background pl-10 pr-3 py-2 text-sm" />
            </div>

            {/* Quick filter status */}
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
              {([
                ['todas', 'Todas'],
                ['previsto', 'Previsto'],
                ['parcial', 'Parcial'],
                ['vencido', 'Atrasado'],
                ['recebido', 'Recebido'],
              ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setStatusFilter(k)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    statusFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  } ${k === 'vencido' && statusFilter === k ? 'text-red-600' : ''} ${k === 'recebido' && statusFilter === k ? 'text-emerald-600' : ''}`}
                >{label}</button>
              ))}
            </div>

            {/* Quick filter tempo */}
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-0.5">
              {([
                ['todas', 'Todas'],
                ['atrasadas', 'Atrasadas'],
                ['hoje', 'Hoje'],
                ['prox30', 'Próx. 30d'],
                ['recebidas', 'Recebidas'],
              ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setQuickFilter(k)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    quickFilter === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  } ${k === 'atrasadas' && quickFilter === k ? 'text-red-600' : ''} ${k === 'recebidas' && quickFilter === k ? 'text-emerald-600' : ''}`}
                >{label}</button>
              ))}
            </div>

            {/* Ações ml-auto */}
            <div className="ml-auto flex gap-1.5">
              <button onClick={selectAtrasadas}
                className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10">
                Sel. atrasadas
              </button>
              <button onClick={selectProx30}
                className="rounded-lg border px-2.5 py-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-500/10">
                Sel. próx. 30d
              </button>
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
              <button onClick={() => setShowNovo(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700">
                <Plus className="h-3.5 w-3.5" />Novo Adiantamento
              </button>
            </div>
          </div>

          {/* Painel filtros avançados */}
          {showAdvanced && (
            <div className="mb-4 rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold">Filtros avançados</span>
                {advancedActiveCount > 0 && (
                  <button onClick={clearAdvanced}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                    <X className="h-3 w-3" />Limpar filtros ({advancedActiveCount})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                <div>
                  <label className={LABEL}>Parceiro</label>
                  <select value={parceiroFilter} onChange={e => setParceiroFilter(e.target.value)} className={INPUT}>
                    <option value="">Todos</option>
                    {parceiros.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className={LABEL}>Status</label>
                  <button
                    type="button"
                    onClick={() => { setSoAberto(v => !v) }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      soAberto ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {soAberto
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                      : <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40" />}
                    Apenas em aberto
                  </button>
                </div>
                <div>
                  <label className={LABEL}>Data Prevista — de</label>
                  <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Data Prevista — até</label>
                  <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Valor mínimo (R$)</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00"
                    value={valorMin} onChange={e => setValorMin(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Valor máximo (R$)</label>
                  <input type="number" min="0" step="0.01" placeholder="Sem limite"
                    value={valorMax} onChange={e => setValorMax(e.target.value)} className={INPUT} />
                </div>
              </div>
              {advancedActiveCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {parceiroFilter && <FilterTag label={`Parceiro: ${parceiroFilter}`} onRemove={() => setParceiroFilter('')} />}
                  {soAberto && <FilterTag label="Apenas em aberto" onRemove={() => setSoAberto(false)} />}
                  {dataDe && <FilterTag label={`A partir de ${fmtDateBr(dataDe)}`} onRemove={() => setDataDe('')} />}
                  {dataAte && <FilterTag label={`Até ${fmtDateBr(dataAte)}`} onRemove={() => setDataAte('')} />}
                  {valorMin && <FilterTag label={`Valor ≥ ${formatCurrency(parseFloat(valorMin))}`} onRemove={() => setValorMin('')} />}
                  {valorMax && <FilterTag label={`Valor ≤ ${formatCurrency(parseFloat(valorMax))}`} onRemove={() => setValorMax('')} />}
                </div>
              )}
            </div>
          )}

          {/* Tabela */}
          <div className="overflow-auto rounded-xl border bg-card max-h-[calc(100vh-320px)]">
            {filtrados.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm">Nenhum recebimento encontrado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {search || advancedActiveCount > 0 || statusFilter !== 'todas' || quickFilter !== 'todas'
                    ? 'Ajuste os filtros para ver mais itens'
                    : 'Clique em "Novo Adiantamento" para registrar uma entrada'}
                </p>
              </div>
            ) : (
              <table className="tbl-bf w-full text-xs">
                <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]">
                  <tr>
                    <th className="px-2 py-2.5 text-center">
                      <input type="checkbox"
                        checked={selection.count === filtrados.length && filtrados.length > 0}
                        onChange={() => selection.toggleAll(filtrados.map(r => r.id))}
                        className="h-3.5 w-3.5 rounded accent-primary" />
                    </th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Origem</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parceiro</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data Prev.</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data Real</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valor Total</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recebido</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtrados.map(r => (
                    <RecebimentoRow
                      key={r.id}
                      item={r}
                      isSelected={selection.isSelected(r.id)}
                      onToggle={() => selection.toggle(r.id)}
                      onShowVinculos={() => setViewingVinculos(r)}
                      onBaixar={r.status !== 'recebido' && !r.sem_valor ? () => setBaixando(r) : undefined}
                      onEditar={() => setEditando(r)}
                      onEstornar={(r.status === 'recebido' || r.status === 'parcial') ? () => estornarRecebimento(r, qc) : undefined}
                    />
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-bold">
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right text-xs">TOTAL FILTRADO ({filtrados.length} itens)</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                      {formatCurrency(filtrados.reduce((s, r) => s + r.valor_total, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Links relacionados */}
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Relacionado:</span>
            <Link to="/cronograma" className="inline-flex items-center gap-1 text-primary hover:underline">
              <FileText className="h-3 w-3" />Cronograma (Medições)
            </Link>
            <Link to="/mutuos" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Landmark className="h-3 w-3" />Capital de Giro
            </Link>
            <Link to="/conciliacao" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ArrowDownCircle className="h-3 w-3" />Extrato da Conta
            </Link>
          </div>
        </>
      )}

      {/* BulkActionBar */}
      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        summary={(() => {
          const sel = filtrados.filter(r => selection.selected.has(r.id))
          if (sel.length === 0) return undefined
          const total = sel.reduce((s, r) => s + r.valor_total, 0)
          const recebido = sel.reduce((s, r) => {
            if (r.origem === 'medicao') return s + Number(r.raw.valor_liberado ?? 0)
            if (r.origem === 'adiantamento') return s + Number(r.raw.valor_pago ?? 0)
            return s
          }, 0)
          const pendente = Math.max(0, total - recebido)
          const atrasados = sel.filter(r => r.status !== 'recebido' && r.data_prevista < today).length
          return [
            { label: 'Valor', value: formatCurrency(total), tone: 'primary' as const },
            ...(recebido > 0 ? [{ label: 'Recebido', value: formatCurrency(recebido), tone: 'emerald' as const }] : []),
            { label: 'Pendente', value: formatCurrency(pendente), tone: 'amber' as const },
            ...(atrasados > 0 ? [{ label: 'Atrasados', value: String(atrasados), tone: 'red' as const }] : []),
          ]
        })()}
      >
        <RecebimentosBulkActions
          items={filtrados}
          selectedIds={selection.selected}
          onDone={selection.clear}
          onBaixarLote={(items) => {
            if (items.length === 1 && items[0]) {
              setBaixando(items[0])
            } else {
              toast.info(`Baixa em lote: abrindo primeiro de ${items.length} itens`)
              if (items[0]) setBaixando(items[0])
            }
          }}
        />
      </BulkActionBar>

      {/* Novo adiantamento */}
      {showNovo && <NovoAdiantamentoDialog onClose={() => setShowNovo(false)} />}

      {/* Baixa modal */}
      {baixando && (
        <RecebimentoBaixaModal
          item={baixando as RecebimentoBaixaItem}
          onClose={() => setBaixando(null)}
          onDone={() => setBaixando(null)}
        />
      )}

      {/* Edição modal */}
      {editando && (
        <EditRecebimentoModal
          item={editando as RecebimentoEditItem}
          onClose={() => setEditando(null)}
          onDone={() => setEditando(null)}
        />
      )}

      {/* Vínculos / rastreio */}
      {viewingVinculos && (
        <VinculosMovsPanel
          origem={
            viewingVinculos.origem === 'medicao' ? 'medicao' :
            viewingVinculos.origem === 'adiantamento' ? 'mutuo_parcela' :
            'mutuo'
          }
          origemId={viewingVinculos.raw.id}
          titulo={viewingVinculos.descricao}
          subtitulo={`${viewingVinculos.parceiro ?? ''} · Previsto ${fmtDateBr(viewingVinculos.data_prevista)}`}
          valor={viewingVinculos.valor_total}
          valorPago={
            viewingVinculos.origem === 'medicao' ? Number(viewingVinculos.raw.valor_liberado ?? 0) :
            viewingVinculos.origem === 'adiantamento' ? Number(viewingVinculos.raw.valor_pago ?? 0) :
            Number((viewingVinculos.raw.valor_conciliado_entrada ?? 0))
          }
          onClose={() => setViewingVinculos(null)}
        />
      )}
    </div>
  )
}

// ─── RecebimentoRow ───────────────────────────────────────────────────────────

function RecebimentoRow({
  item, isSelected, onToggle, onShowVinculos, onBaixar, onEditar, onEstornar,
}: {
  item: RecebimentoItem
  isSelected: boolean
  onToggle: () => void
  onShowVinculos: () => void
  onBaixar?: () => void
  onEditar: () => void
  onEstornar?: () => void
}) {
  const today = new Date().toISOString().split('T')[0]!
  const isAtrasado = item.status !== 'recebido' && item.data_prevista < today
  const isHoje = item.status !== 'recebido' && item.data_prevista === today

  const statusCfg = {
    previsto: { label: 'Previsto', cls: 'bg-blue-500/10 text-blue-600', Icon: Clock },
    recebido: { label: 'Recebido', cls: 'bg-emerald-500/10 text-emerald-600', Icon: CheckCircle2 },
    vencido: { label: 'Atrasado', cls: 'bg-red-500/10 text-red-500', Icon: AlertTriangle },
    parcial: { label: 'Parcial', cls: 'bg-amber-500/10 text-amber-600', Icon: Clock },
  }[item.status]

  const origemCfg = {
    medicao: { label: 'Medição', cls: 'bg-purple-500/10 text-purple-600' },
    adiantamento: { label: 'Adiantamento', cls: 'bg-violet-500/10 text-violet-600' },
    captacao: { label: 'Capital Giro', cls: 'bg-indigo-500/10 text-indigo-600' },
  }[item.origem]

  const recebidoVal =
    item.origem === 'medicao' ? Number(item.raw.valor_liberado ?? 0) :
    item.origem === 'adiantamento' ? Number(item.raw.valor_pago ?? 0) : 0

  const pct = item.valor_total > 0 ? Math.min(100, (recebidoVal / item.valor_total) * 100) : 0

  const linkTo = item.origem === 'medicao' ? '/cronograma' : '/mutuos'

  return (
    <tr className={`group transition-colors hover:bg-muted/20 ${isSelected ? 'bg-primary/5' : ''}`}>
      <td className="px-2 py-2.5 text-center">
        <input type="checkbox" checked={isSelected} onChange={onToggle}
          className="h-3.5 w-3.5 rounded accent-primary" />
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCfg.cls}`}>
          <statusCfg.Icon className="h-3 w-3" />{statusCfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${origemCfg.cls}`}>
          {origemCfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 max-w-[240px] truncate font-medium" title={item.descricao}>
        {item.descricao}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate" title={item.parceiro ?? ''}>
        {item.parceiro ?? '—'}
      </td>
      <td className={`px-3 py-2.5 text-center tabular-nums ${isAtrasado ? 'text-red-600' : isHoje ? 'text-amber-600' : ''}`}>
        <div className="flex items-center justify-center gap-1">
          {fmtDateBr(item.data_prevista)}
          {isAtrasado && <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-600">VENC</span>}
          {isHoje && <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-bold text-amber-600">HOJE</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
        {fmtDateBr(item.data_efetiva)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
        {item.sem_valor
          ? <span className="text-muted-foreground text-[11px] italic">sem valor</span>
          : formatCurrency(item.valor_total)
        }
      </td>
      <td className="px-3 py-2.5 text-right">
        {item.status === 'parcial' && item.valor_total > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[10px] tabular-nums text-emerald-600">{formatCurrency(recebidoVal)}</span>
            <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : item.status === 'recebido' ? (
          <span className="font-mono text-[10px] tabular-nums text-emerald-600">{formatCurrency(recebidoVal || item.valor_total)}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={onShowVinculos}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
            title="Ver movimentos vinculados (rastreio)">
            <LinkIcon className="h-3 w-3" />
          </button>
          <button onClick={onEditar}
            className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors"
            title="Editar">
            <Pencil className="h-3 w-3" />
          </button>
          {onBaixar && (
            <button onClick={onBaixar}
              className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-500/20"
              title="Registrar recebimento (parcial ou total)">
              <CircleDollarSign className="h-3 w-3 inline mr-0.5" />Baixar
            </button>
          )}
          {onEstornar && (
            <button onClick={onEstornar}
              className="rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-600 hover:bg-amber-500/20"
              title="Estornar baixa (apaga mov + conciliação)">
              <RotateCcw className="h-3 w-3 inline mr-0.5" />Estornar
            </button>
          )}
          <Link to={linkTo} className="rounded-md p-1.5 text-muted-foreground hover:text-primary" title="Ver origem">
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </td>
    </tr>
  )
}

// ─── Por Parceiro Tab ─────────────────────────────────────────────────────────

function PorParceiroTab({ items }: { items: RecebimentoItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const groups = useMemo(() => {
    const map = new Map<string, RecebimentoItem[]>()
    items.forEach(i => {
      const key = i.parceiro ?? '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    })
    return [...map.entries()].map(([parceiro, itens]) => {
      const total = itens.reduce((s, i) => s + i.valor_total, 0)
      const recebido = itens.reduce((s, i) => {
        if (i.origem === 'medicao') return s + Number(i.raw.valor_liberado ?? 0)
        if (i.origem === 'adiantamento') return s + Number(i.raw.valor_pago ?? 0)
        return s
      }, 0)
      const pendente = Math.max(0, total - recebido)
      const atrasados = itens.filter(i => i.status !== 'recebido' && i.data_prevista < new Date().toISOString().split('T')[0]!).length
      const status: 'atrasado' | 'parcial' | 'ok' =
        atrasados > 0 ? 'atrasado' :
        pendente > 0 ? 'parcial' :
        'ok'
      return { parceiro, itens, total, recebido, pendente, atrasados, status }
    }).sort((a, b) => {
      const order = { atrasado: 0, parcial: 1, ok: 2 }
      return order[a.status] - order[b.status]
    })
  }, [items])

  const filtered = search
    ? groups.filter(g => g.parceiro.toLowerCase().includes(search.toLowerCase()))
    : groups

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por parceiro..."
            className="w-full rounded-lg border bg-background pl-10 pr-3 py-2 text-sm" />
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map(g => {
          const isOpen = expandedId === g.parceiro
          const statusCls = g.status === 'atrasado' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20' :
                            g.status === 'parcial' ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20' :
                            'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
          return (
            <div key={g.parceiro} className={`rounded-xl border ${statusCls} overflow-hidden`}>
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-black/5 transition-colors"
                onClick={() => setExpandedId(isOpen ? null : g.parceiro)}
              >
                <div className="flex items-center gap-3">
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm font-semibold">{g.parceiro}</span>
                  <span className="text-[10px] text-muted-foreground">{g.itens.length} ite{g.itens.length !== 1 ? 'ns' : 'm'}</span>
                  {g.atrasados > 0 && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-600">
                      {g.atrasados} atrasado{g.atrasados > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase">Total</div>
                    <div className="text-sm font-bold tabular-nums">{formatCurrency(g.total)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase">Recebido</div>
                    <div className="text-sm font-semibold tabular-nums text-emerald-600">{formatCurrency(g.recebido)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase">Pendente</div>
                    <div className="text-sm font-semibold tabular-nums text-amber-600">{formatCurrency(g.pendente)}</div>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="border-t">
                  <table className="tbl-bf w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Origem</th>
                        <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                        <th className="px-3 py-2 text-center font-semibold">Data Prev.</th>
                        <th className="px-3 py-2 text-right font-semibold">Valor Total</th>
                        <th className="px-3 py-2 text-right font-semibold">Recebido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {g.itens.map(i => {
                        const recebidoI =
                          i.origem === 'medicao' ? Number(i.raw.valor_liberado ?? 0) :
                          i.origem === 'adiantamento' ? Number(i.raw.valor_pago ?? 0) : 0
                        return (
                          <tr key={i.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <StatusBadge status={i.status} />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {i.origem === 'medicao' ? 'Medição' : i.origem === 'adiantamento' ? 'Adiantamento' : 'Capital Giro'}
                            </td>
                            <td className="px-3 py-2 max-w-[300px] truncate" title={i.descricao}>{i.descricao}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{fmtDateBr(i.data_prevista)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(i.valor_total)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                              {recebidoI > 0 ? formatCurrency(recebidoI) : '—'}
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
        })}
        {filtered.length === 0 && (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
            <p className="text-sm text-muted-foreground">Nenhum parceiro encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agenda Recebimentos Tab ──────────────────────────────────────────────────

function AgendaRecebimentosTab({ items }: { items: RecebimentoItem[] }) {
  const [view, setView] = useState<'semana' | 'mes'>('mes')
  const today = new Date()
  const todayISO = today.toISOString().split('T')[0]!

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
      const fmt = (s: string) => { const [y, m, dy] = s.split('-'); return `${dy}/${m}/${y?.slice(2)}` }
      return { days, label: `Semana de ${fmt(days[0]!)} a ${fmt(days[6]!)}` }
    }
    const year = d.getFullYear()
    const month = d.getMonth()
    const lastDay = new Date(year, month + 1, 0).getDate()
    const days: string[] = []
    for (let i = 1; i <= lastDay; i++) {
      days.push(new Date(year, month, i).toISOString().split('T')[0]!)
    }
    return { days, label: today.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) }
  }, [view])

  const byDate = useMemo(() => {
    const map = new Map<string, { previsto: number; recebido: number; items: RecebimentoItem[] }>()
    days.forEach(d => map.set(d, { previsto: 0, recebido: 0, items: [] }))
    for (const item of items) {
      if (days.includes(item.data_prevista)) {
        const slot = map.get(item.data_prevista)!
        slot.items.push(item)
        if (item.status === 'recebido') slot.recebido += item.valor_total
        else slot.previsto += item.valor_total
      }
    }
    return map
  }, [items, days])

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{label}</h3>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <button onClick={() => setView('semana')} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${view === 'semana' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Semana</button>
          <button onClick={() => setView('mes')} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${view === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Mês</button>
        </div>
      </div>

      <div className="overflow-x-auto">
      <div className={`grid gap-2 min-w-[560px] ${view === 'semana' ? 'grid-cols-7' : 'grid-cols-7'}`}>
        {days.map(day => {
          const slot = byDate.get(day)!
          const isToday = day === todayISO
          const dow = new Date(day + 'T12:00:00').getDay()
          const hasData = slot.items.length > 0
          return (
            <div key={day}
              className={`rounded-xl border p-2 text-center transition-colors ${
                isToday ? 'border-primary/60 bg-primary/5' :
                hasData ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' :
                'bg-card'
              }`}
            >
              <div className="text-[9px] font-medium text-muted-foreground">{dayNames[dow]}</div>
              <div className={`text-sm font-bold ${isToday ? 'text-primary' : ''}`}>
                {day.split('-')[2]}
              </div>
              {hasData && (
                <div className="mt-1 space-y-0.5">
                  {slot.previsto > 0 && (
                    <div className="text-[9px] text-amber-600 font-semibold tabular-nums">
                      {formatCurrency(slot.previsto)}
                    </div>
                  )}
                  {slot.recebido > 0 && (
                    <div className="text-[9px] text-emerald-600 font-semibold tabular-nums">
                      ✓ {formatCurrency(slot.recebido)}
                    </div>
                  )}
                  <div className="text-[8px] text-muted-foreground">{slot.items.length} ite{slot.items.length !== 1 ? 'ns' : 'm'}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>

      {/* Legenda */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> A receber</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Recebido</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary inline-block" /> Hoje</span>
      </div>
    </>
  )
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, active, onClick }: {
  icon: typeof Clock; label: string; value: string; color: string
  active?: boolean; onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-card p-3 text-left transition-colors w-full ${
        onClick ? 'cursor-pointer hover:border-primary/40' : 'cursor-default'
      } ${active ? 'border-primary/60 bg-primary/5' : ''}`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </button>
  )
}

function StatusBadge({ status }: { status: RecebimentoItem['status'] }) {
  const cfg = {
    previsto: { label: 'Previsto', cls: 'bg-blue-500/10 text-blue-600', Icon: Clock },
    recebido: { label: 'Recebido', cls: 'bg-emerald-500/10 text-emerald-600', Icon: CheckCircle2 },
    vencido: { label: 'Atrasado', cls: 'bg-red-500/10 text-red-500', Icon: AlertTriangle },
    parcial: { label: 'Parcial', cls: 'bg-amber-500/10 text-amber-600', Icon: Clock },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      <cfg.Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

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
