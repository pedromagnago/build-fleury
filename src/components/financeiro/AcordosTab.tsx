import { useState } from 'react'
import { useAcordos, useCancelarAcordo, type Acordo } from '@/hooks/useAcordos'
import { formatCurrency } from '@/lib/utils'
import { localDate } from '@/lib/parcelas'
import {
  Handshake, ChevronDown, ChevronRight, Ban, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react'

const acordoStatusCfg: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  ativo:     { label: 'Ativo',     color: 'bg-violet-500/10 text-violet-600', icon: Clock },
  quitado:   { label: 'Quitado',   color: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  cancelado: { label: 'Cancelado', color: 'bg-slate-500/10 text-slate-500', icon: Ban },
}

export default function AcordosTab() {
  const { data: acordos = [], isLoading } = useAcordos()
  const cancelarAcordo = useCancelarAcordo()
  const [expanded, setExpanded] = useState<string | null>(null)

  const visiveis = acordos.filter(a => a.status !== 'cancelado')
  const cancelados = acordos.filter(a => a.status === 'cancelado')
  const [mostrarCancelados, setMostrarCancelados] = useState(false)

  const handleCancelar = (a: Acordo) => {
    const pago = a.parcelas.reduce((s, p) => s + p.valor_pago, 0)
    if (pago > 0.005) {
      window.alert('Este acordo já tem pagamento registrado. Estorne as baixas das parcelas do acordo antes de cancelar.')
      return
    }
    if (!window.confirm(`Cancelar o acordo "${a.nome}"?\nAs parcelas do plano serão removidas e as ${a.origens.length} parcela(s) original(is) voltam ao fluxo.`)) return
    cancelarAcordo.mutate(a.id)
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
  }

  if (acordos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-muted-foreground">
        <Handshake className="mb-3 h-10 w-10 opacity-20" />
        <p className="text-sm font-medium">Nenhum acordo de renegociação</p>
        <p className="mt-1 max-w-md text-center text-xs">
          Para criar um: na aba Parcelas, selecione as parcelas em aberto que entraram no acordo
          (ex.: NFs da Multiplex) e use a ação <strong>Renegociar</strong> na barra inferior.
        </p>
      </div>
    )
  }

  const lista = mostrarCancelados ? [...visiveis, ...cancelados] : visiveis

  return (
    <div className="space-y-3">
      {cancelados.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setMostrarCancelados(v => !v)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {mostrarCancelados ? 'Ocultar cancelados' : `Mostrar cancelados (${cancelados.length})`}
          </button>
        </div>
      )}

      {lista.map(a => {
        const pago = a.parcelas.reduce((s, p) => s + Math.min(p.valor_pago, p.valor), 0)
        const pct = a.valor_total > 0 ? Math.min(100, (pago / a.valor_total) * 100) : 0
        const cfg = acordoStatusCfg[a.status] ?? acordoStatusCfg.ativo!
        const today = new Date().toISOString().split('T')[0]!
        const vencidas = a.status === 'ativo'
          ? a.parcelas.filter(p => p.status !== 'paga' && (p.data_prevista_pagamento ?? p.data_vencimento) < today).length
          : 0
        const isOpen = expanded === a.id
        return (
          <div key={a.id} className="rounded-xl border bg-card">
            <div className="flex items-center gap-3 p-4">
              <button onClick={() => setExpanded(isOpen ? null : a.id)} className="shrink-0 text-muted-foreground">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                <Handshake className="h-4 w-4 text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{a.nome}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${cfg.color}`}>
                    <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
                  </span>
                  {vencidas > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-500">
                      <AlertTriangle className="h-2.5 w-2.5" />{vencidas} vencida(s)
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.fornecedor_nome ?? 'Sem fornecedor'} · firmado em {localDate(a.data_acordo).toLocaleDateString('pt-BR')} ·{' '}
                  {a.origens.length} parcela(s) original(is) → {a.parcelas.length} no plano
                </p>
                {a.status !== 'cancelado' && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                      {formatCurrency(pago)} / {formatCurrency(a.valor_total)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                )}
              </div>
              {a.status === 'ativo' && (
                <button onClick={() => handleCancelar(a)} disabled={cancelarAcordo.isPending}
                  className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                  title="Cancelar acordo e restaurar as parcelas originais">
                  Cancelar acordo
                </button>
              )}
            </div>

            {isOpen && (
              <div className="grid gap-4 border-t p-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cronograma do acordo</p>
                  <table className="tbl-bf w-full text-[11px]">
                    <thead>
                      <tr className="text-[9px] uppercase text-muted-foreground">
                        <th className="py-1 text-left">#</th>
                        <th className="py-1 text-center">Vencimento</th>
                        <th className="py-1 text-right">Valor</th>
                        <th className="py-1 text-right">Pago</th>
                        <th className="py-1 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {a.parcelas.map(p => (
                        <tr key={p.id}>
                          <td className="py-1.5">{p.numero_parcela}/{a.parcelas.length}</td>
                          <td className="py-1.5 text-center">{localDate(p.data_vencimento).toLocaleDateString('pt-BR')}</td>
                          <td className="py-1.5 text-right font-medium">{formatCurrency(p.valor)}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{formatCurrency(p.valor_pago)}</td>
                          <td className="py-1.5 text-center">
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${
                              p.status === 'paga' ? 'bg-emerald-500/10 text-emerald-600'
                              : p.status === 'parcialmente_paga' ? 'bg-blue-500/10 text-blue-500'
                              : (p.data_prevista_pagamento ?? p.data_vencimento) < today && a.status === 'ativo' ? 'bg-red-500/10 text-red-500'
                              : 'bg-amber-500/10 text-amber-600'
                            }`}>{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Baixas e conciliação: as parcelas do plano aparecem na aba Parcelas e na Conciliação como qualquer outra.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Parcelas originais renegociadas</p>
                  <table className="tbl-bf w-full text-[11px]">
                    <thead>
                      <tr className="text-[9px] uppercase text-muted-foreground">
                        <th className="py-1 text-left">Parcela</th>
                        <th className="py-1 text-right">Valor</th>
                        <th className="py-1 text-right">Pago antes</th>
                        <th className="py-1 text-right">Saldo levado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {a.origens.map(o => (
                        <tr key={o.id}>
                          <td className="py-1.5 truncate max-w-[200px]">
                            P{o.parcela?.numero_parcela ?? '?'} — {(o.parcela?.descricao ?? 'parcela original').slice(0, 40)}
                          </td>
                          <td className="py-1.5 text-right">{formatCurrency(Number(o.parcela?.valor ?? 0))}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{formatCurrency(Number(o.parcela?.valor_pago ?? 0))}</td>
                          <td className="py-1.5 text-right font-semibold">{formatCurrency(o.valor_renegociado)}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="py-1.5" colSpan={3}>Total renegociado</td>
                        <td className="py-1.5 text-right text-violet-600">
                          {formatCurrency(a.origens.reduce((s, o) => s + o.valor_renegociado, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {a.observacoes && (
                    <p className="mt-2 rounded-lg bg-muted/30 p-2 text-[10px] text-muted-foreground">{a.observacoes}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
