/**
 * Build Fleury — Composição do Saldo por Conta Bancária
 *
 * Decompõe o saldo: Inicial + Entradas Conciliadas − Saídas Conciliadas = Saldo Sistema,
 * comparado ao Saldo Extrato. Lista as origens da diferença para facilitar a investigação.
 */
import { useState, useMemo } from 'react'
import {
  Scale, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Wallet, ChevronDown, ChevronRight, Calendar, ArrowRight,
} from 'lucide-react'
import { useContasBancarias, useParcelas } from '@/hooks/useFinanceiro'
import { useMovimentacoes } from '@/hooks/useOperacional'
import { useConciliacoes } from '@/hooks/useConciliacao'
import { formatCurrency } from '@/lib/utils'

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function monthKey(d: string): string {
  return d.substring(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${names[parseInt(m!) - 1]}/${y!.slice(2)}`
}

interface ComposicaoPorConta {
  conta_id: string
  conta_nome: string
  banco: string | null
  saldo_inicial: number
  entradas_conciliadas: number
  saidas_conciliadas: number
  entradas_pendentes: number
  saidas_pendentes: number
  saldo_sistema: number
  saldo_extrato: number | null
  diferenca: number | null
  movs_pendentes: any[]
  parcelas_pagas_sem_mov: any[]
  timeline: { month: string; saldo_fim: number; entradas: number; saidas: number }[]
}

function useComposicaoSaldos(periodDays: number = 90): ComposicaoPorConta[] {
  const { data: contas = [] } = useContasBancarias()
  const { data: movs = [] } = useMovimentacoes()
  const { data: parcelas = [] } = useParcelas()
  const { data: concs = [] } = useConciliacoes()

  return useMemo(() => {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - periodDays)
    const cutoff = cutoffDate.toISOString().split('T')[0]!

    const confirmedMovIds = new Set(
      concs.filter((c: any) => c.status === 'confirmado').map((c: any) => c.movimentacao_id)
    )

    return contas.map(conta => {
      const contaMovs = (movs as any[]).filter((m: any) => m.conta_id === conta.id)
      const inPeriod = contaMovs.filter((m: any) => m.data >= cutoff)

      const entradas_conciliadas = contaMovs
        .filter((m: any) => m.tipo === 'entrada' && m.conciliado)
        .reduce((s, m: any) => s + Number(m.valor), 0)
      const saidas_conciliadas = contaMovs
        .filter((m: any) => m.tipo === 'saida' && m.conciliado)
        .reduce((s, m: any) => s + Number(m.valor), 0)
      const entradas_pendentes = contaMovs
        .filter((m: any) => m.tipo === 'entrada' && !m.conciliado)
        .reduce((s, m: any) => s + Number(m.valor), 0)
      const saidas_pendentes = contaMovs
        .filter((m: any) => m.tipo === 'saida' && !m.conciliado)
        .reduce((s, m: any) => s + Number(m.valor), 0)

      const saldo_sistema = conta.saldo_inicial
        + entradas_conciliadas - saidas_conciliadas
        + entradas_pendentes - saidas_pendentes

      const lastMov = contaMovs
        .filter((m: any) => m.saldo_acumulado != null && Number(m.saldo_acumulado) !== 0)
        .sort((a: any, b: any) => (b.data ?? '').localeCompare(a.data ?? ''))[0]
      const saldo_extrato = lastMov ? Number((lastMov as any).saldo_acumulado) : null
      const diferenca = saldo_extrato != null ? saldo_sistema - saldo_extrato : null

      const movs_pendentes = contaMovs
        .filter((m: any) => !m.conciliado)
        .sort((a: any, b: any) => (b.data ?? '').localeCompare(a.data ?? ''))

      const parcelasConfirmadasIds = new Set<string>()
      for (const c of (concs as any[])) {
        if (c.status === 'confirmado') {
          for (const l of (c.conciliacao_parcelas ?? [])) {
            parcelasConfirmadasIds.add(l.parcela_id)
          }
        }
      }

      const parcelas_pagas_sem_mov = (parcelas as any[])
        .filter((p: any) =>
          (p.status === 'paga' || p.status === 'parcialmente_paga') &&
          p.conta_bancaria_id === conta.id &&
          !parcelasConfirmadasIds.has(p.id)
        )
        .sort((a: any, b: any) => (b.data_pagamento_real ?? '').localeCompare(a.data_pagamento_real ?? ''))

      const timelineMap = new Map<string, { entradas: number; saidas: number }>()
      for (const m of inPeriod) {
        const key = monthKey(m.data)
        const cur = timelineMap.get(key) ?? { entradas: 0, saidas: 0 }
        if (m.tipo === 'entrada') cur.entradas += Number(m.valor)
        else cur.saidas += Number(m.valor)
        timelineMap.set(key, cur)
      }
      const monthsSorted = Array.from(timelineMap.keys()).sort()

      const baseBefore = contaMovs
        .filter((m: any) => m.data < cutoff)
        .reduce((s, m: any) => s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0)
      let running = conta.saldo_inicial + baseBefore
      const timeline = monthsSorted.map(month => {
        const v = timelineMap.get(month)!
        running += v.entradas - v.saidas
        return { month, saldo_fim: running, entradas: v.entradas, saidas: v.saidas }
      })

      return {
        conta_id: conta.id,
        conta_nome: conta.nome,
        banco: conta.banco,
        saldo_inicial: conta.saldo_inicial,
        entradas_conciliadas,
        saidas_conciliadas,
        entradas_pendentes,
        saidas_pendentes,
        saldo_sistema,
        saldo_extrato,
        diferenca,
        movs_pendentes,
        parcelas_pagas_sem_mov,
        timeline,
      }
    })
  }, [contas, movs, parcelas, concs, periodDays])
}

function ComposicaoLine({ label, value, sign, color, icon: Icon }: {
  label: string; value: number; sign?: '+' | '−' | '='; color?: string; icon?: any
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {sign && <span className={`text-sm font-bold ${color ?? 'text-muted-foreground'}`}>{sign}</span>}
        {Icon && <Icon className={`h-3.5 w-3.5 ${color ?? 'text-muted-foreground'}`} />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${color ?? ''}`}>{formatCurrency(value)}</span>
    </div>
  )
}

