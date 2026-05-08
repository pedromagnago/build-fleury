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
} from 'lucide-react'
import { useItensCompra, usePedidos } from '@/hooks/useCompras'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useMedicoes, useMovimentacoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency } from '@/lib/utils'

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

      {/* ─── CAMADA 0: AUDITORIA CONTÁBIL (3 equações que devem fechar) ─── */}
      <AuditoriaContabilCard />

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
