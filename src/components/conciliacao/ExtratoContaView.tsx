/**
 * Build Fleury — Visão "Extrato da Conta" (estilo Omie)
 *
 * Tabela linha-a-linha com Situação, Data, Cliente/Fornecedor, Categoria, Valor,
 * Saldo e Saldo Previsto. Consolida movimentos bancários + parcelas pagas sem
 * extrato (registradas manualmente) para uma visão completa da conta.
 *
 * Entradas (mútuos, medições, recebimentos) aparecem como linhas verdes positivas,
 * saídas como linhas vermelhas. Cada linha tem ações contextuais de conciliação.
 */
import { useState, useMemo } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Plus,
  Link as LinkIcon, Search, ChevronRight,
} from 'lucide-react'
import { useConciliacoes } from '@/hooks/useConciliacao'
import { useContasBancarias, useParcelas } from '@/hooks/useFinanceiro'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { formatCurrency } from '@/lib/utils'
import { NovoLancamentoDialog } from './NovoLancamentoDialog'
import { ReconciliationSidePanel } from './ReconciliationSidePanel'
import { useQueryClient } from '@tanstack/react-query'

type Situacao = 'conciliado' | 'nao_conciliado' | 'sugerido' | 'atrasado' | 'manual'

interface ExtratoRow {
  id: string
  origem: 'movimento' | 'parcela_fantasma'
  situacao: Situacao
  data: string
  descricao: string
  fornecedor: string | null
  categoria: string | null
  valor: number
  tipo: 'entrada' | 'saida'
  saldo_acumulado: number | null
  conta_id: string
  conciliacao_id?: string | null
  parcela_id?: string | null
  conciliado: boolean
  is_manual?: boolean
  raw: any
}

