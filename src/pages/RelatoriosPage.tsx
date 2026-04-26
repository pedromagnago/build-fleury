import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDashboardKPIs } from '@/hooks/useFinanceiro'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useItensCompra } from '@/hooks/useCompras'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import { FileBarChart, Download, Printer } from 'lucide-react'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'

type ReportType = 'orcamento' | 'financeiro' | 'medicoes' | 'cronograma'

export default function RelatoriosPage() {
  const { restartTour } = useTour('relatorios', pageTours.relatorios)

  const [activeReport, setActiveReport] = useState<ReportType>('orcamento')
  const { data: kpis } = useDashboardKPIs()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: etapas = [] } = useEtapas()
  const { data: itens = [] } = useItensCompra()

  const handlePrint = () => window.print()

  const handleExportCSV = () => {
    let csv = ''
    let filename = ''
    if (activeReport === 'orcamento') {
      csv = 'Código;Descrição;Unidade;Qtd;Custo Unit;Total Orçado;Consumido\n'
      itens.forEach((i) => {
        csv += `${i.codigo};${i.descricao};${i.unidade};${i.qtd_total};${i.custo_unitario_orcado};${i.valor_total_orcado};${i.valor_consumido}\n`
      })
      filename = 'relatorio_orcamento.csv'
    } else if (activeReport === 'financeiro') {
      csv = 'Item;Parcela;Valor;Vencimento;Status;Pago\n'
      parcelas.forEach((p) => {
        csv += `${p.pedido_item ?? p.descricao ?? 'Avulsa'};${p.numero_parcela};${p.valor};${p.data_vencimento};${p.status};${p.valor_pago}\n`
      })
      filename = 'relatorio_financeiro.csv'
    } else if (activeReport === 'medicoes') {
      csv = 'Nº;Planejado;Liberado;Prevista;Status;%Meta;%Real\n'
      medicoes.forEach((m) => {
        csv += `${m.numero};${m.valor_planejado};${m.valor_liberado};${m.data_prevista};${m.status};${m.percentual_fisico_meta};${m.percentual_fisico_real}\n`
      })
      filename = 'relatorio_medicoes.csv'
    } else {
      csv = 'Código;Nome;Status;Início;Fim;Casas;Orçamento\n'
      etapas.forEach((e) => {
        csv += `${e.codigo};${e.nome};${e.status};${e.data_inicio_plan};${e.data_fim_plan};${e.casas_total};${e.valor_total_orcado}\n`
      })
      filename = 'relatorio_cronograma.csv'
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
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Orçado</p>
                <p className="mt-1 text-xl font-bold">{formatCurrency(kpis?.totalOrcado ?? 0)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Consumido</p>
                <p className="mt-1 text-xl font-bold text-amber-500">{formatCurrency(kpis?.totalConsumido ?? 0)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">% Consumido</p>
                <p className="mt-1 text-xl font-bold">{formatPercent(kpis?.percentualConsumido ?? 0)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="tbl-bf w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Código</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Descrição</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Orçado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Consumido</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">{itens.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{i.codigo}</td>
                    <td className="px-3 py-2">{i.descricao}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(i.valor_total_orcado)}</td>
                    <td className="px-3 py-2 text-right text-amber-500">{formatCurrency(i.valor_consumido)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${i.valor_total_orcado - i.valor_consumido >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(i.valor_total_orcado - i.valor_consumido)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}

        {activeReport === 'financeiro' && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="tbl-bf w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Vencimento</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y">{parcelas.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">{p.pedido_item ?? p.descricao ?? 'Avulsa'}</td>
                  <td className="px-3 py-2 text-center text-xs">{p.numero_parcela}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(p.valor)}</td>
                  <td className="px-3 py-2 text-center text-xs">{formatDate(p.data_vencimento)}</td>
                  <td className="px-3 py-2 text-center text-xs capitalize">{p.status.replace('_', ' ')}</td>
                  <td className="px-3 py-2 text-right text-emerald-500">{formatCurrency(p.valor_pago)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
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
      </div>
    </div>
  )
}
