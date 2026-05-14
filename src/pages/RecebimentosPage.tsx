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
  FileText, Landmark, ExternalLink, CircleDollarSign,
} from 'lucide-react'
import { useMedicoes } from '@/hooks/useOperacional'
import { useMutuos } from '@/hooks/useMutuos'
import { formatCurrency } from '@/lib/utils'
import { NovoAdiantamentoDialog } from '@/components/financeiro/NovoAdiantamentoDialog'
import { NovoLancamentoDialog } from '@/components/conciliacao/NovoLancamentoDialog'
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
  const [baixando, setBaixando] = useState<RecebimentoItem | null>(null)

  // Consolidar: medições + captações (Capital de Giro) + adiantamentos a receber
  const todosRecebimentos: RecebimentoItem[] = useMemo(() => {
    const result: RecebimentoItem[] = []
    const today = new Date().toISOString().split('T')[0]!

    // 1) Medições (receita contrato)
    for (const m of medicoes) {
      const total = Number(m.valor_planejado) || 0
      const recebidoSofar = Number(m.valor_liberado) || 0
      const saldo = total - recebidoSofar
      const recebidoFull = m.status === 'paga' || (total > 0 && saldo <= 0.01 && recebidoSofar > 0)
      const parcial = !recebidoFull && recebidoSofar > 0.01 && saldo > 0.01
      const atrasado = !recebidoFull && !parcial && m.data_prevista < today
      // Em parcial mostramos o SALDO RESTANTE (não o total nem o já recebido)
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
        data_prevista: m.data_prevista,
        data_efetiva: m.data_liberacao,
        status: recebidoFull ? 'recebido' : parcial ? 'parcial' : atrasado ? 'vencido' : 'previsto',
        sem_valor: valor <= 0.01,
        raw: m,
      })
    }

    // 2) Mútuos: distinguir por categoria/direção
    // - Captação genuína (entrada): valor_captado já é a entrada planejada/realizada → vai pra Recebimentos.
    // - Adiantamento Feito (saída): valor_captado representa $ que SAIU. NÃO mostra como recebimento;
    //   o que SIM é recebimento são as parcelas (devolução esperada do terceiro).
    // - Adiantamento Recebido (entrada via captação manual): valor_captado é entrada.
    for (const mut of mutuos) {
      if (mut.categoria === 'STUB_Dedupe') continue
      const cat = String(mut.categoria ?? '').toLowerCase()
      const isAdiantamentoFeito = cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')

      if (isAdiantamentoFeito) {
        // Parcelas de devolução = recebimentos esperados (entrada futura)
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
            data_prevista: mp.data_vencimento,
            data_efetiva: fullPaga ? mp.data_pagamento_real : null,
            status: fullPaga ? 'recebido' : parcialMp ? 'parcial' : 'previsto',
            sem_valor: valor <= 0.01,
            raw: { ...mp, _mutuoNome: mut.nome },
          })
        }
        // valor_captado do adiantamento NÃO é recebimento — é a saída original (já entra em Pagamentos/Fluxo)
        continue
      }

      // Captação ou Adiantamento Recebido = entrada de dinheiro no projeto
      const totalMut = Number(mut.valor_captado) || 0
      const conciliadoMut = Number((mut as any).valor_conciliado_entrada || 0) + Number((mut as any).valor_conciliado_saida || 0)
      const saldoMut = Math.max(0, totalMut - conciliadoMut)
      const quitado = mut.status === 'quitado' || (totalMut > 0 && saldoMut <= 0.01 && conciliadoMut > 0)
      const parcialMut = !quitado && conciliadoMut > 0.01 && saldoMut > 0.01
      const valorMut = quitado ? totalMut : parcialMut ? saldoMut : totalMut
      const descricaoMut = mut.nome + (parcialMut ? ` (parcial: ${formatCurrency(conciliadoMut)} de ${formatCurrency(totalMut)})` : '')
      result.push({
        id: `mut-${mut.id}`,
        origem: 'captacao',
        descricao: descricaoMut,
        parceiro: (mut as any).fornecedor?.nome ?? '—',
        valor: valorMut,
        data_prevista: mut.data_captacao,
        data_efetiva: quitado ? mut.data_captacao : null,
        status: quitado ? 'recebido' : parcialMut ? 'parcial' : 'previsto',
        sem_valor: valorMut <= 0.01,
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
            <table className="tbl-bf w-full text-xs">
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
                {filtrados.map(r => (
                  <RecebimentoRow
                    key={r.id}
                    item={r}
                    onShowVinculos={() => setViewingVinculos(r)}
                    onBaixar={r.status !== 'recebido' && !r.sem_valor ? () => setBaixando(r) : undefined}
                  />
                ))}
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

      {/* Baixar recebimento: abre dialog de lançamento manual pré-preenchido conforme origem */}
      {baixando && (() => {
        const raw = baixando.raw as any
        let vinculo: { tipo: 'medicao' | 'mutuo_parcela' | 'mutuo'; id: string; label: string; sublabel: string; valor: number } | null = null
        let descricao = baixando.descricao
        let saldo = baixando.valor

        if (baixando.origem === 'medicao') {
          saldo = Math.max(0, Number(raw.valor_planejado) - Number(raw.valor_liberado))
          const sugerido = saldo > 0.01 ? saldo : Number(raw.valor_planejado)
          descricao = `Recebimento Medição nº ${raw.numero}`
          vinculo = {
            tipo: 'medicao',
            id: raw.id,
            label: `Medição nº ${raw.numero}`,
            sublabel: `Contrato · saldo ${formatCurrency(saldo)}`,
            valor: sugerido,
          }
          saldo = sugerido
        } else if (baixando.origem === 'adiantamento') {
          // raw = mutuo_parcela (com _mutuoNome injetado)
          const valorTotal = Number(raw.valor) || 0
          const pago = Number(raw.valor_pago || 0)
          const restante = Math.max(0, valorTotal - pago)
          const sugerido = restante > 0.01 ? restante : valorTotal
          descricao = `Devolução ${raw._mutuoNome ?? 'adiantamento'} · P${raw.numero_parcela ?? ''}`
          vinculo = {
            tipo: 'mutuo_parcela',
            id: raw.id,
            label: descricao,
            sublabel: `Parcela mútuo · Venc ${raw.data_vencimento} · saldo ${formatCurrency(restante)}`,
            valor: sugerido,
          }
          saldo = sugerido
        } else if (baixando.origem === 'captacao') {
          // raw = mutuo
          const valorTotal = Number(raw.valor_captado) || 0
          const jaConc = Number(raw.valor_conciliado_entrada || 0) + Number(raw.valor_conciliado_saida || 0)
          const restante = Math.max(0, valorTotal - jaConc)
          const sugerido = restante > 0.01 ? restante : valorTotal
          descricao = `Captação: ${raw.nome}`
          vinculo = {
            tipo: 'mutuo',
            id: raw.id,
            label: raw.nome,
            sublabel: `Mútuo · ${raw.data_captacao} · saldo ${formatCurrency(restante)}`,
            valor: sugerido,
          }
          saldo = sugerido
        }

        return (
          <NovoLancamentoDialog
            defaultTipo="entrada"
            defaultDescricao={descricao}
            defaultValor={saldo.toFixed(2).replace('.', ',')}
            defaultVinculo={vinculo}
            onClose={() => setBaixando(null)}
          />
        )
      })()}

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

function RecebimentoRow({ item, onShowVinculos, onBaixar }: { item: RecebimentoItem; onShowVinculos: () => void; onBaixar?: () => void }) {
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
          {onBaixar && (
            <button
              onClick={onBaixar}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-500/20"
              title="Registrar recebimento (parcial ou total) e conciliar"
            >
              <CircleDollarSign className="h-3 w-3" />Baixar
            </button>
          )}
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
