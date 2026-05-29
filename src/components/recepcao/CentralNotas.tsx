import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { useSelection } from '@/hooks/useSelection'
import { NFDetalheDrawer, type NFDocRef } from '@/components/recepcao/NFDetalheDrawer'
import {
  Search, X, Plus, Loader2, Eye, Download, CheckCircle2,
  SlidersHorizontal, ChevronDown, ChevronUp, AlertCircle, Clock,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type ParcelaResumida = {
  id: string
  nf_origem_id: string | null
  pedido_id: string | null
  status: string
  valor: number | string
  valor_pago: number | string | null
  data_vencimento: string | null
}

type DocRow = NFDocRef & {
  data_emissao: string | null
  parcelas: ParcelaResumida[]
  totValor: number
  totPago: number
  saldo: number
  hasAberto: boolean
  qtdFutura: number
  qtdParcial: number
  qtdPaga: number
}

type QuickFilter = 'todas' | 'a_pagar' | 'liquidadas' | 'sem_parcelas'

// ─── Sub-component: situação das parcelas ────────────────────────────────────

function ParcelasSummary({ doc }: { doc: DocRow }) {
  if (doc.parcelas.length === 0) {
    return <span className="text-[10px] text-muted-foreground italic">sem parcelas</span>
  }
  if (!doc.hasAberto) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold">
        <CheckCircle2 className="h-2.5 w-2.5" /> Liquidada
      </span>
    )
  }
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {doc.qtdFutura > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold">
          <Clock className="h-2.5 w-2.5" /> {doc.qtdFutura} a pagar
        </span>
      )}
      {doc.qtdParcial > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-700 px-1.5 py-0.5 text-[10px] font-semibold">
          <AlertCircle className="h-2.5 w-2.5" /> {doc.qtdParcial} parcial
        </span>
      )}
      {doc.saldo > 0.01 && (
        <span className="rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-mono">
          {formatCurrency(doc.saldo)}
        </span>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CentralNotas({
  companyId,
  onProcessarNovaNF,
}: {
  companyId: string
  onProcessarNovaNF: () => void
}) {
  const qc = useQueryClient()

  // Filters
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todas')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [emissaoDe, setEmissaoDe] = useState('')
  const [emissaoAte, setEmissaoAte] = useState('')
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')

  // Detail drawer
  const [selectedDoc, setSelectedDoc] = useState<NFDocRef | null>(null)

  // Row selection
  const selection = useSelection()

  // ── Query: recepcao_docs + parcelas (três passos, sem N+1) ──────────────────
  // A RPC antiga não preenchia nf_origem_id nas parcelas — elas existem
  // somente via pedido âncora que tem nf_origem_id. Buscamos pelos dois caminhos:
  //   1) parcelas.nf_origem_id IN docIds  (RPC nova / backfill)
  //   2) parcelas.pedido_id IN pedidos que têm nf_origem_id IN docIds  (RPC antiga)
  const { data: docs = [], isLoading } = useQuery<DocRow[]>({
    queryKey: ['central_notas', companyId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: docsRaw, error: e1 } = await supabase
        .from('recepcao_docs')
        .select('id, numero_doc, fornecedor_nome, valor_total, data_emissao, applied_at')
        .eq('company_id', companyId)
        .not('applied_at', 'is', null)
        .order('applied_at', { ascending: false })
        .limit(300)
      if (e1) throw e1

      const docIds = (docsRaw ?? []).map(d => d.id)
      if (docIds.length === 0) return []

      // Passo 2: pedidos âncora linkados a esses docs
      const { data: pedidosVinc } = await supabase
        .from('pedidos')
        .select('id, nf_origem_id')
        .in('nf_origem_id', docIds)
        .eq('company_id', companyId)

      const pedidoToDoc = new Map<string, string>()
      const allPedidoIds: string[] = []
      for (const p of (pedidosVinc ?? []) as any[]) {
        if (!p.nf_origem_id) continue
        pedidoToDoc.set(p.id, p.nf_origem_id)
        allPedidoIds.push(p.id)
      }

      // Passo 3: parcelas por nf_origem_id (novo) OU por pedido_id (antigo)
      let parcelasQuery = supabase
        .from('parcelas')
        .select('id, nf_origem_id, pedido_id, status, valor, valor_pago, data_vencimento')
        .eq('company_id', companyId)

      if (allPedidoIds.length > 0) {
        parcelasQuery = parcelasQuery.or(
          `nf_origem_id.in.(${docIds.join(',')}),pedido_id.in.(${allPedidoIds.join(',')})`
        )
      } else {
        parcelasQuery = parcelasQuery.in('nf_origem_id', docIds)
      }

      const { data: parcelasRaw, error: e2 } = await parcelasQuery
      if (e2) throw e2

      const byDoc = new Map<string, ParcelaResumida[]>()
      const seenParcela = new Set<string>()
      for (const p of (parcelasRaw ?? []) as any[]) {
        // Resolve qual doc esta parcela pertence (por nf_origem_id direto ou via pedido)
        const docId = (p.nf_origem_id as string | null) ?? pedidoToDoc.get(p.pedido_id as string)
        if (!docId || seenParcela.has(p.id)) continue
        seenParcela.add(p.id)
        const arr = byDoc.get(docId) ?? []
        arr.push(p as ParcelaResumida)
        byDoc.set(docId, arr)
      }

      return (docsRaw ?? []).map(d => {
        const parcelas = byDoc.get(d.id) ?? []
        const totValor = parcelas.reduce((s, p) => s + Number(p.valor ?? 0), 0)
        const totPago = parcelas.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0)
        const qtdFutura = parcelas.filter(p => p.status === 'futura').length
        const qtdParcial = parcelas.filter(p => p.status === 'parcialmente_paga').length
        return {
          ...d,
          parcelas,
          totValor,
          totPago,
          saldo: totValor - totPago,
          hasAberto: qtdFutura > 0 || qtdParcial > 0,
          qtdFutura,
          qtdParcial,
          qtdPaga: parcelas.filter(p => p.status === 'paga').length,
        }
      })
    },
  })

  // ── Filtering (client-side) ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = docs

    if (quickFilter === 'a_pagar') result = result.filter(d => d.hasAberto)
    else if (quickFilter === 'liquidadas') result = result.filter(d => !d.hasAberto && d.parcelas.length > 0)
    else if (quickFilter === 'sem_parcelas') result = result.filter(d => d.parcelas.length === 0)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        (d.numero_doc ?? '').toLowerCase().includes(q) ||
        (d.fornecedor_nome ?? '').toLowerCase().includes(q),
      )
    }

    if (emissaoDe) result = result.filter(d => (d.data_emissao ?? '') >= emissaoDe)
    if (emissaoAte) result = result.filter(d => (d.data_emissao ?? '') <= emissaoAte)
    if (valorMin) result = result.filter(d => Number(d.valor_total ?? 0) >= Number(valorMin))
    if (valorMax) result = result.filter(d => Number(d.valor_total ?? 0) <= Number(valorMax))

    return result
  }, [docs, quickFilter, search, emissaoDe, emissaoAte, valorMin, valorMax])

  // Badges count
  const counts = useMemo(() => ({
    todas: docs.length,
    a_pagar: docs.filter(d => d.hasAberto).length,
    liquidadas: docs.filter(d => !d.hasAberto && d.parcelas.length > 0).length,
    sem_parcelas: docs.filter(d => d.parcelas.length === 0).length,
  }), [docs])

  const advancedActiveCount = [emissaoDe, emissaoAte, valorMin, valorMax].filter(Boolean).length
  const clearAdvanced = () => { setEmissaoDe(''); setEmissaoAte(''); setValorMin(''); setValorMax('') }

  const totals = useMemo(() => ({
    valor: filtered.reduce((s, d) => s + Number(d.valor_total ?? 0), 0),
    pago: filtered.reduce((s, d) => s + d.totPago, 0),
    saldo: filtered.reduce((s, d) => s + d.saldo, 0),
  }), [filtered])

  const allIds = filtered.map(d => d.id)

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = selection.count > 0
      ? filtered.filter(d => selection.isSelected(d.id))
      : filtered
    const headers = ['NF', 'Fornecedor', 'Valor NF', 'Emissão', 'Aplicada em', 'Total Parcelas', 'Total Pago', 'Saldo']
    const body = rows.map(d => [
      d.numero_doc ?? '',
      d.fornecedor_nome ?? '',
      Number(d.valor_total ?? 0).toFixed(2).replace('.', ','),
      d.data_emissao ?? '',
      d.applied_at ? new Date(d.applied_at).toLocaleDateString('pt-BR') : '',
      d.totValor.toFixed(2).replace('.', ','),
      d.totPago.toFixed(2).replace('.', ','),
      d.saldo.toFixed(2).replace('.', ','),
    ])
    const csv = [headers, ...body]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `central_notas_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} nota(s) exportada(s)`)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Search + Nova NF */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por NF# ou fornecedor…"
            className="w-full rounded-lg border bg-background pl-9 pr-8 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onProcessarNovaNF}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" /> Processar NF
        </button>
      </div>

      {/* Quick filters + advanced toggle */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(
          [
            { key: 'todas', label: 'Todas' },
            { key: 'a_pagar', label: 'A pagar' },
            { key: 'liquidadas', label: 'Liquidadas' },
            { key: 'sem_parcelas', label: 'Sem parcelas' },
          ] as Array<{ key: QuickFilter; label: string }>
        ).map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              quickFilter === f.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                quickFilter === f.key ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'
              }`}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}

        <button
          onClick={() => setShowAdvanced(v => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            showAdvanced || advancedActiveCount > 0
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filtros avançados
          {advancedActiveCount > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] leading-none font-bold">
              {advancedActiveCount}
            </span>
          )}
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="rounded-lg border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Emissão de</label>
            <input
              type="date"
              value={emissaoDe}
              onChange={e => setEmissaoDe(e.target.value)}
              className="w-full rounded border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Emissão até</label>
            <input
              type="date"
              value={emissaoAte}
              onChange={e => setEmissaoAte(e.target.value)}
              className="w-full rounded border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Valor mín. (R$)</label>
            <input
              type="number"
              value={valorMin}
              onChange={e => setValorMin(e.target.value)}
              placeholder="0"
              className="w-full rounded border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Valor máx. (R$)</label>
            <input
              type="number"
              value={valorMax}
              onChange={e => setValorMax(e.target.value)}
              placeholder="sem limite"
              className="w-full rounded border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          {advancedActiveCount > 0 && (
            <div className="col-span-full flex justify-end">
              <button
                onClick={clearAdvanced}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Limpar filtros avançados
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection action bar */}
      {selection.count > 0 && (
        <div className="rounded-lg border bg-muted/40 px-4 py-2.5 flex items-center gap-3 text-xs">
          <span className="font-semibold">{selection.count} selecionada(s)</span>
          <div className="flex-1" />
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 bg-background border hover:bg-muted font-medium"
          >
            <Download className="h-3.5 w-3.5" /> Exportar seleção
          </button>
          <button
            onClick={selection.clear}
            className="text-muted-foreground hover:text-foreground"
            title="Limpar seleção"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando notas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Nenhuma nota encontrada</p>
            {(search || quickFilter !== 'todas' || advancedActiveCount > 0) && (
              <p className="text-xs text-muted-foreground">Tente ajustar os filtros acima</p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={selection.count > 0 && selection.count === allIds.length}
                    ref={el => { if (el) el.indeterminate = selection.count > 0 && selection.count < allIds.length }}
                    onChange={() => selection.toggleAll(allIds)}
                    className="rounded cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 text-left">NF</th>
                <th className="py-2.5 px-3 text-left">Fornecedor</th>
                <th className="py-2.5 px-3 text-left">Emissão</th>
                <th className="py-2.5 px-3 text-left">Aplicada em</th>
                <th className="py-2.5 px-3 text-right">Valor NF</th>
                <th className="py-2.5 px-3 text-center">Situação das parcelas</th>
                <th className="py-2.5 px-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map(d => (
                <tr
                  key={d.id}
                  className="hover:bg-muted/10 cursor-pointer"
                  onClick={() => setSelectedDoc(d)}
                >
                  <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selection.isSelected(d.id)}
                      onChange={() => selection.toggle(d.id)}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-primary">
                    #{d.numero_doc ?? '?'}
                  </td>
                  <td className="py-2 px-3 max-w-[180px]">
                    <div className="truncate">{d.fornecedor_nome ?? '—'}</div>
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                    {d.data_emissao ?? '—'}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                    {d.applied_at ? new Date(d.applied_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    {d.valor_total != null ? formatCurrency(Number(d.valor_total)) : '—'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <ParcelasSummary doc={d} />
                  </td>
                  <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedDoc(d)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-blue-500/10 text-blue-600 font-medium"
                      title="Ver parcelas, rastreio e estornar"
                    >
                      <Eye className="h-3 w-3" /> Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20 text-[10px] text-muted-foreground">
                <td colSpan={5} className="py-2.5 px-3 font-medium">
                  {filtered.length} de {docs.length} nota(s)
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                  {formatCurrency(totals.valor)}
                </td>
                <td className="py-2.5 px-3 text-center space-x-2">
                  {totals.pago > 0.01 && (
                    <span className="text-emerald-700 font-mono">pago {formatCurrency(totals.pago)}</span>
                  )}
                  {totals.saldo > 0.01 && (
                    <span className="text-amber-700 font-mono">· saldo {formatCurrency(totals.saldo)}</span>
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Export all (sem seleção ativa) */}
      {!isLoading && filtered.length > 0 && selection.count === 0 && (
        <div className="flex justify-end">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Exportar {filtered.length} nota(s)
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selectedDoc && (
        <NFDetalheDrawer
          doc={selectedDoc}
          companyId={companyId}
          onClose={() => setSelectedDoc(null)}
          onEstornoSuccess={() => {
            setSelectedDoc(null)
            qc.invalidateQueries({ queryKey: ['central_notas', companyId] })
          }}
        />
      )}
    </div>
  )
}
