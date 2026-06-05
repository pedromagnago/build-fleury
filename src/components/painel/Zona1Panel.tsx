/**
 * Zona1Panel — Topo do Painel de Controle.
 * Mostra saldo de caixa, projeção, alertas críticos, pendências e
 * próximos vencimentos em 7 dias. É o ponto de entrada de qualquer
 * sessão de trabalho — cada alerta leva diretamente à origem.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Wallet, TrendingDown, TrendingUp, Scale,
  CalendarClock, CalendarCheck,
} from 'lucide-react'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useSaldoContas } from '@/hooks/useFinanceiro'
import { useMedicoes } from '@/hooks/useOperacional'
import { formatCurrency } from '@/lib/utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SaldoCard({
  icon: Icon, label, value, sublabel, tone, link,
}: {
  icon: typeof Wallet
  label: string
  value: number
  sublabel?: string
  tone: 'default' | 'success' | 'danger' | 'warning'
  link?: string
}) {
  const bg = {
    default:  'border-border bg-card',
    success:  'border-emerald-500/30 bg-emerald-500/5',
    danger:   'border-red-500/30 bg-red-500/5',
    warning:  'border-amber-500/30 bg-amber-500/5',
  }[tone]
  const iconColor = {
    default:  'text-muted-foreground',
    success:  'text-emerald-600',
    danger:   'text-red-600',
    warning:  'text-amber-600',
  }[tone]
  const valueColor = {
    default:  '',
    success:  'text-emerald-700 dark:text-emerald-400',
    danger:   'text-red-600 dark:text-red-400',
    warning:  'text-amber-700 dark:text-amber-400',
  }[tone]

  const content = (
    <div className={`rounded-xl border p-4 ${bg} ${link ? 'hover:brightness-95 transition-all cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>
            {formatCurrency(value)}
          </div>
          {sublabel && <div className="mt-1 text-[11px] text-muted-foreground">{sublabel}</div>}
        </div>
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
      </div>
    </div>
  )

  return link ? <Link to={link}>{content}</Link> : content
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Zona1Panel() {
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const saldosContas = useSaldoContas()

  const today = todayISO()
  const in7   = addDays(today, 7)
  const in30  = addDays(today, 30)

  // ─── Saldo e projeção ──────────────────────────────────────────────────────
  const { saldoAtual, aPagar30d, aReceber30d, posicaoLiquida30d, vencimentos7d } = useMemo(() => {
    const saldoAtual = saldosContas.reduce((s, c) => s + c.saldo_sistema, 0)

    const parcelasAbertas = parcelas.filter(p =>
      p.status !== 'paga' && !((p as any).deleted_at)
    )

    const aPagar30d = parcelasAbertas
      .filter(p => {
        const dt = p.data_prevista_pagamento ?? p.data_vencimento
        return dt >= today && dt <= in30
      })
      .reduce((s, p) => s + Math.max(0, (Number(p.valor) || 0) - (Number(p.valor_pago) || 0)), 0)

    // Entradas: medições liberadas ou em medição com data_prevista próxima
    const aReceber30d = medicoes
      .filter(m => m.status !== 'paga' && m.data_prevista >= today && m.data_prevista <= in30)
      .reduce((s, m) => s + (Number(m.valor_liberado) || Number(m.valor_planejado) || 0), 0)

    const posicaoLiquida30d = saldoAtual + aReceber30d - aPagar30d

    // Vencimentos nos próximos 7 dias
    const saidas = parcelasAbertas
      .filter(p => {
        const dt = p.data_prevista_pagamento ?? p.data_vencimento
        return dt >= today && dt <= in7
      })
      .sort((a, b) => {
        const da = a.data_prevista_pagamento ?? a.data_vencimento
        const db = b.data_prevista_pagamento ?? b.data_vencimento
        return da.localeCompare(db)
      })
      .slice(0, 8)

    const entradas = medicoes
      .filter(m => m.status !== 'paga' && m.data_prevista >= today && m.data_prevista <= in7)
      .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
      .slice(0, 8)

    return { saldoAtual, aPagar30d, aReceber30d, posicaoLiquida30d, vencimentos7d: { saidas, entradas } }
  }, [saldosContas, parcelas, medicoes, today, in7, in30])

  const posicaoTone = posicaoLiquida30d >= 0 ? 'success' : 'danger'

  return (
    <div className="space-y-4">

      {/* ─── Saldo e Projeção ─── */}
      <div>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Caixa & Projeção 30 dias
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <SaldoCard
            icon={Wallet}
            label="Saldo Atual"
            value={saldoAtual}
            sublabel={`${saldosContas.length} conta${saldosContas.length !== 1 ? 's' : ''}`}
            tone="default"
            link="/conciliacao"
          />
          <SaldoCard
            icon={TrendingUp}
            label="A Receber — 30 dias"
            value={aReceber30d}
            sublabel="medições previstas"
            tone={aReceber30d > 0 ? 'success' : 'default'}
            link="/recebimentos"
          />
          <SaldoCard
            icon={TrendingDown}
            label="A Pagar — 30 dias"
            value={aPagar30d}
            sublabel={`${vencimentos7d.saidas.length} vence em 7 dias`}
            tone={aPagar30d > saldoAtual ? 'warning' : 'default'}
            link="/pagamentos"
          />
          <SaldoCard
            icon={Scale}
            label="Posição Líquida — 30d"
            value={posicaoLiquida30d}
            sublabel={posicaoLiquida30d < 0 ? 'déficit projetado' : 'caixa suficiente'}
            tone={posicaoTone}
          />
        </div>
      </div>

      {/* ─── Próximos Vencimentos (7 dias) ─── */}
      {(vencimentos7d.saidas.length > 0 || vencimentos7d.entradas.length > 0) && (
        <div>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Próximos vencimentos — 7 dias
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {/* Saídas */}
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border-b border-red-300/30">
                <CalendarClock className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                  Saídas — {vencimentos7d.saidas.length} parcela{vencimentos7d.saidas.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-xs font-bold tabular-nums text-red-700 dark:text-red-400">
                  {formatCurrency(vencimentos7d.saidas.reduce((s, p) =>
                    s + Math.max(0, (Number(p.valor) || 0) - (Number(p.valor_pago) || 0)), 0))}
                </span>
              </div>
              {vencimentos7d.saidas.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum vencimento</div>
              ) : (
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border/40">
                    {vencimentos7d.saidas.map(p => {
                      const dt = p.data_prevista_pagamento ?? p.data_vencimento
                      const saldo = Math.max(0, (Number(p.valor) || 0) - (Number(p.valor_pago) || 0))
                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium tabular-nums w-12">{fmtDate(dt)}</td>
                          <td className="px-2 py-2 text-muted-foreground truncate max-w-[140px]">
                            {(p as any).fornecedor_nome ?? (p as any).pedido_item ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(saldo)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <div className="px-3 py-1.5 border-t bg-muted/20">
                <Link to="/pagamentos" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  Ver todos os pagamentos <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
            </div>

            {/* Entradas */}
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border-b border-emerald-300/30">
                <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Entradas previstas — {vencimentos7d.entradas.length} medição{vencimentos7d.entradas.length !== 1 ? 'ões' : ''}
                </span>
                <span className="ml-auto text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(vencimentos7d.entradas.reduce((s, m) =>
                    s + (Number(m.valor_liberado) || Number(m.valor_planejado) || 0), 0))}
                </span>
              </div>
              {vencimentos7d.entradas.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Nenhuma medição prevista para os próximos 7 dias
                </div>
              ) : (
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border/40">
                    {vencimentos7d.entradas.map(m => (
                      <tr key={m.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium tabular-nums w-12">{fmtDate(m.data_prevista)}</td>
                        <td className="px-2 py-2 text-muted-foreground truncate max-w-[140px]">
                          Medição {m.numero}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(Number(m.valor_liberado) || Number(m.valor_planejado) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="px-3 py-1.5 border-t bg-muted/20">
                <Link to="/recebimentos" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  Ver todos os recebimentos <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