function TimelineChart({ timeline }: { timeline: ComposicaoPorConta['timeline'] }) {
  if (timeline.length === 0) return null
  const maxAbs = Math.max(...timeline.map(t => Math.max(t.entradas, t.saidas)), 1)
  return (
    <div className="mt-3 space-y-1.5">
      {timeline.map(t => {
        const entPct = (t.entradas / maxAbs) * 100
        const saiPct = (t.saidas / maxAbs) * 100
        return (
          <div key={t.month} className="grid grid-cols-[50px_1fr_1fr_90px] gap-2 items-center text-[10px]">
            <span className="font-medium text-muted-foreground">{monthLabel(t.month)}</span>
            <div className="flex justify-end">
              <div className="h-3 rounded-l bg-emerald-500/70" style={{ width: `${entPct}%` }}
                title={`Entradas: ${formatCurrency(t.entradas)}`} />
            </div>
            <div className="flex justify-start">
              <div className="h-3 rounded-r bg-red-500/70" style={{ width: `${saiPct}%` }}
                title={`Saídas: ${formatCurrency(t.saidas)}`} />
            </div>
            <span className="text-right font-mono font-semibold">{formatCurrency(t.saldo_fim)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ContaCard({ c }: { c: ComposicaoPorConta }) {
  const [expanded, setExpanded] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)

  const conciliado = c.diferenca != null && Math.abs(c.diferenca) < 0.01
  const diffColor = c.diferenca == null ? 'text-muted-foreground' :
    conciliado ? 'text-emerald-600' : 'text-red-600'
  const diffBg = c.diferenca == null ? 'bg-muted/50' :
    conciliado ? 'bg-emerald-500/10' : 'bg-red-500/10'

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-bold">{c.conta_nome}</p>
            <p className="text-[10px] text-muted-foreground">{c.banco ?? 'Sem banco'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sistema</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(c.saldo_sistema)}</p>
          </div>
          {c.saldo_extrato != null && (
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Extrato</p>
              <p className="text-sm font-bold tabular-nums">{formatCurrency(c.saldo_extrato)}</p>
            </div>
          )}
          <div className={`rounded-lg px-2.5 py-1.5 ${diffBg}`}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Diferença</p>
            <p className={`text-sm font-bold tabular-nums ${diffColor}`}>
              {c.diferenca != null ? formatCurrency(c.diferenca) : '—'}
            </p>
          </div>
          {conciliado ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> :
            <AlertTriangle className="h-5 w-5 text-amber-500" />}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-4">
          {/* Composição matemática */}
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Composição do Saldo Sistema
            </p>
            <div className="divide-y">
              <ComposicaoLine label="Saldo Inicial" value={c.saldo_inicial} icon={Wallet} />
              <ComposicaoLine label="Entradas Conciliadas" value={c.entradas_conciliadas}
                sign="+" color="text-emerald-600" icon={TrendingUp} />
              <ComposicaoLine label="Saídas Conciliadas" value={c.saidas_conciliadas}
                sign="−" color="text-red-500" icon={TrendingDown} />
              <ComposicaoLine label="Entradas Pendentes" value={c.entradas_pendentes}
                sign="+" color="text-amber-600" icon={TrendingUp} />
              <ComposicaoLine label="Saídas Pendentes" value={c.saidas_pendentes}
                sign="−" color="text-amber-600" icon={TrendingDown} />
              <div className="pt-2">
                <ComposicaoLine label="Saldo Sistema" value={c.saldo_sistema}
                  sign="=" color="text-foreground font-bold" icon={Scale} />
              </div>
            </div>
          </div>

          {/* Diferença explicada */}
          {c.diferenca != null && !conciliado && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <button onClick={() => setShowDiff(v => !v)}
                className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">
                    Diferença de {formatCurrency(Math.abs(c.diferenca))} — clique para investigar
                  </span>
                </div>
                {showDiff ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {showDiff && (
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-md bg-card p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">
                      {c.movs_pendentes.length} movs no extrato sem match
                    </p>
                    <div className="max-h-48 overflow-auto divide-y">
                      {c.movs_pendentes.slice(0, 20).map((m: any) => (
                        <div key={m.id} className="flex justify-between py-1 text-[11px]">
                          <span className="truncate max-w-[180px]" title={m.descricao}>
                            {fmtDate(m.data)} · {m.descricao}
                          </span>
                          <span className={`font-mono font-semibold tabular-nums ${
                            m.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {m.tipo === 'entrada' ? '+' : '−'}{formatCurrency(Number(m.valor))}
                          </span>
                        </div>
                      ))}
                      {c.movs_pendentes.length > 20 && (
                        <p className="pt-1 text-[10px] text-muted-foreground">
                          +{c.movs_pendentes.length - 20} movs...
                        </p>
                      )}
                      {c.movs_pendentes.length === 0 && (
                        <p className="py-2 text-[10px] text-muted-foreground">Nenhum</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md bg-card p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">
                      {c.parcelas_pagas_sem_mov.length} parcelas pagas sem extrato
                    </p>
                    <div className="max-h-48 overflow-auto divide-y">
                      {c.parcelas_pagas_sem_mov.slice(0, 20).map((p: any) => (
                        <div key={p.id} className="flex justify-between py-1 text-[11px]">
                          <span className="truncate max-w-[180px]" title={p.pedido_item ?? p.descricao}>
                            {fmtDate(p.data_pagamento_real)} · {p.pedido_item ?? p.descricao ?? 'Parcela'}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-red-500">
                            −{formatCurrency(Number(p.valor_pago))}
                          </span>
                        </div>
                      ))}
                      {c.parcelas_pagas_sem_mov.length > 20 && (
                        <p className="pt-1 text-[10px] text-muted-foreground">
                          +{c.parcelas_pagas_sem_mov.length - 20} parcelas...
                        </p>
                      )}
                      {c.parcelas_pagas_sem_mov.length === 0 && (
                        <p className="py-2 text-[10px] text-muted-foreground">Nenhuma</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          {c.timeline.length > 0 && (
            <div className="rounded-lg bg-muted/30 p-3">
              <button onClick={() => setShowTimeline(v => !v)}
                className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold">Evolução mensal ({c.timeline.length} meses)</span>
                </div>
                {showTimeline ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {showTimeline && <TimelineChart timeline={c.timeline} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SaldoComposicao() {
  const [periodDays, setPeriodDays] = useState(90)
  const contas = useComposicaoSaldos(periodDays)

  const totalSistema = contas.reduce((s, c) => s + c.saldo_sistema, 0)
  const totalExtrato = contas.reduce((s, c) => s + (c.saldo_extrato ?? 0), 0)
  const totalDiferenca = contas.filter(c => c.diferenca != null)
    .reduce((s, c) => s + c.diferenca!, 0)
  const contasOk = contas.filter(c => c.diferenca != null && Math.abs(c.diferenca) < 0.01).length
  const contasComDiferenca = contas.filter(c => c.diferenca != null && Math.abs(c.diferenca) >= 0.01).length

  if (contas.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Nenhuma conta bancária cadastrada</p>
        <p className="text-xs text-muted-foreground mt-1">
          Cadastre contas em Pagamentos → Contas Bancárias para ver a composição do saldo
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header com totais e filtro */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-3 flex-wrap">
          <div className="rounded-lg border bg-card px-4 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saldo Sistema Total</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totalSistema)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saldo Extrato Total</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totalExtrato)}</p>
          </div>
          <div className={`rounded-lg border px-4 py-2 ${
            Math.abs(totalDiferenca) < 0.01 ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-red-500/5 border-red-500/30'
          }`}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Diferença Total</p>
            <p className={`text-lg font-bold tabular-nums ${
              Math.abs(totalDiferenca) < 0.01 ? 'text-emerald-600' : 'text-red-600'
            }`}>{formatCurrency(totalDiferenca)}</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Status</p>
            <p className="text-xs font-bold">
              <span className="text-emerald-600">{contasOk} ok</span>
              {contasComDiferenca > 0 && <span className="text-red-600"> · {contasComDiferenca} c/ diferença</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Timeline:</label>
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-xs">
            <option value={30}>Último mês</option>
            <option value={90}>3 meses</option>
            <option value={180}>6 meses</option>
            <option value={365}>1 ano</option>
          </select>
        </div>
      </div>

      {/* Cards expansíveis por conta */}
      <div className="space-y-3">
        {contas.map(c => <ContaCard key={c.conta_id} c={c} />)}
      </div>

      {/* Ajuda */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
        <p className="text-xs text-blue-700 flex items-center gap-2">
          <ArrowRight className="h-3 w-3" />
          <strong>Diferença = Saldo Sistema − Saldo Extrato.</strong> Expanda uma conta com diferença para ver
          movs sem match e parcelas pagas não conciliadas — estas explicam o desvio.
        </p>
      </div>
    </div>
  )
}