function fmtDateBr(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${(y ?? '').slice(2)}`
}

function situacaoBadge(s: Situacao) {
  switch (s) {
    case 'conciliado': return { Icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-600', label: 'Conciliado' }
    case 'sugerido': return { Icon: AlertTriangle, cls: 'bg-blue-500/10 text-blue-600', label: 'Sugerido' }
    case 'nao_conciliado': return { Icon: XCircle, cls: 'bg-red-500/10 text-red-600', label: 'Não Conciliado' }
    case 'atrasado': return { Icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-600', label: 'Atrasado' }
    case 'manual': return { Icon: LinkIcon, cls: 'bg-purple-500/10 text-purple-600', label: 'Manual' }
  }
}

export function ExtratoContaView() {
  const { data: contas = [] } = useContasBancarias()
  const { data: movs = [] } = useMovimentacoes()
  const { data: parcelas = [] } = useParcelas()
  const { data: concs = [] } = useConciliacoes()
  const qc = useQueryClient()

  // contaId pode ser '__all__' para visao consolidada (somar todas as ativas)
  const [contaId, setContaId] = useState<string>(() => contas[0]?.id ?? '')
  const [periodDays, setPeriodDays] = useState(30)
  const [filterSituacao, setFilterSituacao] = useState<Situacao | 'todos'>('todos')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [search, setSearch] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [selectedRow, setSelectedRow] = useState<any | null>(null)

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['conciliacoes'] })
    qc.invalidateQueries({ queryKey: ['movimentacoes'] })
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['conciliacao_history'] })
  }

  const isAllContas = contaId === '__all__'
  const contaAtiva = isAllContas ? null : (contas.find(c => c.id === contaId) ?? contas[0] ?? null)
  const effectiveContaId = contaAtiva?.id ?? ''
  const selectedContaIds = useMemo<Set<string>>(() => {
    if (isAllContas) return new Set((contas as any[]).filter(c => c.ativa).map((c: any) => c.id as string))
    return new Set(effectiveContaId ? [effectiveContaId] : [])
  }, [isAllContas, contas, effectiveContaId])
  const saldoInicialBase = useMemo(() => {
    if (isAllContas) return (contas as any[]).filter(c => c.ativa).reduce((s, c: any) => s + Number(c.saldo_inicial || 0), 0)
    return contaAtiva?.saldo_inicial ?? 0
  }, [isAllContas, contas, contaAtiva])

  const cutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - periodDays)
    return d.toISOString().split('T')[0]!
  }, [periodDays])

  const concByMovId = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of concs) {
      if (c.status !== 'rejeitado') m.set(c.movimentacao_id, c)
    }
    return m
  }, [concs])

  const confirmedParcelaIds = useMemo(() => {
    const s = new Set<string>()
    for (const c of concs) {
      if (c.status === 'confirmado') {
        for (const l of ((c as any).conciliacao_parcelas ?? [])) s.add(l.parcela_id)
      }
    }
    return s
  }, [concs])

  const rows: ExtratoRow[] = useMemo(() => {
    if (selectedContaIds.size === 0) return []
    const result: ExtratoRow[] = []
    const today = new Date().toISOString().split('T')[0]!

    // Movimentos bancários das contas selecionadas no período
    for (const m of (movs as any[]).filter((x: any) => selectedContaIds.has(x.conta_id) && x.data >= cutoff)) {
      const conc = concByMovId.get(m.id)
      let situacao: Situacao
      if (m.origem === 'manual' && !conc) situacao = 'manual'
      else if (m.conciliado) situacao = 'conciliado'
      else if (conc && conc.status === 'sugerido') situacao = 'sugerido'
      else situacao = 'nao_conciliado'

      const link = conc?.conciliacao_parcelas?.[0]
      const parcela = link ? parcelas.find(p => p.id === link.parcela_id) : null

      result.push({
        id: `mov-${m.id}`,
        origem: 'movimento',
        situacao,
        data: m.data,
        descricao: m.descricao,
        fornecedor: (parcela as any)?.fornecedor_nome ?? null,
        categoria: m.categoria ?? null,
        valor: Number(m.valor),
        tipo: m.tipo,
        saldo_acumulado: m.saldo_acumulado != null ? Number(m.saldo_acumulado) : null,
        conta_id: m.conta_id,
        conciliacao_id: conc?.id ?? null,
        parcela_id: link?.parcela_id ?? null,
        conciliado: m.conciliado,
        is_manual: m.origem === 'manual',
        raw: m,
      })
    }

    // Parcelas pagas das contas selecionadas sem movimento bancário (fantasmas)
    const parcelasDaConta = parcelas.filter((p: any) =>
      p.conta_bancaria_id && selectedContaIds.has(p.conta_bancaria_id) &&
      (p.status === 'paga' || p.status === 'parcialmente_paga') &&
      !confirmedParcelaIds.has(p.id) &&
      p.data_pagamento_real &&
      p.data_pagamento_real >= cutoff
    )
    for (const p of parcelasDaConta) {
      const vencida = p.data_vencimento < today
      result.push({
        id: `parc-${p.id}`,
        origem: 'parcela_fantasma',
        situacao: vencida ? 'atrasado' : 'nao_conciliado',
        data: p.data_pagamento_real!,
        descricao: p.pedido_item ?? p.descricao ?? `Parcela ${p.numero_parcela}`,
        fornecedor: null,
        // Explica a origem: parcela paga direto (Pagamentos > Pagar) sem vínculo com mov bancária.
        categoria: 'Pagamento registrado fora do extrato (baixa manual)',
        valor: Number(p.valor_pago),
        tipo: p.pedido_id ? 'saida' : 'saida',
        saldo_acumulado: null,
        conta_id: (p as any).conta_bancaria_id,
        parcela_id: p.id,
        conciliado: false,
        raw: p,
      })
    }

    result.sort((a, b) => a.data.localeCompare(b.data))

    // Calcular saldo previsto corrido
    let saldoCorrente = saldoInicialBase
    // Adicionar movs anteriores ao período
    for (const m of (movs as any[]).filter((x: any) => selectedContaIds.has(x.conta_id) && x.data < cutoff)) {
      saldoCorrente += m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)
    }

    return result
  }, [selectedContaIds, movs, parcelas, concByMovId, confirmedParcelaIds, cutoff, saldoInicialBase])

  // Filtros
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows.filter(r => {
      if (filterSituacao !== 'todos' && r.situacao !== filterSituacao) return false
      if (filterTipo !== 'todos' && r.tipo !== filterTipo) return false
      if (q && !r.descricao.toLowerCase().includes(q) && !String(r.valor).includes(q)) return false
      return true
    })
  }, [rows, filterSituacao, filterTipo, search])

  // Saldo previsto com base nas linhas filtradas, dia a dia
  const withSaldo = useMemo(() => {
    let saldo = saldoInicialBase
    for (const m of (movs as any[]).filter((x: any) => selectedContaIds.has(x.conta_id) && x.data < cutoff)) {
      saldo += m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)
    }
    return filtered.map(r => {
      saldo += r.tipo === 'entrada' ? r.valor : -r.valor
      return { ...r, saldo_previsto: saldo }
    })
  }, [filtered, saldoInicialBase, movs, selectedContaIds, cutoff])

  // Totalizadores
  const totais = useMemo(() => {
    const conciliados = rows.filter(r => r.conciliado)
      .reduce((s, r) => s + (r.tipo === 'entrada' ? r.valor : -r.valor), 0)
    const total = rows.reduce((s, r) => s + (r.tipo === 'entrada' ? r.valor : -r.valor), 0)
    return {
      saldo_conciliado: saldoInicialBase + conciliados,
      saldo_atual: saldoInicialBase + total,
      saldo_previsto: saldoInicialBase + total,
    }
  }, [rows, saldoInicialBase])

  const counts = useMemo(() => {
    const c = { todos: rows.length, conciliado: 0, nao_conciliado: 0, sugerido: 0, atrasado: 0, manual: 0 }
    for (const r of rows) c[r.situacao]++
    return c
  }, [rows])

  if (contas.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm">Cadastre uma conta bancária primeiro.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header de conta + ações */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">Conta</label>
          <select value={isAllContas ? '__all__' : effectiveContaId} onChange={(e) => setContaId(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-xs font-semibold">
            <option value="__all__">📊 Todas as contas (consolidado)</option>
            {contas.filter(c => c.ativa).map(c => <option key={c.id} value={c.id}>{c.nome} {c.banco ? `· ${c.banco}` : ''}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">Período</label>
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1.5 text-xs">
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={180}>Últimos 6 meses</option>
            <option value={365}>Último ano</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição ou valor..."
            className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-xs" />
        </div>

        <button onClick={() => setShowNovo(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
          <Plus className="h-3.5 w-3.5" />Novo Lançamento
        </button>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border bg-card p-0.5 text-[11px]">
          {(['todos', 'conciliado', 'sugerido', 'nao_conciliado', 'atrasado', 'manual'] as const).map(s => (
            <button key={s} onClick={() => setFilterSituacao(s)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                filterSituacao === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}>
              {s === 'todos' ? 'Todos' :
                s === 'conciliado' ? 'Conciliados' :
                s === 'sugerido' ? 'Sugeridos' :
                s === 'nao_conciliado' ? 'Não Concil.' :
                s === 'atrasado' ? 'Atrasados' : 'Manuais'}
              <span className="rounded-full bg-background/30 px-1 text-[9px] font-bold">
                {counts[s === 'todos' ? 'todos' : s]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border bg-card p-0.5 text-[11px]">
          {(['todos', 'entrada', 'saida'] as const).map(t => (
            <button key={t} onClick={() => setFilterTipo(t)}
              className={`rounded-md px-2 py-1 font-medium transition-colors ${
                filterTipo === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}>
              {t === 'todos' ? 'Todos' : t === 'entrada' ? '↓ Entradas' : '↑ Saídas'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela estilo Omie */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="tbl-bf w-full text-xs">
            <thead className="sticky top-0 bg-muted z-10">
              <tr>
                <th className="px-2 py-2 text-left font-bold">Situação</th>
                <th className="px-2 py-2 text-left font-bold">Data</th>
                <th className="px-2 py-2 text-left font-bold">Descrição</th>
                <th className="px-2 py-2 text-left font-bold">Categoria</th>
                <th className="px-2 py-2 text-right font-bold">Valor (R$)</th>
                <th className="px-2 py-2 text-right font-bold">Saldo (R$)</th>
                <th className="px-2 py-2 text-right font-bold">Saldo Previsto</th>
                <th className="px-2 py-2 text-center font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Saldo anterior */}
              <tr className="bg-emerald-500/5 font-bold">
                <td colSpan={4} className="px-2 py-1.5 text-[11px]">SALDO INICIAL</td>
                <td className="px-2 py-1.5 text-right tabular-nums">—</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(saldoInicialBase)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(saldoInicialBase)}</td>
                <td></td>
              </tr>

              {withSaldo.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                    Nenhum movimento encontrado no período
                  </td>
                </tr>
              )}

              {withSaldo.map(r => {
                const badge = situacaoBadge(r.situacao)
                const isEntrada = r.tipo === 'entrada'
                const isSelected = selectedRow?.id === r.id
                return (
                  <tr key={r.id} onClick={() => setSelectedRow(r)}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${
                      isSelected ? 'bg-primary/10 hover:bg-primary/15' :
                      r.origem === 'parcela_fantasma' ? 'bg-amber-500/5' :
                      r.is_manual ? 'bg-purple-500/5' : ''
                    }`}>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        <badge.Icon className="h-2.5 w-2.5" />{badge.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fmtDateBr(r.data)}</td>
                    <td className="px-2 py-1.5 max-w-[260px] truncate" title={r.descricao}>
                      <div className="flex items-center gap-1">
                        {isEntrada ? <span className="text-emerald-500">↓</span> : <span className="text-red-500">↑</span>}
                        <span>{r.descricao}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[160px] truncate" title={r.categoria ?? '—'}>
                      {r.categoria ?? '—'}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold tabular-nums ${
                      isEntrada ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {isEntrada ? '+' : '−'}{formatCurrency(r.valor)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.saldo_acumulado != null ? formatCurrency(r.saldo_acumulado) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatCurrency((r as any).saldo_previsto)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé com totais estilo Omie */}
        <div className="grid grid-cols-3 gap-3 border-t bg-muted/30 p-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Saldo Conciliado</p>
            <p className="text-lg font-bold tabular-nums text-emerald-600">{formatCurrency(totais.saldo_conciliado)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Saldo Atual</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totais.saldo_atual)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Saldo Previsto</p>
            <p className="text-lg font-bold tabular-nums text-blue-600">{formatCurrency(totais.saldo_previsto)}</p>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500/40" />Linha amarela: parcela paga sem extrato</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500/40" />Linha roxa: lançamento manual</span>
        <span>↓ Entrada · ↑ Saída</span>
      </div>

      {/* Painel lateral de conciliação */}
      <ReconciliationSidePanel
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onRefresh={handleRefresh}
      />

      {/* Dialog novo lançamento manual */}
      {showNovo && (
        <NovoLancamentoDialog defaultContaId={effectiveContaId || (contas.find(c => c.ativa)?.id ?? '')} onClose={() => setShowNovo(false)} />
      )}
    </div>
  )
}
