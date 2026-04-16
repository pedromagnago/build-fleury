/**
 * ConferenciaPedidos — Conferência de Pedidos × Cronograma
 *
 * Visão de planilha: itens em linhas, quinzenas de medição como colunas.
 * Cada célula mostra se o pedido será entregue antes do início da medição.
 */

import { useState, useMemo } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, AlertCircle,
  Calendar, CreditCard, Package, Loader2, X, Building2,
} from 'lucide-react'
import {
  useTabelaConformidade,
  useAtualizarPedidoConformidade,
  type LinhaTabela,
  type TabelaConformidade,
} from '@/hooks/usePedidos'
import { gerarParcelas, localDate, parsearCondicao } from '@/lib/parcelas'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function fmtDateFull(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Célula de status por medição ─────────────────────────────────────────────

function CelulaStatus({
  cell, onClick,
}: {
  cell: { dias_folga: number | null; status: string } | undefined
  onClick?: () => void
}) {
  if (!cell) {
    return <td className="px-2 py-2 text-center text-[11px] text-muted-foreground/40 border-l border-border/50">—</td>
  }

  if (cell.status === 'sem_pedido') {
    return (
      <td className="px-2 py-2 text-center border-l border-border/50">
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-muted text-[10px] font-bold text-muted-foreground">
          <AlertCircle className="h-3 w-3" />Sem pedido
        </span>
      </td>
    )
  }

  const sign = (cell.dias_folga ?? 0) >= 0 ? '+' : ''
  const cls =
    cell.status === 'ok'    ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20' :
    cell.status === 'risco' ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20' :
                              'bg-red-500/10 text-red-700 hover:bg-red-500/20'
  const Icon =
    cell.status === 'ok'    ? CheckCircle2 :
    cell.status === 'risco' ? AlertTriangle : XCircle

  return (
    <td className="px-2 py-2 text-center border-l border-border/50">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${cls}`}
        title="Clique para ajustar"
      >
        <Icon className="h-3 w-3" />{sign}{cell.dias_folga}d
      </button>
    </td>
  )
}

// ─── Modal de edição ──────────────────────────────────────────────────────────

function EditModal({
  linha, medicaoNumero, medicaoDataInicio,
  onClose,
}: {
  linha: LinhaTabela
  medicaoNumero: number
  medicaoDataInicio: string
  onClose: () => void
}) {
  const atualizar = useAtualizarPedidoConformidade()
  const [novaData, setNovaData] = useState(linha.data_entrega_prevista ?? '')
  const [novaCond, setNovaCond] = useState(linha.condicao_pagamento)

  const dirty = novaData !== (linha.data_entrega_prevista ?? '') || novaCond !== linha.condicao_pagamento

  const preview = useMemo(() => {
    if (linha.valor_total <= 0 || !novaData) return []
    const dias = parsearCondicao(novaCond)
    if (dias.length === 0) return []
    try {
      return gerarParcelas({
        pedidoId:      linha.pedido_id ?? '',
        companyId:     '',
        valorTotal:    linha.valor_total,
        condPagamento: novaCond,
        dataEntrega:   localDate(novaData),
      })
    } catch { return [] }
  }, [novaData, novaCond, linha.pedido_id, linha.valor_total])

  const previewDias = useMemo(() => {
    if (!novaData || !medicaoDataInicio) return null
    return Math.round((localDate(medicaoDataInicio).getTime() - localDate(novaData).getTime()) / 86_400_000)
  }, [novaData, medicaoDataInicio])

  const previewStatus =
    previewDias === null ? null :
    previewDias >= 0 ? 'ok' : previewDias >= -7 ? 'risco' : 'critico'

  async function handleSalvar() {
    if (!dirty || !linha.pedido_id) { onClose(); return }
    await atualizar.mutateAsync({
      pedido_id:           linha.pedido_id,
      valor_total:         linha.valor_total,
      nova_data_entrega:   novaData !== (linha.data_entrega_prevista ?? '') ? novaData : undefined,
      nova_cond_pagamento: novaCond !== linha.condicao_pagamento           ? novaCond : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-xl bg-card border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b bg-muted/30">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ajuste de Pedido
            </p>
            <p className="text-sm font-semibold text-foreground leading-snug mt-0.5">
              {linha.item_descricao}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Medição M{medicaoNumero} · início {fmtDateFull(medicaoDataInicio)}
              {linha.numero_pedido != null && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  P-{linha.numero_pedido}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Preview badge */}
          {dirty && previewStatus && previewDias !== null && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
              previewStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-700' :
              previewStatus === 'risco' ? 'bg-amber-500/10 text-amber-700' :
              'bg-red-500/10 text-red-700'
            }`}>
              {previewStatus === 'ok' ? <CheckCircle2 className="h-4 w-4" /> :
               previewStatus === 'risco' ? <AlertTriangle className="h-4 w-4" /> :
               <XCircle className="h-4 w-4" />}
              Novo status: {previewStatus === 'ok' ? 'OK' : previewStatus === 'risco' ? 'Risco' : 'Crítico'}
              {' · '}{previewDias >= 0 ? '+' : ''}{previewDias}d de folga
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3 w-3" /> Data de Entrega
              </label>
              <input
                type="date" value={novaData}
                onChange={e => setNovaData(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {novaData !== (linha.data_entrega_prevista ?? '') && linha.data_entrega_prevista && (
                <p className="mt-1 text-[10px] text-amber-600">Antes: {fmtDateFull(linha.data_entrega_prevista)}</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CreditCard className="h-3 w-3" /> Condição de Pgto
              </label>
              <input
                type="text" value={novaCond}
                onChange={e => setNovaCond(e.target.value)}
                placeholder="Ex: 30/60/90"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {novaCond !== linha.condicao_pagamento && (
                <p className="mt-1 text-[10px] text-amber-600">Antes: {linha.condicao_pagamento || '—'}</p>
              )}
            </div>
          </div>

          {/* Parcelas preview */}
          {preview.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Parcelas recalculadas ({preview.length})
              </p>
              <div className="overflow-hidden rounded-lg border bg-background divide-y max-h-40 overflow-y-auto">
                {preview.map(p => (
                  <div key={p.numero_parcela} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[11px] text-muted-foreground">Parcela {p.numero_parcela}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-[11px] font-bold tabular-nums">{fmtBRL(p.valor)}</span>
                      <span className="text-[11px] text-muted-foreground">venc. {fmtDateFull(p.data_vencimento)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {linha.valor_total <= 0 && (
            <p className="text-[11px] text-amber-600">Valor total não informado — parcelas não recalculadas.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/20">
          <button
            onClick={onClose}
            disabled={atualizar.isPending}
            className="rounded-md border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={atualizar.isPending || !dirty || !linha.pedido_id}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {atualizar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar Ajustes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Filtro = 'todos' | 'atencao'

export function ConferenciaPedidos({ search = '' }: { search?: string }) {
  const { data, isLoading } = useTabelaConformidade()
  const [filtro, setFiltro] = useState<Filtro>('atencao')
  const [editState, setEditState] = useState<{
    linha: LinhaTabela
    medicaoNumero: number
    medicaoDataInicio: string
  } | null>(null)

  // Aggregated totals
  const totais = useMemo(() => {
    if (!data) return { ok: 0, risco: 0, critico: 0, sem_pedido: 0 }
    let ok = 0, risco = 0, critico = 0, sem_pedido = 0
    for (const l of data.linhas) {
      for (const cell of Object.values(l.por_medicao)) {
        if (!cell) continue
        if (cell.status === 'ok')        ok++
        else if (cell.status === 'risco') risco++
        else if (cell.status === 'critico') critico++
        else if (cell.status === 'sem_pedido') sem_pedido++
      }
    }
    return { ok, risco, critico, sem_pedido }
  }, [data])

  const linhasFiltradas = useMemo(() => {
    if (!data) return []
    let l = data.linhas

    if (filtro === 'atencao') {
      l = l.filter(linha =>
        Object.values(linha.por_medicao).some(c => c && c.status !== 'ok')
      )
    }

    if (search.trim()) {
      const s = search.toLowerCase()
      l = l.filter(ln =>
        ln.item_descricao.toLowerCase().includes(s) ||
        ln.etapa_nome.toLowerCase().includes(s) ||
        ln.etapa_codigo.toLowerCase().includes(s) ||
        ln.fornecedor_nome.toLowerCase().includes(s) ||
        String(ln.numero_pedido ?? '').includes(s)
      )
    }
    return l
  }, [data, filtro, search])

  // Group by etapa (preserving sort order)
  const grupos = useMemo(() => {
    const map = new Map<string, { etapa_nome: string; etapa_codigo: string; linhas: LinhaTabela[] }>()
    for (const linha of linhasFiltradas) {
      const ex = map.get(linha.etapa_id)
      if (!ex) map.set(linha.etapa_id, { etapa_nome: linha.etapa_nome, etapa_codigo: linha.etapa_codigo, linhas: [linha] })
      else ex.linhas.push(linha)
    }
    return Array.from(map.values())
  }, [linhasFiltradas])

  const atencaoCount = useMemo(() =>
    (data?.linhas ?? []).filter(l =>
      Object.values(l.por_medicao).some(c => c && c.status !== 'ok')
    ).length,
    [data]
  )

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Carregando conformidade...</span>
    </div>
  )

  if (!data || data.linhas.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <Package className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Nenhum dado encontrado.</p>
      <p className="text-xs opacity-70">Configure o cronograma de distribuição e adicione itens de compra nas etapas.</p>
    </div>
  )

  return (
    <div className="space-y-3">

      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />{totais.ok} OK
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />{totais.risco} Risco
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-700">
          <XCircle className="h-3.5 w-3.5" />{totais.critico} Crítico
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />{totais.sem_pedido} Sem pedido
        </span>

        <div className="ml-auto flex gap-1 rounded-lg border bg-card p-1">
          <button
            onClick={() => setFiltro('atencao')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              filtro === 'atencao'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Com atenção ({atencaoCount})
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              filtro === 'todos'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos ({data.linhas.length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse">

            {/* Header */}
            <thead>
              <tr className="bg-muted/50 border-b">
                {/* Fixed left columns */}
                <th className="sticky left-0 z-20 bg-muted/50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[260px]">
                  Etapa · Item
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[130px]">
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />Fornecedor</span>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[80px]">
                  <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />Cond.</span>
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[100px]">
                  Valor
                </th>
                <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[90px]">
                  <span className="flex items-center justify-center gap-1"><Calendar className="h-3 w-3" />Entrega</span>
                </th>

                {/* Dynamic medição columns */}
                {data.colunas.map(col => {
                  const isSoon = col.dias_ate_inicio >= 0 && col.dias_ate_inicio <= 14
                  const isPast = col.dias_ate_inicio < 0
                  return (
                    <th
                      key={col.numero}
                      className={`px-3 py-2.5 text-center border-l border-border/50 min-w-[110px] ${
                        isSoon ? 'bg-amber-500/10' : isPast ? 'bg-muted/30' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-[11px] font-black ${
                          isSoon ? 'text-amber-700' : isPast ? 'text-muted-foreground' : 'text-primary'
                        }`}>
                          M{col.numero}
                        </span>
                        <span className="text-[9px] font-medium text-muted-foreground tabular-nums">
                          {fmtDate(col.data_inicio)}{col.data_fim ? `–${fmtDate(col.data_fim)}` : ''}
                        </span>
                        <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                          isSoon ? 'bg-amber-500/20 text-amber-700' :
                          isPast ? 'bg-muted text-muted-foreground' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {isPast
                            ? `${Math.abs(col.dias_ate_inicio)}d atrás`
                            : col.dias_ate_inicio === 0 ? 'hoje'
                            : `em ${col.dias_ate_inicio}d`}
                        </span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y">
              {grupos.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + data.colunas.length}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                    Todos os itens estão em conformidade.
                  </td>
                </tr>
              ) : (
                grupos.map(grupo => (
                  <>
                    {/* Etapa header row */}
                    <tr key={`etapa-${grupo.etapa_codigo}`} className="bg-muted/20 border-y border-border/60">
                      <td
                        colSpan={5 + data.colunas.length}
                        className="sticky left-0 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary font-mono">
                            {grupo.etapa_codigo}
                          </span>
                          <span className="text-xs font-bold text-foreground">{grupo.etapa_nome}</span>
                          <span className="text-[10px] text-muted-foreground">{grupo.linhas.length} item{grupo.linhas.length !== 1 ? 's' : ''}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Item rows */}
                    {grupo.linhas.map(linha => {
                      const hasProblem = Object.values(linha.por_medicao).some(c => c && c.status !== 'ok')
                      return (
                        <tr
                          key={`${linha.etapa_id}-${linha.item_id}-${linha.pedido_id ?? 'sem'}`}
                          className={`transition-colors hover:bg-muted/30 ${hasProblem ? '' : ''}`}
                        >
                          {/* Item */}
                          <td className="sticky left-0 z-10 bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground leading-snug truncate max-w-[240px]" title={linha.item_descricao}>
                                {linha.item_descricao}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {linha.item_codigo && (
                                  <span className="text-[10px] text-muted-foreground font-mono">{linha.item_codigo}</span>
                                )}
                                {linha.numero_pedido != null && (
                                  <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">
                                    P-{linha.numero_pedido}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Fornecedor */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-foreground truncate max-w-[120px] block" title={linha.fornecedor_nome}>
                              {linha.fornecedor_nome}
                            </span>
                          </td>

                          {/* Condição */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {linha.condicao_pagamento || '—'}
                            </span>
                          </td>

                          {/* Valor */}
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-xs font-semibold tabular-nums">
                              {linha.valor_total > 0 ? fmtBRL(linha.valor_total) : '—'}
                            </span>
                          </td>

                          {/* Data entrega */}
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {fmtDateFull(linha.data_entrega_prevista)}
                            </span>
                          </td>

                          {/* Medição cells */}
                          {data.colunas.map(col => {
                            const cell = linha.por_medicao[col.numero]
                            return (
                              <CelulaStatus
                                key={col.numero}
                                cell={cell}
                                onClick={linha.pedido_id && cell && cell.status !== 'sem_pedido'
                                  ? () => setEditState({ linha, medicaoNumero: col.numero, medicaoDataInicio: col.data_inicio })
                                  : undefined
                                }
                              />
                            )
                          })}
                        </tr>
                      )
                    })}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editState && (
        <EditModal
          linha={editState.linha}
          medicaoNumero={editState.medicaoNumero}
          medicaoDataInicio={editState.medicaoDataInicio}
          onClose={() => setEditState(null)}
        />
      )}
    </div>
  )
}
