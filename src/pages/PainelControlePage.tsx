/**
 * PainelControlePage — Auditoria consolidada dos números da obra
 *
 * 3 camadas:
 *   1. KPI cards macro (Orçado / Pedidos / Pago / Medições / Conciliado / Gap)
 *   2. Breakdown por tipo de custo (Diretos / Indiretos / Capital) × visão por casa
 *   3. Drill-down por etapa (diretos) ou categoria (indiretos) ou mútuo (capital)
 *
 * + Seção de conciliação × pagamentos.
 */

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { InconsistenciasTable } from '@/components/financeiro/InconsistenciasTable'
import { AuditoriaContabilCard } from '@/components/financeiro/AuditoriaContabilCard'
import {
  Gauge, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  Package, CreditCard, Wallet, FileCheck2, Landmark, AlertTriangle,
  CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useMedicoes, useMovimentacoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency } from '@/lib/utils'
import { useHealthChecks } from '@/hooks/useHealthChecks'
import { useCashFlowEvents } from '@/hooks/useCashFlowEvents'
import { GapInspectorDrawer, type GapOrigin } from '@/components/painel/GapInspectorDrawer'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(value: number, total: number): string {
  if (!total || total === 0) return '—'
  return `${((value / total) * 100).toFixed(1)}%`
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, subLabel, subValue, tone = 'default', warning,
}: {
  icon: typeof Gauge
  label: string
  value: string
  subLabel?: string
  subValue?: string
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'primary'
  warning?: boolean
}) {
  const toneClass = {
    default: 'border-border',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    danger:  'border-red-500/30 bg-red-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    primary: 'border-primary/30 bg-primary/5',
  }[tone]
  const iconTone = {
    default: 'text-muted-foreground',
    success: 'text-emerald-600',
    danger:  'text-red-600',
    warning: 'text-amber-600',
    primary: 'text-primary',
  }[tone]
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {value}
          </div>
          {subLabel && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {subLabel} <span className="font-semibold tabular-nums">{subValue}</span>
            </div>
          )}
        </div>
        <div className={`rounded-lg p-2 ${iconTone}`}>
          <Icon className="h-5 w-5" />
          {warning && <AlertTriangle className="h-3 w-3 text-amber-600 -mt-1 ml-3" />}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PainelControlePage() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: parcelas = [] } = useParcelas()
  const { despesas = [] } = useDespesasIndiretas()
  const { data: mutuos = [] } = useMutuos()
  const { data: medicoes = [] } = useMedicoes()
  const { data: movimentacoes = [] } = useMovimentacoes()
  const { data: etapas = [] } = useEtapas()
  // Totais exatos por categoria do FC — fonte de verdade para a grade de integridade.
  // Usa os mesmos eventos que SimuladorPanel/CashFlowChart exibem (viewMode 'completo').
  const { events: fcEvents } = useCashFlowEvents('completo')
  const fcTotals = useMemo(() => {
    const t = { medicoes: 0, capitalMutuo: 0, pedidosObra: 0, despesasIndiretas: 0, mutuoDevolucoes: 0 }
    for (const ev of fcEvents) {
      const origem = ev.meta?.origem
      const cat = ev.meta?.cat ?? ''
      const etapa = ev.meta?.etapa ?? ''
      if ((origem as string) === 'transferencia' || cat === 'Transferência Interna') continue
      // Exclui 'bruto' (estimativas de itens sem pedido) — o FC exibe bruto separado de firme.
      // A grade de integridade compara com o que está FIRME no FC (pedidos/parcelas/banco).
      if (ev.type === 'bruto') continue
      if (ev.type === 'entrada') {
        if (origem === 'medicao') t.medicoes += ev.valor
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) t.capitalMutuo += ev.valor
      } else {
        if (origem === 'despesa') t.despesasIndiretas += ev.valor
        else if (origem === 'mutuo' || etapa === 'Capital' || cat.toLowerCase().includes('mútuo')) t.mutuoDevolucoes += ev.valor
        else if (cat !== 'Banco') t.pedidosObra += ev.valor
      }
    }
    return t
  }, [fcEvents])

  const { checks } = useHealthChecks()
  const checkEntradasSV = checks.find(c => c.id === 'entradas-sem-vinculo')
  const checkSaidasSV = checks.find(c => c.id === 'saidas-sem-vinculo')
  const checkGapMed = checks.find(c => c.id === 'gap-wbs-medicoes')

  const [inspectOrigin, setInspectOrigin] = useState<GapOrigin | null>(null)
  const [expandedSection, setExpandedSection] = useState<'diretos' | 'indiretos' | 'capital' | null>('diretos')
  const [showMacro, setShowMacro] = useState(false)
  const qtdCasas = currentCompany?.qtd_casas ?? 1

  // ─── Agregações ────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    // Diretos
    const orcadoDiretos = itens.reduce((s, i) => s + (Number(i.valor_total_orcado) || 0), 0)
    const pedidosTotal = pedidos.reduce((s, p) => s + (Number(p.valor_total_real) || 0), 0)
    const previstoDiretosParcelas = parcelas
      .filter(p => p.pedido_id != null)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoDiretos = parcelas
      .filter(p => p.pedido_id != null)
      .reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)

    // Indiretos
    const orcadoIndiretos = despesas.reduce((s: number, d: any) => s + (Number(d.valor_orcado) || 0), 0)
    const previstoIndiretosParcelas = parcelas
      .filter(p => p.despesa_indireta_id != null)
      .reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0)
    const pagoIndiretos = parcelas
      .filter(p => p.despesa_indireta_id != null)
      .reduce((s: number, p: any) => s + (Number(p.valor_pago) || 0), 0)

    // Capital de giro — operação financeira, NÃO é custo do projeto.
    // Só os JUROS (diferença entre o total contratado em parcelas e o valor captado)
    // representam custo real. O pagamento do principal é apenas devolução de capital.
    const capitalCaptado = mutuos.reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const capitalPagoTotal = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor_pago) || 0), 0), 0)
    const capitalContratadoParcelas = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).reduce((ss, mp) => ss + (Number(mp.valor) || 0), 0), 0)
    // Juros total projetado = soma das parcelas contratadas − valor captado
    const custoFinanceiroProjetado = Math.max(0, capitalContratadoParcelas - capitalCaptado)
    // Juros pago até hoje = amortização acima do principal proporcional pago
    // Aproximação: se capitalPagoTotal > capitalCaptado, excesso = juros pago.
    // Durante a amortização, estima proporcional a valor_pago / valor_parcelas_total × juros_total.
    const ratioPago = capitalContratadoParcelas > 0
      ? capitalPagoTotal / capitalContratadoParcelas
      : 0
    const custoFinanceiroRealizado = custoFinanceiroProjetado * ratioPago
    const capitalSaldoDevedor = Math.max(0, capitalContratadoParcelas - capitalPagoTotal)

    // Medições
    const medicoesLiberadas = medicoes.reduce((s, m) =>
      s + (Number(m.valor_liberado) || 0), 0)
    const medicoesPlanejadas = medicoes.reduce((s, m) =>
      s + (Number(m.valor_planejado) || 0), 0)

    // Conciliação bancária
    const movSaidas = movimentacoes
      .filter(m => m.tipo === 'saida')
      .reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0)
    const conciliado = movimentacoes
      .filter(m => m.conciliado)
      .reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0)

    // Totais do CUSTO OPERACIONAL do projeto (sem capital de giro)
    const orcadoOperacional = orcadoDiretos + orcadoIndiretos
    const pagoOperacional = pagoDiretos + pagoIndiretos

    // Custo total do projeto = operacional + juros (custo financeiro)
    const orcadoComFinanceiro = orcadoOperacional + custoFinanceiroProjetado
    const pagoComFinanceiro = pagoOperacional + custoFinanceiroRealizado

    // ─── CONCILIAÇÃO 3 FONTES × PAGAMENTOS ───
    // Decomposição do TOTAL DAS PARCELAS (= o que aparece em /pagamentos):
    //   parcelas (pedido) + parcelas (despesa) + parcelas (órfãs) + mutuo_parcelas
    const previstoOrfas = parcelas
      .filter(p => !p.pedido_id && !p.despesa_indireta_id)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pagoOrfas = parcelas
      .filter(p => !p.pedido_id && !p.despesa_indireta_id)
      .reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)

    // Total real das parcelas no sistema (= card TOTAL de /pagamentos)
    const totalParcelasGeradas = previstoDiretosParcelas + previstoIndiretosParcelas
      + previstoOrfas + capitalContratadoParcelas

    // Lado "fontes": pedidos.valor_total_real + despesas.valor_orcado + capital.contratado.
    // Idealmente bate com Σ parcelas, mas pode haver descasamento (pedido sem cond, etc.)
    const previstoPedidos = pedidosTotal                     // pedidos.valor_total_real
    const previstoIndiretos = previstoIndiretosParcelas      // Σ parcelas com despesa_indireta_id
    const previstoCapital = capitalContratadoParcelas        // Σ mutuo_parcelas.valor
    const previstoTotalFontes = previstoPedidos + previstoIndiretos + previstoCapital + previstoOrfas
    const gapPrevisto = previstoTotalFontes - totalParcelasGeradas

    // REAL: o que foi pago (lado das fontes) deve bater com saídas conciliadas no banco
    const pagoTotal = pagoDiretos + pagoIndiretos + capitalPagoTotal + pagoOrfas
    const gap = pagoTotal - conciliado

    // ─── GRADE DE INTEGRIDADE POR ORIGEM ───────────────────────────────────────
    // Para cada origem, calcula quanto está registrado na tela-fonte e quanto
    // efetivamente tem representação no fluxo de caixa (via parcela/data/evento).
    // Gap > 0 = itens na tela que o FC não conhece.

    // Medições: sem data_prevista → invisíveis ao FC (seção 1 filtra !data_prevista)
    const medicoesComData = medicoes
      .filter(m => !!m.data_prevista)
      .reduce((s, m) => s + (Number(m.valor_planejado) || 0), 0)
    const medicoesGap = medicoesPlanejadas - medicoesComData

    // Pedidos: sem parcela → aparecem no FC via seção 5 (simplificado, sem data precisa)
    const pedidosSemParcela = Math.max(0, pedidosTotal - previstoDiretosParcelas)

    // Custos indiretos: despesas sem parcela → INVISÍVEIS ao FC (não há seção equivalente à seção 5)
    const despesasGap = Math.max(0, orcadoIndiretos - previstoIndiretos)

    // Capital de giro — captação: sem data_captacao → invisível ao FC
    const mutuosCaptacaoComData = mutuos
      .filter(m => !!m.data_captacao && String(m.categoria ?? '').toUpperCase() !== 'STUB_DEDUPE')
      .reduce((s, m) => s + (Number(m.valor_captado) || 0), 0)
    const mutuosCaptacaoGap = Math.max(0, capitalCaptado - mutuosCaptacaoComData)

    // Devoluções: parcelas de mútuo sem data_vencimento → invisíveis ao FC
    const mutuosDevolucoesComData = mutuos.reduce((s, m) =>
      s + (m.parcelas ?? []).filter((p: any) => !!p.data_vencimento).reduce((ss: number, p: any) => ss + (Number(p.valor) || 0), 0), 0)
    const mutuosDevolucoesGap = Math.max(0, capitalContratadoParcelas - mutuosDevolucoesComData)

    return {
      orcadoDiretos, orcadoIndiretos,
      orcadoOperacional, orcadoComFinanceiro,
      pedidosTotal,
      pagoDiretos, pagoIndiretos,
      pagoOperacional, pagoComFinanceiro,
      capitalCaptado, capitalPagoTotal, capitalContratadoParcelas, capitalSaldoDevedor,
      custoFinanceiroProjetado, custoFinanceiroRealizado,
      medicoesLiberadas, medicoesPlanejadas,
      movSaidas, conciliado, gap,
      // Novos campos da conciliação 3 fontes
      previstoPedidos, previstoIndiretos, previstoCapital, previstoOrfas,
      previstoTotalFontes, totalParcelasGeradas, gapPrevisto,
      pagoOrfas, pagoTotal,
      // Grade de integridade
      medicoesComData, medicoesGap,
      pedidosSemParcela, previstoDiretosParcelas,
      despesasGap,
      mutuosCaptacaoComData, mutuosCaptacaoGap,
      mutuosDevolucoesComData, mutuosDevolucoesGap,
    }
  }, [itens, pedidos, parcelas, despesas, mutuos, medicoes, movimentacoes])

  // Drill-down: diretos por etapa
  const diretosPorEtapa = useMemo(() => {
    const map = new Map<string, { etapa_nome: string; etapa_ordem: number; orcado: number; pedidos: number; pago: number; itensCount: number }>()
    const parcPorPedido = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      parcPorPedido.set(p.pedido_id, (parcPorPedido.get(p.pedido_id) ?? 0) + (Number(p.valor_pago) || 0))
    }
    const pedidosPorItem = new Map<string, { total: number; pago: number }>()
    for (const ped of pedidos) {
      const curr = pedidosPorItem.get(ped.item_compra_id) ?? { total: 0, pago: 0 }
      curr.total += Number(ped.valor_total_real) || 0
      curr.pago += parcPorPedido.get(ped.id) ?? 0
      pedidosPorItem.set(ped.item_compra_id, curr)
    }
    for (const item of itens) {
      const etapaId = item.etapa_id
      const etapa = etapas.find(e => e.id === etapaId)
      const row = map.get(etapaId) ?? {
        etapa_nome: etapa?.nome ?? item.etapa_nome ?? '—',
        etapa_ordem: etapa?.ordem ?? 999,
        orcado: 0, pedidos: 0, pago: 0, itensCount: 0,
      }
      row.orcado += Number(item.valor_total_orcado) || 0
      const ped = pedidosPorItem.get(item.id) ?? { total: 0, pago: 0 }
      row.pedidos += ped.total
      row.pago += ped.pago
      row.itensCount += 1
      map.set(etapaId, row)
    }
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => a.etapa_ordem - b.etapa_ordem)
  }, [itens, pedidos, parcelas, etapas])

  // Drill-down: indiretos por categoria
  const indiretosPorCategoria = useMemo(() => {
    const map = new Map<string, { categoria: string; orcado: number; pago: number; itens: number }>()
    const parcPorDespesa = new Map<string, number>()
    for (const p of parcelas) {
      if (!p.despesa_indireta_id) continue
      parcPorDespesa.set(p.despesa_indireta_id, (parcPorDespesa.get(p.despesa_indireta_id) ?? 0) + (Number(p.valor_pago) || 0))
    }
    for (const d of despesas) {
      const cat = d.categoria || '—'
      const row = map.get(cat) ?? { categoria: cat, orcado: 0, pago: 0, itens: 0 }
      row.orcado += Number(d.valor_orcado) || 0
      row.pago += parcPorDespesa.get(d.id) ?? 0
      row.itens += 1
      map.set(cat, row)
    }
    return Array.from(map.values()).sort((a, b) => b.orcado - a.orcado)
  }, [despesas, parcelas])

  // Drill-down: capital por mútuo
  const capitalPorMutuo = useMemo(() => {
    return mutuos.map(m => {
      const pago = (m.parcelas ?? []).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0)
      return {
        id: m.id,
        nome: m.nome,
        tipo: m.tipo,
        valor_captado: Number(m.valor_captado) || 0,
        pago,
        saldo: (Number(m.valor_captado) || 0) - pago,
        instituicao: m.instituicao,
        status: m.status,
      }
    }).sort((a, b) => b.valor_captado - a.valor_captado)
  }, [mutuos])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Controle"
        description={`Auditoria consolidada · ${qtdCasas} casa(s)`}
        icon={Gauge}
      />

      {/* ─── GRADE DE INTEGRIDADE POR ORIGEM ─── */}
      <OrigemIntegridadeGrid
        onInspect={setInspectOrigin}
        rows={[
          {
            label: 'Medições',
            sublabel: 'entradas do contrato',
            dot: 'bg-purple-500',
            route: '/recebimentos',
            inspectKey: 'medicoes',
            registrado: agg.medicoesPlanejadas,
            noFC: agg.medicoesComData,
            gap: agg.medicoesGap,
            gapNote: agg.medicoesGap > 0 ? 'sem data prevista → invisíveis ao FC' : undefined,
            severity: agg.medicoesGap > 0.5 ? 'gap' : 'ok',
          },
          {
            label: 'Pedidos de Obra',
            sublabel: 'saídas diretas',
            dot: 'bg-blue-500',
            route: '/compras',
            inspectKey: 'pedidos',
            registrado: agg.pedidosTotal,
            noFC: fcTotals.pedidosObra,
            gap: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra),
            gapNote: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5
              ? (fcTotals.pedidosObra > agg.pedidosTotal
                  ? 'FC inclui overrun/parcelas avulsas além do valor_total_real — ver Eq A → pedido-excesso'
                  : 'parcelas cobrem menos que o valor contratado — ver Eq A → pedidos-parcial')
              : undefined,
            severity: Math.abs(agg.pedidosTotal - fcTotals.pedidosObra) > 0.5 ? 'warn' : 'ok',
          },
          {
            label: 'Custos Indiretos',
            sublabel: 'saídas indiretas',
            dot: 'bg-rose-500',
            route: '/custos-indiretos',
            inspectKey: 'indiretos',
            registrado: agg.orcadoIndiretos,
            noFC: fcTotals.despesasIndiretas,
            gap: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas),
            gapNote: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas) > 0.5
              ? (fcTotals.despesasIndiretas > agg.orcadoIndiretos
                  ? 'banco pagou acima do orçado (verificar parcelas de despesa)'
                  : 'sem parcela gerada → AUSENTES do FC')
              : undefined,
            severity: Math.abs(agg.orcadoIndiretos - fcTotals.despesasIndiretas) > 0.5 ? 'warn' : 'ok',
          },
          {
            label: 'Capital de Giro',
            sublabel: 'captações (entradas)',
            dot: 'bg-indigo-500',
            route: '/mutuos',
            inspectKey: 'capital',
            registrado: agg.capitalCaptado,
            noFC: fcTotals.capitalMutuo,
            gap: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo),
            gapNote: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5
              ? (fcTotals.capitalMutuo > agg.capitalCaptado
                  ? 'banco creditou acima do valor_captado planejado'
                  : 'banco creditou abaixo do planejado ou sem data de captação')
              : undefined,
            severity: Math.abs(agg.capitalCaptado - fcTotals.capitalMutuo) > 0.5 ? 'warn' : 'ok',
          },
          {
            label: 'Devoluções de Mútuo',
            sublabel: 'saídas financeiras',
            dot: 'bg-amber-500',
            route: '/mutuos',
            inspectKey: 'devolucoes',
            registrado: agg.capitalContratadoParcelas,
            noFC: fcTotals.mutuoDevolucoes,
            gap: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes),
            gapNote: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5
              ? (fcTotals.mutuoDevolucoes > agg.capitalContratadoParcelas
                  ? 'banco pagou acima do planejado (juros / correção monetária)'
                  : 'sem data de vencimento → invisíveis ao FC')
              : undefined,
            severity: Math.abs(agg.capitalContratadoParcelas - fcTotals.mutuoDevolucoes) > 0.5 ? 'warn' : 'ok',
          },
        ]}
      />

      {/* ─── CAMADA 0: AUDITORIA CONTÁBIL (3 equações que devem fechar) ─── */}
      <AuditoriaContabilCard onOrfasClick={() => setInspectOrigin('orfas')} />

      {/* ─── CAMADA 0.5: RASTREABILIDADE BANCÁRIA ─── */}
      {(() => {
        const checks_rv = [checkEntradasSV, checkSaidasSV, checkGapMed].filter(Boolean)
        const temProblema = checks_rv.some(c => c!.severity !== 'ok')
        if (!temProblema) return null
        return (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-800 dark:text-amber-400">Rastreabilidade Bancária</h2>
              <span className="text-xs text-amber-600">— movimentos sem vínculo bloqueiam o fechamento financeiro</span>
            </div>
            {checks_rv.map(check => {
              if (!check || check.severity === 'ok') return null
              const isCritical = check.severity === 'critical'
              return (
                <div key={check.id} className={`rounded-lg border p-3 ${isCritical ? 'border-red-300 bg-red-50/50 dark:bg-red-950/10' : 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/10'}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-2 w-2 rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <span className="text-sm font-semibold">{check.title}</span>
                      <span className="text-xs text-muted-foreground">{check.summary}</span>
                    </div>
                    {check.route && (
                      <a href={check.route} className={`text-xs font-semibold px-3 py-1 rounded-lg ${isCritical ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-500 text-white hover:bg-amber-600'} transition-colors`}>
                        {check.routeLabel}
                      </a>
                    )}
                  </div>
                  {check.items.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-auto">
                      {check.items.slice(0, 15).map((item, i) => (
                        <div key={item.id || i} className="flex items-start justify-between gap-2 text-xs py-0.5 border-t border-muted/30 first:border-0">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{item.label}</span>
                            <span className="text-muted-foreground truncate block">{item.description}</span>
                          </div>
                          {item.value != null && (
                            <span className={`tabular-nums font-semibold shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-700'}`}>
                              {formatCurrency(item.value)}
                            </span>
                          )}
                        </div>
                      ))}
                      {check.items.length > 15 && (
                        <p className="text-xs text-muted-foreground pt-1">+{check.items.length - 15} item(s) — veja em {check.routeLabel}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ─── CAMADA 1: INCONSISTÊNCIAS DETECTADAS (foco operacional) ─── */}
      <InconsistenciasTable />

      {/* ─── CAMADA 1: KPI CARDS (contexto macro, recolhível) ─── */}
      <div className="-mb-2">
        <button
          onClick={() => setShowMacro(s => !s)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          {showMacro ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Auditoria macro {showMacro ? '(esconder)' : '(mostrar contexto agregado)'}
        </button>
      </div>

      {showMacro && (
      <div className="space-y-6">
      <div>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            icon={Wallet}
            label="Orçado Operacional"
            value={formatCurrency(agg.orcadoOperacional)}
            subLabel={`R$/casa`}
            subValue={formatCurrency(agg.orcadoOperacional / qtdCasas)}
            tone="primary"
          />
          <KpiCard
            icon={Package}
            label="Pedidos"
            value={formatCurrency(agg.pedidosTotal)}
            subLabel="% orç. diretos"
            subValue={pct(agg.pedidosTotal, agg.orcadoDiretos)}
          />
          <KpiCard
            icon={CreditCard}
            label="Pago Operacional"
            value={formatCurrency(agg.pagoOperacional)}
            subLabel="% orç. operacional"
            subValue={pct(agg.pagoOperacional, agg.orcadoOperacional)}
            tone="success"
          />
          <KpiCard
            icon={Landmark}
            label="Custo Financeiro"
            value={formatCurrency(agg.custoFinanceiroProjetado)}
            subLabel="juros pago (prop.)"
            subValue={formatCurrency(agg.custoFinanceiroRealizado)}
            tone="warning"
          />
          <KpiCard
            icon={FileCheck2}
            label="Medições Lib."
            value={formatCurrency(agg.medicoesLiberadas)}
            subLabel={`planejado`}
            subValue={formatCurrency(agg.medicoesPlanejadas)}
          />
          <KpiCard
            icon={agg.gap > 0 ? TrendingUp : TrendingDown}
            label="Gap Pago↔Banco"
            value={formatCurrency(agg.gap)}
            subLabel={agg.gap === 0 ? 'OK — conciliado' : 'divergência'}
            tone={Math.abs(agg.gap) > 1 ? 'danger' : 'success'}
            warning={Math.abs(agg.gap) > 1}
          />
        </div>
      </div>

      {/* ─── CAMADA 2: BREAKDOWN POR TIPO DE CUSTO ─── */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Breakdown por tipo de custo
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="tbl-bf w-full text-sm">
            <thead className="bg-muted/80">
              <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Orçado</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">% Pago</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">/ casa</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {/* Diretos */}
              <BreakdownRow
                label="🔧 Diretos (itens × etapas)"
                orcado={agg.orcadoDiretos}
                pedidos={agg.pedidosTotal}
                pago={agg.pagoDiretos}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'diretos'}
                onToggle={() => setExpandedSection(s => s === 'diretos' ? null : 'diretos')}
              />
              {expandedSection === 'diretos' && (
                <DrilldownDiretos data={diretosPorEtapa} qtdCasas={qtdCasas} />
              )}
              {/* Indiretos */}
              <BreakdownRow
                label="🏢 Indiretos (despesas)"
                orcado={agg.orcadoIndiretos}
                pedidos={null}
                pago={agg.pagoIndiretos}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'indiretos'}
                onToggle={() => setExpandedSection(s => s === 'indiretos' ? null : 'indiretos')}
              />
              {expandedSection === 'indiretos' && (
                <DrilldownIndiretos data={indiretosPorCategoria} qtdCasas={qtdCasas} />
              )}
              {/* Subtotal Operacional */}
              <tr className="bg-primary/15 font-bold">
                <td className="px-3 py-2">Σ Custo Operacional</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pedidosTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(agg.pagoOperacional, agg.orcadoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional - agg.pagoOperacional)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoOperacional / qtdCasas)}</td>
                <td />
              </tr>

              {/* Separador + Financiamento */}
              <tr>
                <td colSpan={8} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-t-2 border-border">
                  Operações Financeiras <span className="normal-case text-[10px] text-muted-foreground/70 ml-2">(informativo — só os juros entram no custo do projeto)</span>
                </td>
              </tr>
              <BreakdownRow
                label="🏦 Capital de giro (operação financeira — pagamento do principal NÃO é custo)"
                orcado={null}
                pedidos={null}
                pago={null}
                qtdCasas={qtdCasas}
                isExpanded={expandedSection === 'capital'}
                onToggle={() => setExpandedSection(s => s === 'capital' ? null : 'capital')}
                customCells={
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Captado (entrada)">
                      + {formatCurrency(agg.capitalCaptado)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Total contratado em parcelas">
                      {formatCurrency(agg.capitalContratadoParcelas)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Pago (principal + juros)">
                      − {formatCurrency(agg.capitalPagoTotal)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="Saldo devedor">
                      {formatCurrency(agg.capitalSaldoDevedor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                  </>
                }
              />
              {expandedSection === 'capital' && (
                <DrilldownCapital data={capitalPorMutuo} />
              )}
              <tr className="bg-amber-500/10 font-semibold">
                <td className="px-3 py-2">💰 Custo Financeiro (juros)</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400" title="Projetado: total parcelas − captado">
                  {formatCurrency(agg.custoFinanceiroProjetado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400" title="Juros apropriado proporcionalmente ao que foi pago">
                  {formatCurrency(agg.custoFinanceiroRealizado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {pct(agg.custoFinanceiroRealizado, agg.custoFinanceiroProjetado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(agg.custoFinanceiroProjetado - agg.custoFinanceiroRealizado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(agg.custoFinanceiroProjetado / qtdCasas)}
                </td>
                <td />
              </tr>

              {/* TOTAL com financiamento */}
              <tr className="bg-primary/20 font-bold border-t-2 border-primary/50">
                <td className="px-3 py-2">TOTAL CUSTO DO PROJETO (operacional + juros)</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(agg.pagoComFinanceiro, agg.orcadoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro - agg.pagoComFinanceiro)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.orcadoComFinanceiro / qtdCasas)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── CONCILIAÇÃO × PAGAMENTOS ─── */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conciliação 3 fontes × pagamentos
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Confere se <strong>Pedidos + Custos Indiretos + Capital (devolução)</strong> batem
          com o total de parcelas geradas (previsto) e com as saídas conciliadas no banco (real).
        </p>

        <div className="overflow-hidden rounded-xl border">
          <table className="tbl-bf w-full text-sm">
            <thead className="bg-muted/80">
              <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Fonte</th>
                <th className="px-3 py-2 text-right">Previsto (contratado)</th>
                <th className="px-3 py-2 text-right">Real (pago)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr>
                <td className="px-3 py-2">🔧 Pedidos</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoPedidos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoDiretos)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2">🏢 Custos Indiretos</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoIndiretos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.pagoIndiretos)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2">🏦 Capital (devolução + juros)</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoCapital)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(agg.capitalPagoTotal)}</td>
              </tr>
              {(agg.previstoOrfas > 0.5 || agg.pagoOrfas > 0.5) && (
                <tr className="bg-amber-500/5">
                  <td className="px-3 py-2 text-amber-700 dark:text-amber-400" title="Parcelas sem pedido_id e sem despesa_indireta_id — não rastreáveis a uma fonte">
                    ⚠️ Órfãs (sem pedido/despesa)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.previstoOrfas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(agg.pagoOrfas)}</td>
                </tr>
              )}
              <tr className="bg-primary/15 font-bold">
                <td className="px-3 py-2">Σ Total das fontes</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.previstoTotalFontes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(agg.pagoTotal)}</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground" title="Previsto: Σ parcelas (com pedido_id ou despesa_indireta_id) + Σ mutuo_parcelas. Real: Σ saídas conciliadas no extrato.">
                  Referência (pagamentos)
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(agg.totalParcelasGeradas)}
                  <div className="text-[10px] text-muted-foreground/70">Σ parcelas geradas</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatCurrency(agg.conciliado)}
                  <div className="text-[10px] text-muted-foreground/70">
                    Σ saídas conciliadas ({movimentacoes.filter(m => m.conciliado).length}/{movimentacoes.length} mov.)
                  </div>
                </td>
              </tr>
              <tr className={`font-bold border-t-2 ${
                Math.abs(agg.gapPrevisto) > 1 || Math.abs(agg.gap) > 1
                  ? 'bg-red-500/10 border-red-500/40'
                  : 'bg-emerald-500/10 border-emerald-500/40'
              }`}>
                <td className="px-3 py-2">Gap (fontes − referência)</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gapPrevisto) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(agg.gapPrevisto)}
                  {Math.abs(agg.gapPrevisto) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(agg.gap) > 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatCurrency(agg.gap)}
                  {Math.abs(agg.gap) > 1 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {(Math.abs(agg.gapPrevisto) > 1 || Math.abs(agg.gap) > 1) && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-900 dark:text-amber-200">
            <div className="font-semibold mb-1">Possíveis causas do gap:</div>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>Previsto:</strong> pedido com <code>valor_total_real</code> diferente da soma das suas parcelas (ex.: pedido sem cond. de pagamento, ou parcelas não geradas/excluídas).</li>
              <li><strong>Real:</strong> pagamento lançado em parcela mas movimentação bancária não conciliada — ou conciliada num período fora deste filtro.</li>
              <li><strong>Capital:</strong> juros embutidos nas parcelas dos mútuos podem inflar o total contratado vs valor captado.</li>
            </ul>
          </div>
        )}
      </div>
      </div>
      )}
      {/* ─── DRAWER DE INSPEÇÃO ─── */}
      <GapInspectorDrawer
        origin={inspectOrigin}
        onClose={() => setInspectOrigin(null)}
        medicoes={medicoes}
        pedidos={pedidos as any}
        parcelas={parcelas}
        mutuos={mutuos}
        despesas={despesas as any}
        fcTotalPedidos={fcTotals.pedidosObra}
        pedidosTotal={agg.pedidosTotal}
      />
    </div>
  )
}

// ─── Grade de Integridade por Origem ─────────────────────────────────────────

interface OrigemRow {
  label: string
  sublabel: string
  dot: string
  route: string
  inspectKey: GapOrigin
  registrado: number
  noFC: number
  gap: number
  gapNote?: string
  severity: 'ok' | 'warn' | 'gap'
}

function OrigemIntegridadeGrid({
  rows,
  onInspect,
}: {
  rows: OrigemRow[]
  onInspect: (key: GapOrigin) => void
}) {
  const totalGap = rows.reduce((s, r) => s + r.gap, 0)
  const nOk = rows.filter(r => r.severity === 'ok').length

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {nOk === rows.length
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            Integridade por Origem
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Se cada real da tela-fonte tem representação no fluxo de caixa —
            {nOk === rows.length
              ? <span className="text-emerald-600 font-semibold ml-1">todas {rows.length} origens OK</span>
              : <span className="text-amber-600 font-semibold ml-1">{rows.length - nOk} origem(ns) com gap · {formatCurrency(totalGap)} fora do FC</span>}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left">Origem</th>
              <th className="px-4 py-2 text-right">Registrado na tela</th>
              <th className="px-4 py-2 text-right">Com entrada no FC</th>
              <th className="px-4 py-2 text-right">Gap (fora do FC)</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(row => {
              const pct = row.registrado > 0 ? (row.noFC / row.registrado) * 100 : 100
              const isOk = row.severity === 'ok'
              const isWarn = row.severity === 'warn'
              return (
                <tr key={row.label} className={`hover:bg-muted/20 transition-colors ${row.severity === 'gap' ? 'bg-red-500/3' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${row.dot}`} />
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-[10px] text-muted-foreground">{row.sublabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(row.registrado)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={isOk ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                      {formatCurrency(row.noFC)}
                    </span>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOk ? 'bg-emerald-500' : isWarn ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.gap < 0.5
                      ? <span className="text-muted-foreground/40">—</span>
                      : (
                        <div>
                          <span className={`font-semibold ${row.severity === 'gap' ? 'text-red-600' : 'text-amber-600'}`}>
                            {formatCurrency(row.gap)}
                          </span>
                          {row.gapNote && (
                            <div className="text-[10px] text-muted-foreground max-w-[220px] text-right leading-tight mt-0.5">
                              {row.gapNote}
                            </div>
                          )}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isOk
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                      : isWarn
                        ? <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                        : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => onInspect(row.inspectKey)}
                      className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      Inspecionar <ArrowRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-5 px-4 py-2.5 border-t bg-muted/20 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Tudo incluído no FC</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" /> Incluído via cálculo simplificado</span>
        <span className="flex items-center gap-1.5"><XCircle className="h-3 w-3 text-red-500" /> Itens ausentes do FC — ação necessária</span>
      </div>
    </div>
  )
}

// ─── Row de breakdown (camada 2) ────────────────────────────────────────────
function BreakdownRow({
  label, orcado, pedidos, pago, qtdCasas, isExpanded, onToggle, customCells,
}: {
  label: string
  orcado: number | null
  pedidos: number | null
  pago: number | null
  qtdCasas: number
  isExpanded: boolean
  onToggle: () => void
  customCells?: React.ReactNode
}) {
  return (
    <tr onClick={onToggle} className="cursor-pointer hover:bg-accent/30">
      <td className="px-3 py-2 font-medium">
        <div className="inline-flex items-center gap-2">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </div>
      </td>
      {customCells ? customCells : (
        <>
          <td className="px-3 py-2 text-right tabular-nums">
            {orcado == null ? '—' : formatCurrency(orcado)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {pedidos == null ? '—' : formatCurrency(pedidos)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
            {pago == null ? '—' : formatCurrency(pago)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {orcado == null || pago == null ? '—' : pct(pago, orcado)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {orcado == null || pago == null ? '—' : formatCurrency(orcado - pago)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
            {orcado == null ? '—' : formatCurrency(orcado / qtdCasas)}
          </td>
        </>
      )}
      <td className="px-3 py-2" />
    </tr>
  )
}

// ─── Drilldowns (camada 3) ──────────────────────────────────────────────────
function DrilldownDiretos({ data, qtdCasas }: { data: Array<{ id: string; etapa_nome: string; orcado: number; pedidos: number; pago: number; itensCount: number }>; qtdCasas: number }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por etapa ({data.length})
        </td>
      </tr>
      {data.map(e => (
        <tr key={e.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span> {e.etapa_nome}
            <span className="ml-2 text-[10px] text-muted-foreground">({e.itensCount} itens)</span>
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(e.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(e.pedidos)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(e.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(e.pago, e.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(e.orcado - e.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(e.orcado / qtdCasas)}</td>
          <td />
        </tr>
      ))}
    </>
  )
}

function DrilldownIndiretos({ data, qtdCasas }: { data: Array<{ categoria: string; orcado: number; pago: number; itens: number }>; qtdCasas: number }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por categoria ({data.length})
        </td>
      </tr>
      {data.map(c => (
        <tr key={c.categoria} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span> {c.categoria}
            <span className="ml-2 text-[10px] text-muted-foreground">({c.itens} despesa{c.itens > 1 ? 's' : ''})</span>
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(c.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(c.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(c.pago, c.orcado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(c.orcado - c.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatCurrency(c.orcado / qtdCasas)}</td>
          <td />
        </tr>
      ))}
    </>
  )
}

function DrilldownCapital({ data }: { data: Array<{ id: string; nome: string; tipo: string; valor_captado: number; pago: number; saldo: number; instituicao: string | null; status: string }> }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ↓ por mútuo/empréstimo ({data.length})
        </td>
      </tr>
      {data.map(m => (
        <tr key={m.id} className="bg-muted/20">
          <td className="px-6 py-1.5 text-xs">
            <span className="text-muted-foreground">└─</span>
            <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[9px] font-semibold">{m.tipo}</span>
            {' '}{m.nome}
            {m.instituicao && <span className="ml-2 text-[10px] text-muted-foreground">{m.instituicao}</span>}
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">—</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(m.pago)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct(m.pago, m.valor_captado)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(m.saldo)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
            <span className={`rounded px-1.5 py-0.5 text-[9px] ${m.status === 'quitado' ? 'bg-emerald-500/20 text-emerald-700' : m.status === 'inadimplente' ? 'bg-red-500/20 text-red-700' : 'bg-blue-500/20 text-blue-700'}`}>
              {m.status}
            </span>
          </td>
          <td />
        </tr>
      ))}
    </>
  )
}
