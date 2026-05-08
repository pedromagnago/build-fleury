/**
 * InconsistenciasTable — Lista plana de problemas detectados
 *
 * Renderiza os items achatados de useHealthChecks como uma tabela ordenada
 * por severidade × valor da divergencia. Filtros por severidade + regra +
 * busca de texto. Cada linha clicavel navega para a pagina relevante.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHealthChecks, type CheckSeverity } from '@/hooks/useHealthChecks'
import { useHealthSnapshots } from '@/hooks/useHealthSnapshots'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, XCircle, CheckCircle2, ExternalLink, Search, X, ChevronDown, Download, Eye, RefreshCw, Loader2 } from 'lucide-react'
import { PedidoDrilldownModal } from './PedidoDrilldownModal'
import { HealthTrendSparkline } from './HealthTrendSparkline'
import { regenerarParcelasDoPedido } from '@/lib/regenerarParcelasDoPedido'

const SEV: Record<CheckSeverity, { label: string; icon: typeof CheckCircle2; pill: string; row: string }> = {
  critical: {
    label: 'Crítico',
    icon: XCircle,
    pill: 'bg-red-500/15 text-red-600 border-red-500/30',
    row: 'border-l-red-500',
  },
  warn: {
    label: 'Atenção',
    icon: AlertTriangle,
    pill: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    row: 'border-l-amber-500',
  },
  ok: {
    label: 'OK',
    icon: CheckCircle2,
    pill: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    row: 'border-l-emerald-500',
  },
}

export function InconsistenciasTable() {
  const { flatItems, stats, checks, isLoading } = useHealthChecks()
  const { upsertToday } = useHealthSnapshots()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { currentCompany } = useProject()
  // Persiste o snapshot do dia 1x quando os checks terminam de calcular
  const snapshotedRef = useRef(false)
  useEffect(() => {
    if (isLoading || snapshotedRef.current || checks.length === 0) return
    snapshotedRef.current = true
    upsertToday(checks)
  }, [isLoading, checks, upsertToday])
  const [filterSev, setFilterSev] = useState<CheckSeverity | 'all'>('all')
  const [filterCheck, setFilterCheck] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [drilldownPedidoId, setDrilldownPedidoId] = useState<string | null>(null)
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null)

  const handleRegenerar = async (pedidoId: string, label: string) => {
    if (!currentCompany) return
    const ok = window.confirm(
      `Regenerar parcelas de "${label}"?\n\n` +
      `• Parcelas pagas/parcialmente pagas serão preservadas.\n` +
      `• Parcelas pendentes/vencidas serão recriadas com base em cond_pagamento + data_entrega.\n\n` +
      `Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setRegenerandoId(pedidoId)
    try {
      const r = await regenerarParcelasDoPedido(pedidoId, currentCompany.id)
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success(
        `${r.criadas} parcela(s) recriadas, ${r.deletadas} apagadas. ${r.pagasPreservadas} paga(s) preservada(s).`
      )
    } catch (err: any) {
      toast.error('Erro ao regenerar: ' + (err.message ?? String(err)))
    } finally {
      setRegenerandoId(null)
    }
  }

  // Regras em que faz sentido regenerar parcelas a partir do pedido.
  // 'pedido-cancelado-com-parcela' fica de fora: regenerar não resolve —
  // a ação correta é cancelar as parcelas pendentes ou reativar o pedido.
  const REGENERAVEIS = new Set(['parcelas-vs-pedido'])
  const [bulkRegenerando, setBulkRegenerando] = useState<{ done: number; total: number } | null>(null)

  const handleBulkRegenerar = async (items: typeof flatItems) => {
    if (!currentCompany) return
    const elegiveis = items.filter(it => it.pedidoId && REGENERAVEIS.has(it.checkId))
    if (elegiveis.length === 0) return
    const ok = window.confirm(
      `Regenerar parcelas de ${elegiveis.length} pedido(s) filtrado(s)?\n\n` +
      `• Parcelas pagas/parcialmente pagas serão preservadas.\n` +
      `• Parcelas pendentes/vencidas serão recriadas.\n\n` +
      `Processado em sequência. Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    setBulkRegenerando({ done: 0, total: elegiveis.length })
    let sucesso = 0
    let falha = 0
    for (let i = 0; i < elegiveis.length; i++) {
      const it = elegiveis[i]
      if (!it) continue
      try {
        await regenerarParcelasDoPedido(it.pedidoId!, currentCompany.id)
        sucesso++
      } catch (err) {
        console.error(`Falha ao regenerar ${it.label}:`, err)
        falha++
      }
      setBulkRegenerando({ done: i + 1, total: elegiveis.length })
    }
    qc.invalidateQueries({ queryKey: ['parcelas'] })
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    setBulkRegenerando(null)
    if (falha === 0) {
      toast.success(`${sucesso} pedido(s) regenerado(s) com sucesso.`)
    } else {
      toast.warning(`${sucesso} ok • ${falha} falharam (ver console).`)
    }
  }

  // Lista de regras com items para popular o dropdown
  const regrasComItems = useMemo(
    () => checks.filter(c => c.items.length > 0).map(c => ({ id: c.id, title: c.title, count: c.items.length })),
    [checks]
  )

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return flatItems.filter(it => {
      if (filterSev !== 'all' && it.severity !== filterSev) return false
      if (filterCheck !== 'all' && it.checkId !== filterCheck) return false
      if (q) {
        const hay = `${it.label} ${it.description} ${it.checkTitle}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [flatItems, filterSev, filterCheck, search])

  const totalValor = useMemo(
    () => filtrados.reduce((s, it) => s + (it.value ?? 0), 0),
    [filtrados]
  )

  const handleExportCSV = () => {
    const head = ['Severidade', 'Regra', 'Item', 'Detalhe', 'Valor']
    const escape = (v: unknown) => {
      const s = String(v ?? '')
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = filtrados.map(it => [
      SEV[it.severity].label,
      it.checkTitle,
      it.label,
      it.description,
      it.value != null ? it.value.toFixed(2).replace('.', ',') : '',
    ].map(escape).join(';'))
    const csv = '﻿' + [head.join(';'), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `inconsistencias-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-bold tracking-tight">Inconsistências detectadas</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium tabular-nums">
          {flatItems.length}
        </span>
        <div className="flex-1" />

        {/* Pills severidade */}
        <SevPill sev="critical" count={stats.critical} active={filterSev === 'critical'} onClick={() => setFilterSev(filterSev === 'critical' ? 'all' : 'critical')} />
        <SevPill sev="warn" count={stats.warn} active={filterSev === 'warn'} onClick={() => setFilterSev(filterSev === 'warn' ? 'all' : 'warn')} />

        {/* Filtro por regra */}
        <div className="relative">
          <select
            value={filterCheck}
            onChange={e => setFilterCheck(e.target.value)}
            className="appearance-none rounded-lg border bg-background pl-3 pr-7 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors max-w-[180px]"
          >
            <option value="all">Todas as regras</option>
            {regrasComItems.map(r => (
              <option key={r.id} value={r.id}>{r.title} ({r.count})</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar fornecedor, # pedido…"
            className="w-56 rounded-lg border bg-background pl-7 pr-7 py-1.5 text-[11px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Bulk Regenerar (só quando o filtro contém pedidos regeneráveis) */}
        {(() => {
          const elegiveis = filtrados.filter(it => it.pedidoId && REGENERAVEIS.has(it.checkId))
          if (elegiveis.length === 0) return null
          return (
            <button
              onClick={() => handleBulkRegenerar(filtrados)}
              disabled={bulkRegenerando !== null}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Regenerar parcelas de todos os pedidos visíveis (preserva pagas)"
            >
              {bulkRegenerando
                ? <><Loader2 className="h-3 w-3 animate-spin" />{bulkRegenerando.done}/{bulkRegenerando.total}</>
                : <><RefreshCw className="h-3 w-3" />Regenerar {elegiveis.length}</>}
            </button>
          )
        })()}

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          disabled={filtrados.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exportar lista filtrada em CSV"
        >
          <Download className="h-3 w-3" />
          CSV
        </button>
      </div>

      {/* Sparkline de tendência (so aparece com >= 2 snapshots) */}
      <HealthTrendSparkline />

      {/* Tabela */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          Carregando conferências…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium">
            {flatItems.length === 0 ? 'Nenhuma inconsistência detectada' : 'Nada encontrado nos filtros'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {flatItems.length === 0 ? 'Pedidos, parcelas, conciliação e medições estão coerentes.' : 'Ajuste a busca ou os filtros para ver problemas.'}
          </p>
        </div>
      ) : (
        <>
          <div className="max-h-[480px] overflow-y-auto scroll-visible">
            <table className="tbl-bf w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-[110px]">Severidade</th>
                  <th className="px-3 py-2 w-[170px]">Regra</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Detalhe</th>
                  <th className="px-3 py-2 text-right w-[120px]">Valor</th>
                  <th className="px-3 py-2 w-[90px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtrados.map((it, idx) => {
                  const cfg = SEV[it.severity]
                  const Icon = cfg.icon
                  return (
                    <tr
                      key={`${it.checkId}-${it.id}-${idx}`}
                      className={cn('group border-l-2 hover:bg-accent/30 transition-colors', cfg.row)}
                    >
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', cfg.pill)}>
                          <Icon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground truncate" title={it.checkTitle}>
                        {it.checkTitle}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium truncate" title={it.label}>
                        {it.label}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground truncate" title={it.description}>
                        {it.description}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                        {it.value != null && it.value > 0 ? formatCurrency(it.value) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {it.pedidoId && REGENERAVEIS.has(it.checkId) && (
                            <button
                              onClick={() => handleRegenerar(it.pedidoId!, it.label)}
                              disabled={regenerandoId === it.pedidoId}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                              title="Apaga parcelas pendentes e recria com base em cond_pagamento. Pagas são preservadas."
                            >
                              {regenerandoId === it.pedidoId
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Regenerar
                            </button>
                          )}
                          {it.pedidoId && (
                            <button
                              onClick={() => setDrilldownPedidoId(it.pedidoId!)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                              title="Drill-down do pedido"
                            >
                              <Eye className="h-3 w-3" />
                              Detalhar
                            </button>
                          )}
                          {it.route && (
                            <button
                              onClick={() => navigate(it.route!)}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold hover:bg-accent transition-colors"
                              title={it.routeLabel || 'Abrir'}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Página
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer com soma do que está visível */}
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-[11px]">
            <span className="text-muted-foreground">
              {filtrados.length} de {flatItems.length} problema(s)
            </span>
            <span className="font-semibold tabular-nums">
              Σ filtrado: {formatCurrency(totalValor)}
            </span>
          </div>
        </>
      )}

      {drilldownPedidoId && (
        <PedidoDrilldownModal
          pedidoId={drilldownPedidoId}
          onClose={() => setDrilldownPedidoId(null)}
        />
      )}
    </div>
  )
}

function SevPill({
  sev, count, active, onClick,
}: {
  sev: CheckSeverity
  count: number
  active: boolean
  onClick: () => void
}) {
  const cfg = SEV[sev]
  const Icon = cfg.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-all',
        active ? cfg.pill : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      <Icon className="h-3 w-3" />
      {count} {cfg.label}
    </button>
  )
}
