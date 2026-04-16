/**
 * ConferenciaPedidos — Conferência de Pedidos × Cronograma
 * Visão agrupada: Medição → Etapa → Pedidos
 *
 * Para cada medição no cronograma mostra as etapas envolvidas e se os pedidos
 * relacionados terão entrega antes do início da quinzena de medição.
 */

import { useState, useMemo } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, AlertCircle,
  ChevronDown, ChevronRight, Calendar, CreditCard,
  Package, Loader2, Building2, ShoppingCart,
} from 'lucide-react'
import {
  useMedicoesConformidade,
  useAtualizarPedidoConformidade,
  type MedicaoConformidade,
  type EtapaConformidade,
  type PedidoEmEtapa,
} from '@/hooks/usePedidos'
import { gerarParcelas, localDate, parsearCondicao } from '@/lib/parcelas'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Shared sub-components ────────────────────────────────────────────────────

type ConformStatus = 'ok' | 'risco' | 'critico' | 'sem_pedidos'

function FolgaBadge({ dias, status }: { dias: number; status: 'ok' | 'risco' | 'critico' }) {
  const sign = dias >= 0 ? '+' : ''
  const cls =
    status === 'ok'    ? 'bg-emerald-500/10 text-emerald-700' :
    status === 'risco' ? 'bg-amber-500/10 text-amber-700' :
                         'bg-red-500/10 text-red-700'
  const Icon =
    status === 'ok'    ? CheckCircle2 :
    status === 'risco' ? AlertTriangle : XCircle
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      <Icon className="h-3 w-3" />{sign}{dias}d
    </span>
  )
}

