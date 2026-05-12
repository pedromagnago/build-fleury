import { useState, useMemo, Fragment as React_Fragment } from 'react'
// Alias para usar como <React.Fragment>
const React = { Fragment: React_Fragment }
import { PageHeader } from '@/components/ui/PageHeader'
import { useOrcamentoRealizado, useReconciliacao, useAmortizacoesAvulsas } from '@/hooks/useFinanceiro'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMutuos } from '@/hooks/useMutuos'
import { useMedicoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useItensCompra } from '@/hooks/useCompras'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import { FileBarChart, Download, Printer, AlertTriangle } from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

type ReportType = 'orcamento' | 'financeiro' | 'medicoes' | 'cronograma' | 'reconciliacao'

export default function RelatoriosPage() {
  const { restartTour } = useTour('relatorios', pageTours.relatorios)

  const [activeReport, setActiveReport] = useState<ReportType>('orcamento')
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: etapas = [] } = useEtapas()
  const { data: itens = [] } = useItensCompra()
  const { data: orcamento } = useOrcamentoRealizado()
  const { data: mutuos = [] } = useMutuos()
  const { data: amortizacoesAvulsas = [] } = useAmortizacoesAvulsas()
  const [filtroRec, setFiltroRec] = useState<{ inicio: string; fim: string }>({ inicio: '', fim: '' })
  const { data: reconciliacao = [], isLoading: carregandoRec } = useReconciliacao({ dataInicio: filtroRec.inicio || undefined, dataFim: filtroRec.fim || undefined })

  // F4.1 + R1-R4: filtros e unificação do relatório Financeiro
  // Agora une 3 origens: parcelas de pedido, parcelas de mútuo e amortizações avulsas — espelhando o que Pagamentos mostra.
  const [filtroFin, setFiltroFin] = useState<{ inicio: string; fim: string; status: string; fornecedor: string; origem: 'todas' | 'pedido' | 'mutuo' | 'amortizacao' | 'avulsa' }>({
    inicio: '', fim: '', status: '', fornecedor: '', origem: 'todas',
  })

  // Lista unificada de "parcelas financeiras" (pedido + mútuo + amortização avulsa)
  type ParcelaFinanceira = {
    id: string
    origem: 'pedido' | 'mutuo' | 'amortizacao' | 'avulsa'
    origem_label: string
    fornecedor_nome: string | null
    item: string
    numero_parcela: number
    valor: number
    valor_pago: number
    data_vencimento: string
    status: string
  }
  const parcelasUnificadas: ParcelaFinanceira[] = useMemo(() => {
    const lista: ParcelaFinanceira[] = []
    // (1) Parcelas de pedido / despesa indireta (useParcelas)
    for (const p of parcelas) {
      const origem: ParcelaFinanceira['origem'] = p.pedido_id ? 'pedido' : (p.despesa_indireta_id ? 'avulsa' : 'avulsa')
      lista.push({
        id: p.id,
        origem,
        origem_label: p.pedido_id ? 'Pedido' : 'Avulsa',
        fornecedor_nome: p.fornecedor_nome ?? null,
        item: p.pedido_item ?? p.descricao ?? 'Avulsa',
        numero_parcela: p.numero_parcela,
        valor: Number(p.valor) || 0,
        valor_pago: Number(p.valor_pago) || 0,
        data_vencimento: p.data_vencimento,
        status: p.status,
      })
    }
    // (2) Parcelas de mútuo (mutuos[].parcelas) — exclui adiantamentos a receber (vão em Recebimentos)
    for (const m of mutuos) {
      const cat = String((m as any).categoria ?? '').toLowerCase()
      if (cat.includes('adiantamento a receber') || cat.includes('adiantamento feito')) continue
      const forn = (m as any).fornecedor?.nome ?? (m as any).instituicao ?? m.nome
      for (const mp of (m.parcelas ?? [])) {
        lista.push({
          id: mp.id,
          origem: 'mutuo',
          origem_label: 'Mútuo',
          fornecedor_nome: forn ?? null,
          item: `${m.nome} (${m.tipo})`,
          numero_parcela: mp.numero_parcela,
          valor: Number(mp.valor) || 0,
          valor_pago: Number(mp.valor_pago) || 0,
          data_vencimento: mp.data_vencimento,
          status: mp.status,
        })
      }
    }
    // (3) Amortizações avulsas (já estão pagas via conciliação bancária)
    for (const a of amortizacoesAvulsas) {
      const mutuo = mutuos.find(m => m.id === a.mutuo_id)
      const forn = (mutuo as any)?.fornecedor?.nome ?? (mutuo as any)?.instituicao ?? a.mutuo_nome
      lista.push({
        id: a.id,
        origem: 'amortizacao',
        origem_label: 'Amortização',
        fornecedor_nome: forn ?? a.mutuo_nome ?? null,
        item: `Amortização avulsa — ${a.mutuo_nome}`,
        numero_parcela: 0,
        valor: a.valor,
        valor_pago: a.valor,
        data_vencimento: a.data,
        status: 'paga',
      })
    }
    return lista
  }, [parcelas, mutuos, amortizacoesAvulsas])

  const fornecedoresParcelas = useMemo(() => {
    const set = new Set<string>()
    for (const p of parcelasUnificadas) if (p.fornecedor_nome) set.add(p.fornecedor_nome)
    return Array.from(set).sort()
  }, [parcelasUnificadas])
  const parcelasFiltradas = useMemo(() => {
    return parcelasUnificadas.filter(p => {
      if (filtroFin.inicio && p.data_vencimento < filtroFin.inicio) return false
      if (filtroFin.fim && p.data_vencimento > filtroFin.fim) return false
      if (filtroFin.status && p.status !== filtroFin.status) return false
      if (filtroFin.fornecedor && (p.fornecedor_nome ?? '') !== filtroFin.fornecedor) return false
      if (filtroFin.origem !== 'todas' && p.origem !== filtroFin.origem) return false
      return true
    })
  }, [parcelasUnificadas, filtroFin])
  const totalFinanceiro = useMemo(() => {
    return parcelasFiltradas.reduce((acc, p) => {
      acc.valor += p.valor
      acc.pago += p.valor_pago ?? 0
      return acc
    }, { valor: 0, pago: 0 })
  }, [parcelasFiltradas])
  // Quebra por origem (sempre sobre o conjunto filtrado, pra dar transparência das somas)
  const totaisPorOrigem = useMemo(() => {
    const acc = { pedido: { v: 0, p: 0, c: 0 }, mutuo: { v: 0, p: 0, c: 0 }, amortizacao: { v: 0, p: 0, c: 0 }, avulsa: { v: 0, p: 0, c: 0 } }
    for (const p of parcelasFiltradas) {
      const k = p.origem
      acc[k].v += p.valor
      acc[k].p += p.valor_pago
      acc[k].c += 1
    }
    return acc
  }, [parcelasFiltradas])

  // Agrupa itens por etapa pra subtotais no relatório de Orçamento (F4.2)
  const itensPorEtapa = useMemo(() => {
    const grupo = new Map<string, { etapa_id: string; nome: string; codigo: string; itens: typeof itens; totais: { orcado: number; comprometido: number; recebido: number; pago: number; saldo: number; divergente: boolean } }>()
    for (const it of itens) {
      const etapa = etapas.find(e => e.id === it.etapa_id)
      const key = it.etapa_id ?? 'sem_etapa'
      const r = orcamento?.porItem.get(it.id)
      const entry = grupo.get(key) ?? {
        etapa_id: key,
        nome: etapa?.nome ?? 'Sem etapa',
        codigo: etapa?.codigo ?? '',
        itens: [] as typeof itens,
        totais: { orcado: 0, comprometido: 0, recebido: 0, pago: 0, saldo: 0, divergente: false },
      }
      entry.itens.push(it)
      entry.totais.orcado += r?.orcado ?? it.valor_total_orcado
      entry.totais.comprometido += r?.comprometido ?? 0
      entry.totais.recebido += r?.recebido ?? 0
      entry.totais.pago += r?.pago ?? 0
      entry.totais.saldo += r?.saldo ?? (it.valor_total_orcado - 0)
      if (r?.divergente) entry.totais.divergente = true
      grupo.set(key, entry)
    }
    return Array.from(grupo.values()).sort((a, b) => a.codigo.localeCompare(b.codigo))
  }, [itens, etapas, orcamento])

  const handlePrint = () => window.print()

  const handleExportCSV = () => {
    let csv = ''
    let filename = ''
    if (activeReport === 'orcamento') {
      csv = 'Etapa;Código;Descrição;Unidade;Qtd;Custo Unit;Orçado;Comprometido;Recebido;Pago;Saldo;Divergência\n'
      itensPorEtapa.forEach((g) => {
        g.itens.forEach((i) => {
          const r = orcamento?.porItem.get(i.id)
          const orcado = r?.orcado ?? i.valor_total_orcado
          const comprometido = r?.comprometido ?? 0
          const recebido = r?.recebido ?? 0
          const pago = r?.pago ?? 0
          const saldo = r?.saldo ?? orcado
          const div = r?.divergente ? `${(r.valor_consumido_db - r.comprometido).toFixed(2)}` : '0'
          csv += `${g.codigo} ${g.nome};${i.codigo};${i.descricao};${i.unidade ?? ''};${i.qtd_total ?? ''};${i.custo_unitario_orcado};${orcado};${comprometido};${recebido};${pago};${saldo};${div}\n`
        })
        csv += `;;Subtotal ${g.codigo} ${g.nome};;;;${g.totais.orcado};${g.totais.comprometido};${g.totais.recebido};${g.totais.pago};${g.totais.saldo};\n`
      })
      if (orcamento) {
        csv += `;;TOTAL GERAL;;;;${orcamento.totais.orcado};${orcamento.totais.comprometido};${orcamento.totais.recebido};${orcamento.totais.pago};${orcamento.totais.saldo};\n`
      }
      filename = 'relatorio_orcamento.csv'
    } else if (activeReport === 'financeiro') {
      csv = 'Origem;Fornecedor;Item;Parcela;Valor;Vencimento;Status;Valor Pago\n'
      parcelasFiltradas.forEach((p) => {
        csv += `${p.origem_label};${p.fornecedor_nome ?? ''};${(p.item ?? '').replace(/;/g, ',')};${p.numero_parcela};${p.valor};${p.data_vencimento};${p.status};${p.valor_pago}\n`
      })
      csv += `;;;TOTAL;${totalFinanceiro.valor};;;${totalFinanceiro.pago}\n`
      filename = 'relatorio_financeiro.csv'
    } else if (activeReport === 'medicoes') {
      csv = 'Nº;Planejado;Liberado;Prevista;Status;%Meta;%Real\n'
      medicoes.forEach((m) => {
        csv += `${m.numero};${m.valor_planejado};${m.valor_liberado};${m.data_prevista};${m.status};${m.percentual_fisico_meta};${m.percentual_fisico_real}\n`
      })
      filename = 'relatorio_medicoes.csv'
    } else if (activeReport === 'cronograma') {
      csv = 'Código;Nome;Status;Início;Fim;Casas;Orçamento\n'
      etapas.forEach((e) => {
        csv += `${e.codigo};${e.nome};${e.status};${e.data_inicio_plan};${e.data_fim_plan};${e.casas_total};${e.valor_total_orcado}\n`
      })
      filename = 'relatorio_cronograma.csv'
    } else {
      // reconciliacao
      csv = 'NF;Série;Fornecedor;Data Emissão;Linha;Descrição NF;Valor Linha;Ação;Pedido;Status Pedido;Valor Pedido;Qtd Parc;Total Parcelado;Total Pago;Inconsistências\n'
      reconciliacao.forEach((d) => {
        d.linhas.forEach((l) => {
          csv += `${d.numero_doc ?? ''};${d.serie ?? ''};${d.fornecedor_nome ?? ''};${d.data_emissao ?? ''};${l.ordem ?? ''};${(l.descricao_original ?? '').replace(/;/g, ',')};${l.valor_total ?? ''};${l.acao};${l.numero_pedido ?? ''};${l.pedido_status ?? ''};${l.pedido_valor_total ?? ''};${l.parcelas.length};${l.total_parcelado};${l.total_pago};${l.inconsistencias.join(' | ')}\n`
        })
      })
      filename = 'relatorio_reconciliacao.csv'
    }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const reports: { key: ReportType; label: string }[] = [
    { key: 'orcamento', label: 'Orçamento' },
    { key: 'financeiro', label: 'Financeiro' },
    { key: 'medicoes', label: 'Medições' },
    { key: 'cronograma', label: 'Cronograma' },
    { key: 'reconciliacao', label: 'Reconciliação NF' },
  ]

  return (
    <div>
      <PageHeader title="Relatórios" description="Exportação e visualização de dados" icon={FileBarChart} onHelp={restartTour} />

      <div className="mb-4 flex items-center justify-between">
        <div id="tour-rel-types" className="flex gap-1 rounded-lg border bg-card p-1">
          {reports.map((r) => (
            <button key={r.key} onClick={() => setActiveReport(r.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeReport === r.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div id="tour-rel-export" className="flex gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      <div className="print:bg-white print:text-black" id="report-content">
        {activeReport === 'orcamento' && (
          <>
            {/* F4.4: banner de divergências entre valor_consumido (DB) e SUM(pedidos) */}
            {orcamento && orcamento.divergencias > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <div>
                  <strong>{orcamento.divergencias} item(ns) com valor_consumido dessincronizado.</strong> O relatório abaixo usa a soma direta dos pedidos como fonte de verdade. Os itens divergentes estão marcados com <span className="text-red-600">●</span>.
                </div>
              </div>
            )}
            <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Orçado</p>
                <p className="mt-0.5 text-base font-bold">{formatCurrency(orcamento?.totais.orcado ?? 0)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Comprometido</p>
                <p className="mt-0.5 text-base font-bold text-blue-600">{formatCurrency(orcamento?.totais.comprometido ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">{orcamento?.totais.orcado ? formatPercent((orcamento.totais.comprometido / orcamento.totais.orcado) * 100) : '—'}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Recebido (c/ NF)</p>
                <p className="mt-0.5 text-base font-bold text-amber-600">{formatCurrency(orcamento?.totais.recebido ?? 0)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Pago</p>
                <p className="mt-0.5 text-base font-bold text-emerald-600">{formatCurrency(orcamento?.totais.pago ?? 0)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Saldo a comprometer</p>
                <p className={`mt-0.5 text-base font-bold ${(orcamento?.totais.saldo ?? 0) >= 0 ? 'text-foreground' : 'text-red-600'}`}>{formatCurrency(orcamento?.totais.saldo ?? 0)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="tbl-bf w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Código</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Descrição</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Orçado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground" title="Soma de pedidos ativos (planejados, enviados, entregues, pagos) — exclui cancelados">Comprometido</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground" title="Pedidos com NF recebida (entregue, parcialmente_pago, pago)">Recebido</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Pago</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">{itensPorEtapa.map((g) => (
                  <React.Fragment key={g.etapa_id}>
                    <tr className="bg-muted/20">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                        {g.codigo} {g.nome} ({g.itens.length} itens)
                        {g.totais.divergente && <span className="ml-2 text-red-600" title="Há divergência nesta etapa">●</span>}
                      </td>
                    </tr>
                    {g.itens.map((i) => {
                      const r = orcamento?.porItem.get(i.id)
                      const orcado = r?.orcado ?? i.valor_total_orcado
                      const comprometido = r?.comprometido ?? 0
                      const recebido = r?.recebido ?? 0
                      const pago = r?.pago ?? 0
                      const saldo = r?.saldo ?? orcado
                      return (
                        <tr key={i.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">
                            {i.codigo}
                            {r?.divergente && <span className="ml-1 text-red-600" title={`valor_consumido no DB: ${formatCurrency(r.valor_consumido_db)} · derivado: ${formatCurrency(r.comprometido)}`}>●</span>}
                          </td>
                          <td className="px-3 py-2">{i.descricao}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(orcado)}</td>
                          <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(comprometido)}</td>
                          <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(recebido)}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{formatCurrency(pago)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${saldo >= 0 ? 'text-foreground' : 'text-red-600'}`}>{formatCurrency(saldo)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-muted/10 font-semibold">
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right text-[11px] text-muted-foreground">Subtotal {g.codigo}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(g.totais.orcado)}</td>
                      <td className="px-3 py-1.5 text-right text-blue-600">{formatCurrency(g.totais.comprometido)}</td>
                      <td className="px-3 py-1.5 text-right text-amber-600">{formatCurrency(g.totais.recebido)}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-600">{formatCurrency(g.totais.pago)}</td>
                      <td className={`px-3 py-1.5 text-right ${g.totais.saldo >= 0 ? 'text-foreground' : 'text-red-600'}`}>{formatCurrency(g.totais.saldo)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                {orcamento && (
                  <tr className="bg-primary/10 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-right">TOTAL GERAL</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(orcamento.totais.orcado)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(orcamento.totais.comprometido)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(orcamento.totais.recebido)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(orcamento.totais.pago)}</td>
                    <td className={`px-3 py-2 text-right ${orcamento.totais.saldo >= 0 ? 'text-foreground' : 'text-red-700'}`}>{formatCurrency(orcamento.totais.saldo)}</td>
                  </tr>
                )}</tbody>
              </table>
            </div>
          </>
        )}

        {activeReport === 'financeiro' && (
          <>
            {/* F4.1 + R2: filtros (inclui filtro por Origem) */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 rounded-lg border bg-card p-3">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Venc. de</label>
                <input type="date" value={filtroFin.inicio} onChange={e => setFiltroFin({ ...filtroFin, inicio: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Venc. até</label>
                <input type="date" value={filtroFin.fim} onChange={e => setFiltroFin({ ...filtroFin, fim: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Origem</label>
                <select value={filtroFin.origem} onChange={e => setFiltroFin({ ...filtroFin, origem: e.target.value as typeof filtroFin.origem })} className="w-full rounded border bg-background px-2 py-1 text-xs">
                  <option value="todas">Todas</option>
                  <option value="pedido">Pedidos</option>
                  <option value="mutuo">Mútuos</option>
                  <option value="amortizacao">Amortizações</option>
                  <option value="avulsa">Avulsas</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Status</label>
                <select value={filtroFin.status} onChange={e => setFiltroFin({ ...filtroFin, status: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs">
                  <option value="">Todos</option>
                  <option value="futura">Futura</option>
                  <option value="a_vencer">A vencer</option>
                  <option value="vencida">Vencida</option>
                  <option value="pendente">Pendente</option>
                  <option value="parcialmente_paga">Parc. paga</option>
                  <option value="paga">Paga</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Fornecedor</label>
                <select value={filtroFin.fornecedor} onChange={e => setFiltroFin({ ...filtroFin, fornecedor: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs">
                  <option value="">Todos</option>
                  {fornecedoresParcelas.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => setFiltroFin({ inicio: '', fim: '', status: '', fornecedor: '', origem: 'todas' })} className="w-full rounded border px-2 py-1 text-[11px] hover:bg-muted">Limpar</button>
              </div>
            </div>
            {/* Cards de totais filtrados */}
            <div className="mb-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Parcelas no filtro</p>
                <p className="mt-0.5 text-base font-bold">{parcelasFiltradas.length} / {parcelasUnificadas.length}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Valor total</p>
                <p className="mt-0.5 text-base font-bold">{formatCurrency(totalFinanceiro.valor)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Pago</p>
                <p className="mt-0.5 text-base font-bold text-emerald-600">{formatCurrency(totalFinanceiro.pago)}</p>
              </div>
            </div>
            {/* Quebra por origem (transparência das somas) */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div className="rounded-md border bg-card p-2">
                <div className="text-muted-foreground uppercase text-[9px]">Pedidos</div>
                <div className="font-bold">{totaisPorOrigem.pedido.c} · {formatCurrency(totaisPorOrigem.pedido.v)}</div>
                <div className="text-emerald-600">Pago {formatCurrency(totaisPorOrigem.pedido.p)}</div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="text-muted-foreground uppercase text-[9px]">Mútuos</div>
                <div className="font-bold">{totaisPorOrigem.mutuo.c} · {formatCurrency(totaisPorOrigem.mutuo.v)}</div>
                <div className="text-emerald-600">Pago {formatCurrency(totaisPorOrigem.mutuo.p)}</div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="text-muted-foreground uppercase text-[9px]">Amortizações</div>
                <div className="font-bold">{totaisPorOrigem.amortizacao.c} · {formatCurrency(totaisPorOrigem.amortizacao.v)}</div>
                <div className="text-emerald-600">Pago {formatCurrency(totaisPorOrigem.amortizacao.p)}</div>
              </div>
              <div className="rounded-md border bg-card p-2">
                <div className="text-muted-foreground uppercase text-[9px]">Avulsas</div>
                <div className="font-bold">{totaisPorOrigem.avulsa.c} · {formatCurrency(totaisPorOrigem.avulsa.v)}</div>
                <div className="text-emerald-600">Pago {formatCurrency(totaisPorOrigem.avulsa.p)}</div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="tbl-bf w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Origem</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fornecedor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Valor</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Vencimento</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parcelasFiltradas.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma parcela neste filtro.</td></tr>
                  )}
                  {parcelasFiltradas.map((p) => (
                    <tr key={`${p.origem}-${p.id}`} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          p.origem === 'pedido' ? 'bg-blue-500/15 text-blue-700' :
                          p.origem === 'mutuo' ? 'bg-purple-500/15 text-purple-700' :
                          p.origem === 'amortizacao' ? 'bg-amber-500/15 text-amber-700' :
                          'bg-muted text-muted-foreground'
                        }`}>{p.origem_label}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{p.fornecedor_nome ?? '—'}</td>
                      <td className="px-3 py-2">{p.item}</td>
                      <td className="px-3 py-2 text-center text-xs">{p.numero_parcela || '—'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(p.valor)}</td>
                      <td className="px-3 py-2 text-center text-xs">{formatDate(p.data_vencimento)}</td>
                      <td className="px-3 py-2 text-center text-xs capitalize">{p.status.replace('_', ' ')}</td>
                      <td className="px-3 py-2 text-right text-emerald-500">{formatCurrency(p.valor_pago)}</td>
                    </tr>
                  ))}
                  {parcelasFiltradas.length > 0 && (
                    <tr className="bg-primary/10 font-bold">
                      <td colSpan={4} className="px-3 py-2 text-right">TOTAL</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(totalFinanceiro.valor)}</td>
                      <td colSpan={2}></td>
                      <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(totalFinanceiro.pago)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeReport === 'medicoes' && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="tbl-bf w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Planejado</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Liberado</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Prevista</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">%Meta</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">%Real</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">{medicoes.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-center font-bold">{m.numero}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(m.valor_planejado)}</td>
                  <td className="px-3 py-2 text-right text-emerald-500">{m.valor_liberado ? formatCurrency(m.valor_liberado) : '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">{formatDate(m.data_prevista)}</td>
                  <td className="px-3 py-2 text-center text-xs">{formatPercent(m.percentual_fisico_meta)}</td>
                  <td className="px-3 py-2 text-center text-xs">{formatPercent(m.percentual_fisico_real)}</td>
                  <td className="px-3 py-2 text-center text-xs capitalize">{m.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {activeReport === 'cronograma' && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="tbl-bf w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Etapa</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Início</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Fim</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Casas</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Orçamento</th>
                </tr>
              </thead>
              <tbody className="divide-y">{etapas.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{e.codigo}</td>
                  <td className="px-3 py-2">{e.nome}</td>
                  <td className="px-3 py-2 text-center text-xs capitalize">{e.status.replace('_', ' ')}</td>
                  <td className="px-3 py-2 text-center text-xs">{e.data_inicio_plan ? formatDate(e.data_inicio_plan) : '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">{e.data_fim_plan ? formatDate(e.data_fim_plan) : '—'}</td>
                  <td className="px-3 py-2 text-center">{e.casas_total}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(e.valor_total_orcado)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {activeReport === 'reconciliacao' && (
          <>
            <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-2 rounded-lg border bg-card p-3">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Emissão de</label>
                <input type="date" value={filtroRec.inicio} onChange={e => setFiltroRec({ ...filtroRec, inicio: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Emissão até</label>
                <input type="date" value={filtroRec.fim} onChange={e => setFiltroRec({ ...filtroRec, fim: e.target.value })} className="w-full rounded border bg-background px-2 py-1 text-xs" />
              </div>
              <div className="flex items-end">
                <button onClick={() => setFiltroRec({ inicio: '', fim: '' })} className="w-full rounded border px-2 py-1 text-[11px] hover:bg-muted">Limpar</button>
              </div>
            </div>
            {carregandoRec && (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Carregando reconciliação…</div>
            )}
            {!carregandoRec && reconciliacao.length === 0 && (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Nenhuma NF aplicada no período.</div>
            )}
            {(() => {
              const docsComInc = reconciliacao.filter(d => d.inconsistencias.length > 0).length
              if (docsComInc === 0 && reconciliacao.length > 0) {
                return (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-800">
                    ✓ Todas as {reconciliacao.length} NFs do período estão consistentes.
                  </div>
                )
              }
              if (docsComInc > 0) {
                return (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span><strong>{docsComInc}</strong> de {reconciliacao.length} NFs com inconsistência. Revise os blocos amarelos abaixo.</span>
                  </div>
                )
              }
              return null
            })()}
            <div className="space-y-3">
              {reconciliacao.map((d) => {
                const hasInc = d.inconsistencias.length > 0
                return (
                  <div key={d.doc_id} className={`rounded-xl border ${hasInc ? 'border-amber-500/40 bg-amber-500/5' : 'bg-card'} p-3`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">NF {d.numero_doc ?? '—'}{d.serie ? `/${d.serie}` : ''}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs">{d.fornecedor_nome ?? '—'}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{d.data_emissao ? formatDate(d.data_emissao) : '—'}</span>
                        </div>
                        {hasInc && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.inconsistencias.map((i, idx) => (
                              <span key={idx} className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 text-amber-800 px-1.5 py-0.5 text-[10px]">
                                <AlertTriangle className="h-2.5 w-2.5" /> {i}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs">
                        <div>Total NF: <strong>{formatCurrency(d.valor_total ?? 0)}</strong></div>
                        <div className="text-muted-foreground">Soma linhas: {formatCurrency(d.soma_linhas)}</div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-2 py-1 text-left">Linha</th>
                            <th className="px-2 py-1 text-left">Descrição NF</th>
                            <th className="px-2 py-1 text-right">Valor</th>
                            <th className="px-2 py-1 text-left">Ação</th>
                            <th className="px-2 py-1 text-left">Pedido</th>
                            <th className="px-2 py-1 text-right">Pedido R$</th>
                            <th className="px-2 py-1 text-center">Parc</th>
                            <th className="px-2 py-1 text-right">Parcelado</th>
                            <th className="px-2 py-1 text-right">Pago</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {d.linhas.map(l => (
                            <tr key={l.match_id} className={l.inconsistencias.length > 0 ? 'bg-red-500/5' : ''}>
                              <td className="px-2 py-1 text-center text-muted-foreground">{l.ordem ?? '—'}</td>
                              <td className="px-2 py-1">
                                {l.descricao_original}
                                {l.inconsistencias.length > 0 && (
                                  <div className="text-[10px] text-red-700">{l.inconsistencias.join(' · ')}</div>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">{formatCurrency(l.valor_total ?? 0)}</td>
                              <td className="px-2 py-1"><span className="rounded bg-muted px-1 py-0.5 text-[10px] capitalize">{l.acao.replace('_', ' ')}</span></td>
                              <td className="px-2 py-1">{l.numero_pedido ? `#${l.numero_pedido}` : <span className="text-muted-foreground italic">—</span>}{l.pedido_status && <span className="ml-1 text-[10px] text-muted-foreground capitalize">({l.pedido_status.replace('_', ' ')})</span>}</td>
                              <td className="px-2 py-1 text-right font-mono">{l.pedido_valor_total != null ? formatCurrency(l.pedido_valor_total) : '—'}</td>
                              <td className="px-2 py-1 text-center">{l.parcelas.length || '—'}</td>
                              <td className="px-2 py-1 text-right font-mono text-blue-700">{formatCurrency(l.total_parcelado)}</td>
                              <td className="px-2 py-1 text-right font-mono text-emerald-700">{formatCurrency(l.total_pago)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
