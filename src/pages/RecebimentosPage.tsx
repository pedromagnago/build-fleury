/**
 * Build Fleury — Gestão de Recebimentos
 *
 * Consolida todas as entradas do sistema:
 *  - Medições (receita do contrato principal)
 *  - Adiantamentos a receber (mútuos categoria='Adiantamento a Receber')
 *  - Entradas bancárias (movimentações tipo=entrada, exclui captações de mútuo)
 *  - Recebimentos avulsos (lançamento manual)
 *
 * Permite registrar nova entrada manual via NovoLancamentoDialog (reuso).
 */
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  TrendingUp, Plus, Search, Calendar, AlertTriangle,
  CheckCircle2, Clock, DollarSign, ArrowDownCircle,
  FileText, Landmark, ExternalLink,
} from 'lucide-react'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'
import { NovoAdiantamentoDialog } from '@/components/financeiro/NovoAdiantamentoDialog'
import { VinculosMovsPanel } from '@/components/conciliacao/VinculosMovsPanel'

type Tab = 'geral' | 'medicoes' | 'adiantamentos'

function fmtDateBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${(y ?? '').slice(2)}`
}

interface RecebimentoItem {
  id: string
  origem: 'medicao' | 'adiantamento' | 'captacao'
  descricao: string
  parceiro: string | null
  valor: number
  data_prevista: string
  data_efetiva: string | null
  status: 'previsto' | 'recebido' | 'vencido' | 'parcial'
  sem_valor?: boolean
  raw: any
}

export default function RecebimentosPage() {
  const { data: medicoes = [] } = useMedicoes()
  const { data: mutuos = [] } = useMutuos()

  const [tab, setTab] = useState<Tab>('geral')
  const [search, setSearch] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [viewingVinculos, setViewingVinculos] = useState<RecebimentoItem | null>(null)

  // Consolidar: medições + captações (Capital de Giro) + adiantamentos a receber
  const todosRecebimentos: RecebimentoItem[] = useMemo(() => {
    const result: RecebimentoItem[] = []
    const today = new Date().toISOString().split('T')[0]!

    // 1) Medições (receita contrato)
    for (const m of medicoes) {
      const recebido = m.status === 'paga' || m.status === 'liberada'
      const atrasado = !recebido && m.data_prevista < today
      const valor = m.status === 'liberada' || m.status === 'paga'
        ? (Number(m.valor_liberado) || Number(m.valor_planejado) || 0)
        : Number(m.valor_planejado) || 0
      result.push({
        id: `med-${m.id}`,
        origem: 'medicao',
        descricao: `Medição nº ${m.numero}`,
        parceiro: 'Cliente (Contrato)',
        valor,
        data_prevista: m.data_prevista,
        data_efetiva: m.data_liberacao,
        status: recebido ? 'recebido' : atrasado ? 'vencido' : 'previsto',
        sem_valor: valor <= 0.01,
        raw: m,
      })
    }

    // 2) Mútuos (Capital de Giro: captações + Adiantamento a Receber)
    for (const mut of mutuos) {
      if (mut.categoria === 'STUB_Dedupe') continue
      const isAdiantamento = mut.categoria === 'Adiantamento a Receber'
      result.push({
        id: `mut-${mut.id}`,
        origem: isAdiantamento ? 'adiantamento' : 'captacao',
        descricao: mut.nome,
        parceiro: (mut as any).fornecedor?.nome ?? '—',
        valor: Number(mut.valor_captado) || 0,
        data_prevista: mut.data_captacao,
        data_efetiva: mut.status === 'quitado' ? mut.data_captacao : null,
        status: mut.status === 'quitado' ? 'recebido' : isAdiantamento ? 'previsto' : 'recebido',
        raw: mut,
      })
    }

    result.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
    return result
  }, [medicoes, mutuos])

  const filtrados = useMemo(() => {
    let arr = todosRecebimentos
    if (tab === 'medicoes') arr = arr.filter(r => r.origem === 'medicao')
    else if (tab === 'adiantamentos') arr = arr.filter(r => r.origem === 'adiantamento')
    const q = search.toLowerCase().trim()
    if (q) {
      arr = arr.filter(r =>
        r.descricao.toLowerCase().includes(q) ||
        (r.parceiro ?? '').toLowerCase().includes(q) ||
        String(r.valor).includes(q)
      )
    }
    return arr
  }, [todosRecebimentos, tab, search])

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]!
    const em30 = new Date(); em30.setDate(em30.getDate() + 30)
    const em30Str = em30.toISOString().split('T')[0]!

    let totalReceber = 0, recebidoMes = 0, atrasado = 0, prox30 = 0, totalGeral = 0
    const inicioMes = today.substring(0, 7) + '-01'

    for (const r of todosRecebimentos) {
      totalGeral += r.valor
      if (r.status === 'previsto' || r.status === 'parcial') {
        totalReceber += r.valor
        if (r.data_prevista >= today && r.data_prevista <= em30Str) prox30 += r.valor
      }
      if (r.status === 'vencido') { totalReceber += r.valor; atrasado += r.valor }
      if (r.status === 'recebido' && r.data_efetiva && r.data_efetiva >= inicioMes) {
        recebidoMes += r.valor
      }
    }
    return { totalReceber, recebidoMes, atrasado, prox30, totalGeral, count: todosRecebimentos.length }
  }, [todosRecebimentos])

  const counts = useMemo(() => ({
    geral: todosRecebimentos.length,
    medicoes: todosRecebimentos.filter(r => r.origem === 'medicao').length,
    adiantamentos: todosRecebimentos.filter(r => r.origem === 'adiantamento').length,
  }), [todosRecebimentos])

  const TABS: Array<{ key: Tab; label: string; icon: typeof Clock }> = [
    { key: 'geral', label: 'Todas', icon: DollarSign },
    { key: 'medicoes', label: 'Medições', icon: FileText },
    { key: 'adiantamentos', label: 'Adiantamentos', icon: Landmark },
  ]

  return (
    <div>
      <PageHeader
        title="Recebimentos"
        description="Medições, adiantamentos e entradas bancárias"
        icon={TrendingUp}
      />

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={Clock} label="A Receber" value={formatCurrency(kpis.totalReceber)} color="text-amber-600" />
        <KpiCard icon={CheckCircle2} label="Recebido no Mês" value={formatCurrency(kpis.recebidoMes)} color="text-emerald-600" />
        <KpiCard icon={AlertTriangle} label="Em Atraso" value={formatCurrency(kpis.atrasado)} color="text-red-500" />
        <KpiCard icon={Calendar} label="Próximos 30 dias" value={formatCurrency(kpis.prox30)} color="text-blue-600" />
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
            <span className={`rounded-full px-1.5 text-[9px] font-bold ${
              tab === t.key ? 'bg-primary-foreground/20' : 'bg-muted'
            }`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Search + ações */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição, parceiro ou valor..."
            className="w-full rounded-lg border bg-background pl-10 pr-3 py-2 text-sm" />
        </div>
        <button onClick={() => setShowNovo(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" />Novo Adiantamento
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm">Nenhum recebimento encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? 'Ajuste os filtros' : 'Clique em "Novo Recebimento" para lançar uma entrada'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Status</th>
                  <th className="px-3 py-2 text-left font-bold">Origem</th>
                  <th className="px-3 py-2 text-left font-bold">Descrição</th>
                  <th className="px-3 py-2 text-left font-bold">Parceiro</th>
                  <th className="px-3 py-2 text-left font-bold">Data Prev.</th>
                  <th className="px-3 py-2 text-left font-bold">Data Real</th>
                  <th className="px-3 py-2 text-right font-bold">Valor</th>
                  <th className="px-3 py-2 text-center font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map(r => <RecebimentoRow key={r.id} item={r} onShowVinculos={() => setViewingVinculos(r)} />)}
              </tbody>
              <tfoot className="bg-muted/30 font-bold">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-right">TOTAL FILTRADO</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                    {formatCurrency(filtrados.reduce((s, r) => s + r.valor, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Links */}
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

      {/* Novo adiantamento */}
      {showNovo && (
        <NovoAdiantamentoDialog onClose={() => setShowNovo(false)} />
      )}

      {/* Visão reversa: movs vinculados ao recebimento */}
      {viewingVinculos && (
        <VinculosMovsPanel
          origem={viewingVinculos.origem === 'medicao' ? 'medicao' : 'mutuo_parcela'}
          origemId={viewingVinculos.raw.id}
          titulo={viewingVinculos.descricao}
          subtitulo={`${viewingVinculos.parceiro ?? ''} · Previsto ${viewingVinculos.data_prevista}`}
          valor={viewingVinculos.valor}
          valorPago={viewingVinculos.raw.valor_liberado ?? viewingVinculos.raw.valor_pago ?? 0}
          onClose={() => setViewingVinculos(null)}
        />
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color }: {
  icon: typeof Clock; label: string; value: string; color: string
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function RecebimentoRow({ item, onShowVinculos }: { item: RecebimentoItem; onShowVinculos: () => void }) {
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

  const linkTo = item.origem === 'medicao' ? '/cronograma' : '/mutuos'

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCfg.cls}`}>
          <statusCfg.Icon className="h-3 w-3" />{statusCfg.label}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${origemCfg.cls}`}>
          {origemCfg.label}
        </span>
      </td>
      <td className="px-3 py-2 max-w-[280px] truncate" title={item.descricao}>{item.descricao}</td>
      <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate" title={item.parceiro ?? ''}>
        {item.parceiro ?? '—'}
      </td>
      <td className="px-3 py-2 tabular-nums">{fmtDateBr(item.data_prevista)}</td>
      <td className="px-3 py-2 tabular-nums">{fmtDateBr(item.data_efetiva)}</td>
      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
        {item.sem_valor ? (
          <span className="text-muted-foreground text-[11px] italic">sem valor</span>
        ) : (
          <span className="text-emerald-600">{formatCurrency(item.valor)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <div className="inline-flex items-center gap-2">
          <button onClick={onShowVinculos} className="text-muted-foreground hover:text-primary" title="Ver movs vinculados">
            🔗
          </button>
          <Link to={linkTo} className="text-muted-foreground hover:text-primary" title="Ver origem">
            <ExternalLink className="h-3.5 w-3.5 inline" />
          </Link>
        </div>
      </td>
    </tr>
  )
}