function StatusIcon({ status, size = 'sm' }: { status: ConformStatus; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
  if (status === 'ok')      return <CheckCircle2 className={`${sz} text-emerald-500`} />
  if (status === 'risco')   return <AlertTriangle className={`${sz} text-amber-500`} />
  if (status === 'critico') return <XCircle className={`${sz} text-red-500`} />
  return <AlertCircle className={`${sz} text-muted-foreground`} />
}

// ─── PainelInline ─────────────────────────────────────────────────────────────

function PainelInline({
  item, medicaoNumero, medicaoDataInicio, onClose,
}: {
  item: PedidoEmEtapa
  medicaoNumero: number
  medicaoDataInicio: string
  onClose: () => void
}) {
  const atualizar = useAtualizarPedidoConformidade()
  const [novaData, setNovaData] = useState(item.data_entrega_prevista)
  const [novaCond, setNovaCond] = useState(item.condicao_pagamento)

  const dirty = novaData !== item.data_entrega_prevista || novaCond !== item.condicao_pagamento

  const preview = useMemo(() => {
    if (item.valor_total <= 0 || !novaData) return []
    const dias = parsearCondicao(novaCond)
    if (dias.length === 0) return []
    try {
      return gerarParcelas({
        pedidoId:      item.pedido_id,
        companyId:     '',
        valorTotal:    item.valor_total,
        condPagamento: novaCond,
        dataEntrega:   localDate(novaData),
      })
    } catch {
      return []
    }
  }, [novaData, novaCond, item.pedido_id, item.valor_total])

  const previewDias = useMemo(() => {
    if (!novaData) return item.dias_folga
    return Math.round(
      (localDate(medicaoDataInicio).getTime() - localDate(novaData).getTime()) / 86_400_000
    )
  }, [novaData, medicaoDataInicio, item.dias_folga])

  const previewStatus: 'ok' | 'risco' | 'critico' =
    previewDias >= 0 ? 'ok' : previewDias >= -7 ? 'risco' : 'critico'

  async function handleSalvar() {
    if (!dirty) { onClose(); return }
    await atualizar.mutateAsync({
      pedido_id:           item.pedido_id,
      valor_total:         item.valor_total,
      nova_data_entrega:   novaData !== item.data_entrega_prevista ? novaData : undefined,
      nova_cond_pagamento: novaCond !== item.condicao_pagamento    ? novaCond : undefined,
    })
    onClose()
  }

  return (
    <div className="border-t bg-muted/30 px-4 py-5 animate-in slide-in-from-top-1 duration-150">
      <div className="mx-auto max-w-2xl space-y-4">

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ajuste de Pedido · {item.item_descricao}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Medição alvo:{' '}
              <span className="font-semibold text-foreground">M{medicaoNumero}</span>
              {' · '}Início:{' '}
              <span className="font-semibold text-foreground">{fmtDate(medicaoDataInicio)}</span>
            </p>
          </div>
          {dirty && <FolgaBadge status={previewStatus} dias={previewDias} />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3 w-3" /> Data de Entrega
            </label>
            <input
              type="date" value={novaData}
              onChange={e => setNovaData(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {novaData !== item.data_entrega_prevista && (
              <p className="mt-1 text-[10px] text-amber-600">Antes: {fmtDate(item.data_entrega_prevista)}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="h-3 w-3" /> Condição de Pagamento
            </label>
            <input
              type="text" value={novaCond}
              onChange={e => setNovaCond(e.target.value)}
              placeholder="Ex: 30/60/90"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {novaCond !== item.condicao_pagamento && (
              <p className="mt-1 text-[10px] text-amber-600">Antes: {item.condicao_pagamento || '—'}</p>
            )}
          </div>
        </div>

        {preview.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Parcelas recalculadas ({preview.length})
            </p>
            <div className="overflow-hidden rounded-lg border bg-card divide-y">
              {preview.map(p => (
                <div key={p.numero_parcela} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-muted-foreground">Parcela {p.numero_parcela}</span>
                  <div className="flex items-center gap-6 text-right">
                    <span className="text-xs font-bold tabular-nums">{fmtBRL(p.valor)}</span>
                    <span className="text-xs text-muted-foreground">venc. {fmtDate(p.data_vencimento)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.valor_total <= 0 && (
          <p className="text-[11px] text-amber-600">
            Valor total não informado — parcelas não serão recalculadas.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={atualizar.isPending}
            className="rounded-md border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={atualizar.isPending || !dirty}
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

// ─── EtapaSection ─────────────────────────────────────────────────────────────

function EtapaSection({
  etapa, medicaoNumero, medicaoDataInicio,
  isExpanded, onToggle, editingKey, onEdit, onCloseEdit,
}: {
  etapa: EtapaConformidade
  medicaoNumero: number
  medicaoDataInicio: string
  isExpanded: boolean
  onToggle: () => void
  editingKey: string | null
  onEdit: (key: string) => void
  onCloseEdit: () => void
}) {
  const sg = etapa.status_geral

  const borderCls =
    sg === 'critico'     ? 'border-red-200 dark:border-red-900' :
    sg === 'risco'       ? 'border-amber-200 dark:border-amber-900' :
    sg === 'sem_pedidos' ? 'border-slate-200 dark:border-slate-700' :
                           'border-emerald-200 dark:border-emerald-900'

  const headerAccent =
    sg === 'critico'     ? 'border-l-2 border-l-red-400' :
    sg === 'risco'       ? 'border-l-2 border-l-amber-400' :
    sg === 'sem_pedidos' ? 'border-l-2 border-l-slate-300' :
                           'border-l-2 border-l-emerald-400'

  return (
    <div className={`overflow-hidden rounded-lg border bg-card ${borderCls}`}>
      {/* Etapa header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${headerAccent}`}
      >
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />
          }
        </span>

        <StatusIcon status={sg} size="md" />

        <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground font-mono">
          {etapa.etapa_codigo}
        </span>

        <span className="flex-1 text-sm font-semibold text-foreground truncate" title={etapa.etapa_nome}>
          {etapa.etapa_nome}
        </span>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          {sg === 'sem_pedidos' ? (
            <span className="text-[10px] font-semibold text-muted-foreground italic">Sem pedidos</span>
          ) : (
            <>
              {etapa.counts.critico > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  <XCircle className="h-3 w-3" />{etapa.counts.critico}
                </span>
              )}
              {etapa.counts.risco > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  <AlertTriangle className="h-3 w-3" />{etapa.counts.risco}
                </span>
              )}
              {etapa.counts.ok > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />{etapa.counts.ok}
                </span>
              )}
            </>
          )}
        </div>
      </button>

      {/* Pedidos list */}
      {isExpanded && (
        <div className="divide-y border-t">
          {etapa.pedidos.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-3 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 opacity-40 flex-shrink-0" />
              Nenhum pedido cadastrado para esta etapa.
            </div>
          ) : (
            etapa.pedidos.map(ped => {
              const k = `${ped.pedido_id}-${medicaoNumero}`
              const isEditing = editingKey === k
              return (
                <div key={k}>
                  <div className={`flex items-center gap-3 px-6 py-3 transition-colors ${isEditing ? 'bg-muted/50' : 'hover:bg-muted/20'}`}>
                    {/* Item + supplier */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate" title={ped.item_descricao}>
                          {ped.item_descricao}
                        </span>
                        {ped.item_codigo && (
                          <span className="text-[10px] text-muted-foreground">({ped.item_codigo})</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                        {ped.numero_pedido != null && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                            P-{ped.numero_pedido}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Building2 className="h-3 w-3" />{ped.fornecedor_nome}
                        </span>
                      </div>
                    </div>

                    {/* Delivery date */}
                    <div className="flex-shrink-0 text-right hidden sm:block">
                      <p className="text-[10px] text-muted-foreground">Entrega</p>
                      <p className="text-xs font-medium tabular-nums">{fmtDate(ped.data_entrega_prevista)}</p>
                    </div>

                    {/* Folga badge */}
                    <FolgaBadge status={ped.status_conformidade} dias={ped.dias_folga} />

                    {/* Ajustar button */}
                    <button
                      onClick={() => isEditing ? onCloseEdit() : onEdit(k)}
                      className={`flex-shrink-0 rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors ${
                        isEditing
                          ? 'bg-muted text-muted-foreground'
                          : 'border hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {isEditing ? 'Fechar' : 'Ajustar'}
                    </button>
                  </div>

                  {isEditing && (
                    <PainelInline
                      item={ped}
                      medicaoNumero={medicaoNumero}
                      medicaoDataInicio={medicaoDataInicio}
                      onClose={onCloseEdit}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── MedicaoCard ──────────────────────────────────────────────────────────────

function MedicaoCard({
  med, expandedEtapas, onToggleEtapa, editingKey, onEdit, onCloseEdit,
}: {
  med: MedicaoConformidade
  expandedEtapas: Set<string>
  onToggleEtapa: (key: string) => void
  editingKey: string | null
  onEdit: (key: string) => void
  onCloseEdit: () => void
}) {
  const sg = med.status_geral

  const borderCls =
    sg === 'critico'     ? 'border-red-300 dark:border-red-800' :
    sg === 'risco'       ? 'border-amber-300 dark:border-amber-800' :
    sg === 'sem_pedidos' ? 'border-slate-200 dark:border-slate-700' :
                           'border-emerald-300 dark:border-emerald-800'

  const headerBg =
    sg === 'critico'     ? 'bg-red-500/5' :
    sg === 'risco'       ? 'bg-amber-500/5' :
    sg === 'sem_pedidos' ? 'bg-muted/30' : 'bg-emerald-500/5'

  const diasLabel =
    med.dias_ate_inicio > 1  ? `em ${med.dias_ate_inicio} dias` :
    med.dias_ate_inicio === 1 ? 'amanhã' :
    med.dias_ate_inicio === 0 ? 'hoje' :
    `iniciou há ${Math.abs(med.dias_ate_inicio)}d`

  const diasChipCls =
    med.dias_ate_inicio >= 0 && med.dias_ate_inicio <= 7
      ? 'bg-amber-500/10 text-amber-700'
      : med.dias_ate_inicio < 0
        ? 'bg-muted text-muted-foreground'
        : 'bg-primary/10 text-primary'

  return (
    <div className={`overflow-hidden rounded-xl border ${borderCls}`}>
      {/* Medição header */}
      <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${headerBg}`}>
        <StatusIcon status={sg} size="md" />

        <span className="flex-shrink-0 rounded-md bg-primary px-2.5 py-0.5 text-[12px] font-black text-primary-foreground">
          M{med.medicao_numero}
        </span>

        <span className="text-sm font-semibold text-foreground">
          {fmtDate(med.data_inicio)}
          {med.data_fim && <span className="text-muted-foreground font-normal"> – {fmtDate(med.data_fim)}</span>}
        </span>

        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${diasChipCls}`}>
          {diasLabel}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {med.counts.critico > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
              <XCircle className="h-3 w-3" />{med.counts.critico} crítico{med.counts.critico !== 1 ? 's' : ''}
            </span>
          )}
          {med.counts.risco > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              <AlertTriangle className="h-3 w-3" />{med.counts.risco} risco
            </span>
          )}
          {med.counts.sem_pedidos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              <AlertCircle className="h-3 w-3" />{med.counts.sem_pedidos} sem pedido{med.counts.sem_pedidos !== 1 ? 's' : ''}
            </span>
          )}
          {sg === 'ok' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Tudo ok
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {med.etapas.length} etapa{med.etapas.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Etapas */}
      <div className="flex flex-col gap-2 p-3">
        {med.etapas.map(etapa => {
          const etapaKey = `${med.medicao_numero}-${etapa.etapa_id}`
          return (
            <EtapaSection
              key={etapaKey}
              etapa={etapa}
              medicaoNumero={med.medicao_numero}
              medicaoDataInicio={med.data_inicio}
              isExpanded={expandedEtapas.has(etapaKey)}
              onToggle={() => onToggleEtapa(etapaKey)}
              editingKey={editingKey}
              onEdit={onEdit}
              onCloseEdit={onCloseEdit}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Filtro = 'todos' | 'atencao'

export function ConferenciaPedidos({ search = '' }: { search?: string }) {
  const { data: medicoes = [], isLoading } = useMedicoesConformidade()
  const [filtro, setFiltro] = useState<Filtro>('atencao')
  const [expandedEtapas, setExpandedEtapas] = useState<Set<string>>(new Set())
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const toggleEtapa = (key: string) => {
    setExpandedEtapas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const totais = useMemo(() => {
    let ok = 0, risco = 0, critico = 0, semPedidos = 0
    for (const m of medicoes) {
      ok         += m.counts.ok
      risco      += m.counts.risco
      critico    += m.counts.critico
      semPedidos += m.counts.sem_pedidos
    }
    return { ok, risco, critico, sem_pedidos: semPedidos, medicoes: medicoes.length }
  }, [medicoes])

  const medicoesAtencao = useMemo(
    () => medicoes.filter(m => m.status_geral !== 'ok').length,
    [medicoes],
  )

  const lista = useMemo(() => {
    let m = filtro === 'atencao'
      ? medicoes.filter(med => med.status_geral !== 'ok')
      : [...medicoes]

    if (search.trim()) {
      const s = search.toLowerCase()
      m = m.map(med => ({
        ...med,
        etapas: med.etapas.filter(e =>
          e.etapa_nome.toLowerCase().includes(s) ||
          e.etapa_codigo.toLowerCase().includes(s) ||
          e.pedidos.some(p =>
            p.item_descricao.toLowerCase().includes(s) ||
            p.fornecedor_nome.toLowerCase().includes(s) ||
            String(p.numero_pedido ?? '').includes(s)
          )
        ),
      })).filter(med => med.etapas.length > 0)
    }
    return m
  }, [medicoes, filtro, search])

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Carregando conformidade...</span>
    </div>
  )

  if (medicoes.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <Package className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Nenhum dado encontrado.</p>
      <p className="text-xs opacity-70">
        Configure o cronograma de distribuição e adicione datas de entrega nos pedidos.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-500" />
          <div>
            <p className="text-xl font-black text-emerald-600">{totais.ok}</p>
            <p className="text-[10px] font-medium text-muted-foreground">Pedidos OK</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <AlertTriangle className="h-7 w-7 shrink-0 text-amber-500" />
          <div>
            <p className="text-xl font-black text-amber-600">{totais.risco}</p>
            <p className="text-[10px] font-medium text-muted-foreground">Risco (≤7d)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <XCircle className="h-7 w-7 shrink-0 text-red-500" />
          <div>
            <p className="text-xl font-black text-red-600">{totais.critico}</p>
            <p className="text-[10px] font-medium text-muted-foreground">Crítico (&gt;7d)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <ShoppingCart className="h-7 w-7 shrink-0 text-muted-foreground/40" />
          <div>
            <p className="text-xl font-black text-muted-foreground">{totais.sem_pedidos}</p>
            <p className="text-[10px] font-medium text-muted-foreground">Sem pedidos</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border bg-card p-1 w-fit">
        <button
          onClick={() => setFiltro('atencao')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            filtro === 'atencao'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Com atenção ({medicoesAtencao})
        </button>
        <button
          onClick={() => setFiltro('todos')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            filtro === 'todos'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Todas as medições ({totais.medicoes})
        </button>
      </div>

      {/* Medição cards */}
      {lista.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-600">
            Todas as medições estão em conformidade.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(med => (
            <MedicaoCard
              key={med.medicao_numero}
              med={med}
              expandedEtapas={expandedEtapas}
              onToggleEtapa={toggleEtapa}
              editingKey={editingKey}
              onEdit={setEditingKey}
              onCloseEdit={() => setEditingKey(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
