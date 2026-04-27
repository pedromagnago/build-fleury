/**
 * MatrizCompras — Tela unificada de Custos & Pedidos por Etapa
 *
 * Layout matrizado (inspirado na planilha Excel do cliente):
 *   1 linha = 1 item de compra (dentro de cada etapa)
 *   Grupos de colunas colapsáveis: "Por Casa" | "N Casas" | "Pedido 1..N"
 *   Pedidos se expandem HORIZONTALMENTE (nunca replicando linhas)
 *   Medição/Data medição derivadas do cronograma (read-only)
 *
 * Estado inicial: tudo AGLUTINADO (etapas accordion + pedidos resumidos).
 * O usuário expande só o que interessa — reduz sobrecarga visual.
 *
 * Excel-like:
 *   Click → seleciona (ring azul) · Enter/F2 → edita · Esc → cancela
 *   ←↑↓→ → navega · Double-click → edita direto
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, Link2, Unlink, Plus, X,
  Package, Filter, Loader2, Maximize2, Minimize2,
} from 'lucide-react'
import {
  useItensCompra, usePedidos, useFornecedores,
  useCreatePedido, useUpdatePedido, useDeletePedido,
  type Pedido, type ItemCompra,
} from '@/hooks/useCompras'
import { useDistribuicao } from '@/hooks/useOperacional'
import { useEtapas } from '@/hooks/useEtapas'
import { useParcelas } from '@/hooks/useFinanceiro'
import { useProject } from '@/contexts/ProjectContext'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function parseBRL(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

/** Retorna a medição cuja `data_inicio` é a última ≤ dataEntrega, dentro da etapa. */
function findMedicao(
  etapaId: string,
  dataEntrega: string | null,
  distsByEtapa: Map<string, Array<{ medicao_numero: number; data_inicio: string | null }>>,
): { numero: number; data_inicio: string } | null {
  if (!dataEntrega) return null
  const dists = distsByEtapa.get(etapaId) ?? []
  const withDate = dists
    .filter(d => d.data_inicio)
    .sort((a, b) => a.data_inicio!.localeCompare(b.data_inicio!))
  let match: { numero: number; data_inicio: string } | null = null
  for (const d of withDate) {
    if (d.data_inicio! <= dataEntrega) {
      match = { numero: d.medicao_numero, data_inicio: d.data_inicio! }
    } else {
      break
    }
  }
  return match
}

// ─── Tipos de UI ─────────────────────────────────────────────────────────────

interface ItemRow {
  item: ItemCompra
  pedidos: Pedido[]
}

type PedidoField =
  | 'fornecedor_id' | 'cond_pagamento' | 'data_entrega_prevista'
  | 'casas_lote' | 'qtd_lote' | 'valor_unitario_real' | 'valor_total_real'

const PEDIDO_FIELDS: PedidoField[] = [
  'fornecedor_id', 'cond_pagamento', 'data_entrega_prevista',
  'casas_lote', 'qtd_lote', 'valor_unitario_real', 'valor_total_real',
]
const FIELDS_PER_PEDIDO_EXPANDED = PEDIDO_FIELDS.length + 2 // +2 med (RO) + ini med (RO)

// ─── Main Component ──────────────────────────────────────────────────────────

export function MatrizCompras({ search }: { search: string }) {
  const { currentCompany } = useProject()
  const { data: itens = [], isLoading: loadingItens } = useItensCompra()
  const { data: pedidos = [], isLoading: loadingPeds } = usePedidos()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: etapas = [] } = useEtapas()
  const { data: dists = [] } = useDistribuicao()
  const { data: parcelas = [] } = useParcelas()

  const createPedido = useCreatePedido()
  const updatePedido = useUpdatePedido()
  const deletePedido = useDeletePedido()

  // UI state
  const [showPorCasa, setShowPorCasa] = useState(false)
  const [showNCasas, setShowNCasas] = useState(false)
  const [etapaFilter, setEtapaFilter] = useState<string>('')
  const [onlyWithoutPedido, setOnlyWithoutPedido] = useState(false)
  const [lockDatePerEtapa, setLockDatePerEtapa] = useState(true)

  // Aglutinação — TUDO COLAPSADO por default (etapas e pedidos)
  const [expandedEtapas, setExpandedEtapas] = useState<Set<string>>(new Set())
  const [expandedPedidos, setExpandedPedidos] = useState<Set<number>>(new Set())
  // Itens com a faixa "parcelas formadas" expandida — chave: item.id
  const [expandedParcelas, setExpandedParcelas] = useState<Set<string>>(new Set())

  // Indexa parcelas por pedido_id para acesso O(1)
  const parcelasByPedido = useMemo(() => {
    const m = new Map<string, typeof parcelas>()
    for (const p of parcelas) {
      if (!p.pedido_id) continue
      const arr = m.get(p.pedido_id) ?? []
      arr.push(p)
      m.set(p.pedido_id, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0))
    }
    return m
  }, [parcelas])
  // Fornecedores: default EXPANDIDO quando etapa abre → trackeamos os COLAPSADOS
  const [collapsedFornecedores, setCollapsedFornecedores] = useState<Set<string>>(new Set())

  // Célula ativa / editando
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null)

  const tableContainerRef = useRef<HTMLDivElement>(null)

  const qtdCasas = currentCompany?.qtd_casas ?? 64

  // ── Build matriz rows ─────────────────────────────────────────────────────
  const rows: ItemRow[] = useMemo(() => {
    const pedidosByItem = new Map<string, Pedido[]>()
    for (const p of pedidos) {
      const list = pedidosByItem.get(p.item_compra_id) ?? []
      list.push(p)
      pedidosByItem.set(p.item_compra_id, list)
    }
    for (const [k, list] of pedidosByItem) {
      list.sort((a, b) => {
        const an = a.numero_pedido ?? Number.MAX_SAFE_INTEGER
        const bn = b.numero_pedido ?? Number.MAX_SAFE_INTEGER
        if (an !== bn) return an - bn
        return (a.created_at ?? '').localeCompare(b.created_at ?? '')
      })
      pedidosByItem.set(k, list)
    }
    return itens.map(item => ({ item, pedidos: pedidosByItem.get(item.id) ?? [] }))
  }, [itens, pedidos])

  const distsByEtapa = useMemo(() => {
    const map = new Map<string, Array<{ medicao_numero: number; data_inicio: string | null }>>()
    for (const d of dists) {
      const list = map.get(d.etapa_id) ?? []
      list.push({ medicao_numero: d.medicao_numero, data_inicio: d.data_inicio })
      map.set(d.etapa_id, list)
    }
    return map
  }, [dists])

  const filteredRows = useMemo(() => {
    const s = search.toLowerCase().trim()
    return rows.filter(r => {
      if (etapaFilter && r.item.etapa_id !== etapaFilter) return false
      if (onlyWithoutPedido && r.pedidos.length > 0) return false
      if (!s) return true
      return (
        r.item.descricao.toLowerCase().includes(s) ||
        r.item.codigo.toLowerCase().includes(s) ||
        (r.item.etapa_nome ?? '').toLowerCase().includes(s) ||
        r.pedidos.some(p => (p.fornecedor_nome ?? '').toLowerCase().includes(s))
      )
    })
  }, [rows, search, etapaFilter, onlyWithoutPedido])

  const maxPedidos = useMemo(() => {
    return Math.max(1, ...filteredRows.map(r => r.pedidos.length))
  }, [filteredRows])

  // Agrupamento hierárquico: Etapa → Fornecedor → Itens
  // Items sem fornecedor_id vão para bucket '_none' (label "Sem pedidos relacionados"), sempre renderizado por último.
  const groupedData = useMemo(() => {
    type FornGroup = {
      key: string
      nome: string
      rows: ItemRow[]
      pedCount: number
      totalOrcado: number
      totalPedidos: number
      pedidoTotals: number[] // [pedidoIdx] → soma valor_total_real naquela coluna
    }
    type EtapaGroup = {
      etapaId: string
      etapa_nome: string
      etapa_ordem: number
      fornecedores: FornGroup[]
      totalItems: number
      totalPedCount: number
      totalOrcado: number
      totalPedidos: number
      pedidoTotals: number[] // agregado dos fornecedores
    }
    const etapaMap = new Map<string, {
      etapa_nome: string
      etapa_ordem: number
      byForn: Map<string, FornGroup>
      totalItems: number
      totalPedCount: number
      totalOrcado: number
      totalPedidos: number
      pedidoTotals: number[]
    }>()

    for (const r of filteredRows) {
      const etapaId = r.item.etapa_id
      const etapa = etapas.find(e => e.id === etapaId)
      if (!etapaMap.has(etapaId)) {
        etapaMap.set(etapaId, {
          etapa_nome: etapa?.nome ?? r.item.etapa_nome ?? '—',
          etapa_ordem: etapa?.ordem ?? 999,
          byForn: new Map(),
          totalItems: 0,
          totalPedCount: 0,
          totalOrcado: 0,
          totalPedidos: 0,
          pedidoTotals: [],
        })
      }
      const eg = etapaMap.get(etapaId)!

      let fornKey = '_none'
      let fornNome = 'Sem pedidos relacionados'
      if (r.pedidos.length > 0) {
        const firstPed = r.pedidos[0]!
        const pedFornId = firstPed.fornecedor_id ?? r.item.fornecedor_id ?? null
        const pedFornNome = firstPed.fornecedor_nome ?? r.item.fornecedor_nome ?? null
        if (pedFornId) {
          fornKey = pedFornId
          fornNome = pedFornNome ?? '—'
        } else {
          fornKey = '_sem_fornecedor'
          fornNome = 'Pedidos sem fornecedor definido'
        }
      } else if (r.item.fornecedor_id) {
        fornKey = '_none'
        fornNome = 'Sem pedidos relacionados'
      }

      if (!eg.byForn.has(fornKey)) {
        eg.byForn.set(fornKey, {
          key: fornKey, nome: fornNome, rows: [], pedCount: 0,
          totalOrcado: 0, totalPedidos: 0, pedidoTotals: [],
        })
      }
      const fg = eg.byForn.get(fornKey)!

      const itemOrcado = Number(r.item.valor_total_orcado) || 0
      const itemPedidos = r.pedidos.reduce((s, p) => s + (Number(p.valor_total_real) || 0), 0)

      fg.rows.push(r)
      fg.pedCount += r.pedidos.length
      fg.totalOrcado += itemOrcado
      fg.totalPedidos += itemPedidos

      // Acumula total por índice de pedido
      r.pedidos.forEach((p, idx) => {
        const v = Number(p.valor_total_real) || 0
        fg.pedidoTotals[idx] = (fg.pedidoTotals[idx] ?? 0) + v
        eg.pedidoTotals[idx] = (eg.pedidoTotals[idx] ?? 0) + v
      })

      eg.totalItems += 1
      eg.totalPedCount += r.pedidos.length
      eg.totalOrcado += itemOrcado
      eg.totalPedidos += itemPedidos
    }

    const result: EtapaGroup[] = Array.from(etapaMap.entries())
      .sort((a, b) => a[1].etapa_ordem - b[1].etapa_ordem)
      .map(([etapaId, data]) => ({
        etapaId,
        etapa_nome: data.etapa_nome,
        etapa_ordem: data.etapa_ordem,
        totalItems: data.totalItems,
        totalPedCount: data.totalPedCount,
        totalOrcado: data.totalOrcado,
        totalPedidos: data.totalPedidos,
        pedidoTotals: data.pedidoTotals,
        fornecedores: Array.from(data.byForn.values()).sort((a, b) => {
          const rank = (k: string) => k === '_none' ? 2 : k === '_sem_fornecedor' ? 1 : 0
          const ra = rank(a.key), rb = rank(b.key)
          if (ra !== rb) return ra - rb
          return a.nome.localeCompare(b.nome, 'pt-BR')
        }),
      }))
    return result
  }, [filteredRows, etapas])

  // Se filtrar resultado, expande etapas automaticamente
  useEffect(() => {
    if (search.trim() || etapaFilter) {
      setExpandedEtapas(new Set(groupedData.map(eg => eg.etapaId)))
    }
  }, [search, etapaFilter, groupedData])

  // Toggles
  const toggleEtapa = (id: string) =>
    setExpandedEtapas(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const toggleFornecedor = (key: string) =>
    setCollapsedFornecedores(s => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  const togglePedidoCol = (idx: number) =>
    setExpandedPedidos(s => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  const expandAll = () => {
    setExpandedEtapas(new Set(groupedData.map(eg => eg.etapaId)))
    setCollapsedFornecedores(new Set())
    setExpandedPedidos(new Set(Array.from({ length: maxPedidos }, (_, i) => i)))
  }
  const collapseAll = () => {
    setExpandedEtapas(new Set())
    setExpandedPedidos(new Set())
    setCollapsedFornecedores(new Set())
    setActiveCell(null)
    setEditingCell(null)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleUpdatePedido = async (pedidoId: string, patch: Partial<Pedido>) => {
    try { await updatePedido.mutateAsync({ id: pedidoId, ...patch }) } catch {}
  }

  const handleUpdateDataEntrega = async (
    pedidoId: string, etapaId: string, pedidoIndex: number, novaData: string,
  ) => {
    if (!lockDatePerEtapa) {
      await handleUpdatePedido(pedidoId, { data_entrega_prevista: novaData })
      return
    }
    const etapaGroup = groupedData.find(eg => eg.etapaId === etapaId)
    const etapaRows = etapaGroup?.fornecedores.flatMap(f => f.rows) ?? []
    const idsToUpdate: string[] = []
    for (const row of etapaRows) {
      const p = row.pedidos[pedidoIndex]
      if (p && p.data_entrega_prevista !== novaData) idsToUpdate.push(p.id)
    }
    if (idsToUpdate.length === 0) return
    try {
      await Promise.all(idsToUpdate.map(id => updatePedido.mutateAsync({ id, data_entrega_prevista: novaData })))
      if (idsToUpdate.length > 1) toast.success(`Data propagada para ${idsToUpdate.length} pedidos da etapa`)
    } catch {}
  }

  const handleAddPedido = async (item: ItemCompra) => {
    const qtdPorCasa = item.qtd_por_casa ?? 0
    const casasLote = qtdCasas
    const qtdLote = qtdPorCasa * casasLote
    const valorUnit = Number(item.custo_unitario_orcado) || 0
    const valorTotal = qtdLote * valorUnit
    try {
      await createPedido.mutateAsync({
        item_compra_id: item.id,
        fornecedor_id: item.fornecedor_id,
        cond_pagamento: item.cond_pagamento,
        casas_lote: casasLote, qtd_lote: qtdLote,
        valor_unitario_real: valorUnit, valor_total_real: valorTotal,
        status: 'planejado',
      })
    } catch {}
  }

  // ── Linhas visíveis (para navegação) ──────────────────────────────────────
  // 3 níveis: Etapa expandida + Fornecedor não colapsado = linhas visíveis
  const visibleRows = useMemo(() => {
    const list: { row: ItemRow; etapaId: string; rowIdx: number }[] = []
    let idx = 0
    for (const eg of groupedData) {
      if (!expandedEtapas.has(eg.etapaId)) continue
      for (const fg of eg.fornecedores) {
        const fKey = `${eg.etapaId}|${fg.key}`
        if (collapsedFornecedores.has(fKey)) continue
        for (const r of fg.rows) {
          list.push({ row: r, etapaId: eg.etapaId, rowIdx: idx })
          idx++
        }
      }
    }
    return list
  }, [groupedData, expandedEtapas, collapsedFornecedores])

  // Colunas de pedido "navegáveis" por teclado. Se pedido colapsado → 1 col; expandido → 9 cols.
  const pedidoColSpans = useMemo(() =>
    Array.from({ length: maxPedidos }, (_, i) => expandedPedidos.has(i) ? FIELDS_PER_PEDIDO_EXPANDED : 1)
  , [maxPedidos, expandedPedidos])

  // Total de "células navegáveis" por linha
  const totalNavCols = pedidoColSpans.reduce((a, b) => a + b, 0)

  // ── Navegação por teclado ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activeCell || editingCell) return
    const { r, c } = activeCell
    const maxR = visibleRows.length - 1
    const maxC = Math.max(0, totalNavCols - 1)

    if (e.key === 'ArrowRight') { if (c < maxC) setActiveCell({ r, c: c + 1 }); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { if (c > 0) setActiveCell({ r, c: c - 1 }); e.preventDefault() }
    else if (e.key === 'ArrowDown') { if (r < maxR) setActiveCell({ r: r + 1, c }); e.preventDefault() }
    else if (e.key === 'ArrowUp') { if (r > 0) setActiveCell({ r: r - 1, c }); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === 'F2') {
      // só edita se a célula for editável (verificado pelo filho — aqui apenas dispara)
      setEditingCell({ r, c })
      e.preventDefault()
    }
    else if (e.key === 'Escape') { setActiveCell(null); e.preventDefault() }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEditingCell({ r, c })
    }
  }, [activeCell, editingCell, visibleRows.length, totalNavCols])

  useEffect(() => {
    if (!activeCell || editingCell) return
    const el = tableContainerRef.current?.querySelector<HTMLElement>(
      `[data-r="${activeCell.r}"][data-c="${activeCell.c}"]`,
    )
    el?.focus({ preventScroll: false })
  }, [activeCell, editingCell])

  if (loadingItens || loadingPeds) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    )
  }

  // Larguras das sticky columns (px)
  const W_ETAPA = 140
  const W_ITEM = 280

  // Map de {pedidoIdx → colOffsetStart} para data-c consistente
  const pedidoColOffset: number[] = []
  {
    let acc = 0
    for (let i = 0; i < maxPedidos; i++) {
      pedidoColOffset.push(acc)
      acc += pedidoColSpans[i] ?? 0
    }
  }

  const allExpanded = expandedEtapas.size === groupedData.length && groupedData.length > 0
                     && expandedPedidos.size === maxPedidos
                     && collapsedFornecedores.size === 0

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={etapaFilter}
            onChange={e => setEtapaFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todas as etapas</option>
            {etapas.map(et => (<option key={et.id} value={et.id}>{et.nome}</option>))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyWithoutPedido} onChange={e => setOnlyWithoutPedido(e.target.checked)} />
          Só sem pedido
        </label>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPorCasa(s => !s)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              showPorCasa ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {showPorCasa ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Por Casa
          </button>
          <button
            onClick={() => setShowNCasas(s => !s)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              showNCasas ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {showNCasas ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {qtdCasas} Casas
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            title={allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
          >
            {allExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {allExpanded ? 'Recolher' : 'Expandir'} tudo
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setLockDatePerEtapa(s => !s)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              lockDatePerEtapa
                ? 'bg-blue-500/10 text-blue-700 hover:bg-blue-500/20'
                : 'bg-muted text-muted-foreground hover:bg-zinc-100 dark:bg-zinc-800'
            }`}
            title={lockDatePerEtapa ? 'Ligado: editar data propaga para todos da etapa' : 'Desligado: edição individual'}
          >
            {lockDatePerEtapa ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
            Data {lockDatePerEtapa ? 'vinculada' : 'individual'}
          </button>
        </div>
      </div>

      {/* Dica */}
      <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span><kbd className="rounded bg-background px-1 py-0.5 border">Click</kbd> em etapa / pedido para expandir</span>
        <span><kbd className="rounded bg-background px-1 py-0.5 border">↑↓←→</kbd> navegar</span>
        <span><kbd className="rounded bg-background px-1 py-0.5 border">Enter</kbd> ou <kbd className="rounded bg-background px-1 py-0.5 border">F2</kbd> editar</span>
        <span><kbd className="rounded bg-background px-1 py-0.5 border">Esc</kbd> cancelar</span>
      </div>

      {/* Table container */}
      <div
        ref={tableContainerRef}
        className="overflow-auto rounded-lg border bg-card"
        style={{ maxHeight: 'calc(100vh - 260px)' }}
      >
        <table className="tbl-bf min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                className="sticky left-0 z-30 border-b border-r bg-muted px-3 py-2 text-left font-semibold text-foreground"
                style={{ minWidth: W_ETAPA, width: W_ETAPA }}
              >
                <div className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" /> Etapa
                </div>
              </th>
              <th
                className="sticky z-30 border-b border-r bg-muted px-3 py-2 text-left font-semibold text-foreground"
                style={{ left: W_ETAPA, minWidth: W_ITEM, width: W_ITEM }}
              >
                Item
              </th>
              {showPorCasa && (
                <th colSpan={4} className="border-b border-r bg-muted px-2 py-2 text-center font-semibold text-foreground">
                  Por Casa
                </th>
              )}
              {showNCasas && (
                <th colSpan={4} className="border-b border-r bg-muted px-2 py-2 text-center font-semibold text-foreground">
                  {qtdCasas} Casas
                </th>
              )}
              {Array.from({ length: maxPedidos }, (_, i) => (
                <PedidoHeaderCell
                  key={`ph-${i}`}
                  index={i}
                  expanded={expandedPedidos.has(i)}
                  onToggle={() => togglePedidoCol(i)}
                />
              ))}
              <th className="border-b bg-muted px-2 py-2 text-center">
                <span className="text-[10px] text-muted-foreground">+</span>
              </th>
            </tr>
            {/* Sub-header */}
            <tr className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-30 border-b border-r bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-left" style={{ minWidth: W_ETAPA, width: W_ETAPA }}>&nbsp;</th>
              <th className="sticky z-30 border-b border-r bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-left" style={{ left: W_ETAPA, minWidth: W_ITEM, width: W_ITEM }}>
                Descrição
              </th>
              {showPorCasa && (
                <>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-center">Un.</th>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">Qtd</th>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">V.Unit</th>
                  <th className="border-b border-r bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">V.Total</th>
                </>
              )}
              {showNCasas && (
                <>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-center">Un.</th>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">Qtd</th>
                  <th className="border-b bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">V.Unit</th>
                  <th className="border-b border-r bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 text-right">V.Total</th>
                </>
              )}
              {Array.from({ length: maxPedidos }, (_, i) => (
                expandedPedidos.has(i) ? <PedidoSubHeaderExpanded key={`sh-${i}`} /> : <PedidoSubHeaderCollapsed key={`sh-${i}`} />
              ))}
              <th className="border-b bg-zinc-100 dark:bg-zinc-800" />
            </tr>
          </thead>

          <tbody>
            {groupedData.length === 0 && (
              <tr>
                <td
                  colSpan={2 + (showPorCasa ? 4 : 0) + (showNCasas ? 4 : 0) + pedidoColSpans.reduce((a, b) => a + b, 0) + 1}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Nenhum item encontrado com os filtros atuais.
                </td>
              </tr>
            )}
            {(() => {
              const headerColCount = 2 + (showPorCasa ? 4 : 0) + (showNCasas ? 4 : 0) + pedidoColSpans.reduce((a, b) => a + b, 0) + 1
              let visibleRowIdx = 0
              return groupedData.map(eg => {
                const isEtapaExpanded = expandedEtapas.has(eg.etapaId)
                const startIdxForEtapa = visibleRowIdx
                // Calcula qto esta etapa contribui para o counter global
                if (isEtapaExpanded) {
                  for (const fg of eg.fornecedores) {
                    const fKey = `${eg.etapaId}|${fg.key}`
                    if (!collapsedFornecedores.has(fKey)) visibleRowIdx += fg.rows.length
                  }
                }
                return (
                  <EtapaAccordion
                    key={eg.etapaId}
                    etapaId={eg.etapaId}
                    etapaNome={eg.etapa_nome}
                    fornecedores={eg.fornecedores}
                    totalItems={eg.totalItems}
                    totalPedCount={eg.totalPedCount}
                    totalOrcado={eg.totalOrcado}
                    totalPedidos={eg.totalPedidos}
                    etapaPedidoTotals={eg.pedidoTotals}
                    expanded={isEtapaExpanded}
                    onToggleEtapa={() => toggleEtapa(eg.etapaId)}
                    collapsedFornecedores={collapsedFornecedores}
                    onToggleFornecedor={toggleFornecedor}
                    startRowIdx={startIdxForEtapa}
                    headerColCount={headerColCount}
                    qtdCasas={qtdCasas}
                    showPorCasa={showPorCasa}
                    showNCasas={showNCasas}
                    maxPedidos={maxPedidos}
                    expandedPedidos={expandedPedidos}
                    pedidoColOffset={pedidoColOffset}
                    distsByEtapa={distsByEtapa}
                    fornecedoresList={fornecedores}
                    activeCell={activeCell}
                    setActiveCell={setActiveCell}
                    editingCell={editingCell}
                    setEditingCell={setEditingCell}
                    onUpdatePedido={handleUpdatePedido}
                    onUpdateDataEntrega={handleUpdateDataEntrega}
                    onAddPedido={handleAddPedido}
                    onDeletePedido={id => deletePedido.mutate(id)}
                    parcelasByPedido={parcelasByPedido}
                    expandedParcelas={expandedParcelas}
                    onToggleParcelas={(itemId) => setExpandedParcelas(prev => {
                      const next = new Set(prev)
                      if (next.has(itemId)) next.delete(itemId)
                      else next.add(itemId)
                      return next
                    })}
                  />
                )
              })
            })()}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        {filteredRows.length} item(ns) · {groupedData.length} etapa(s) · {expandedEtapas.size} expandida(s) · máx. {maxPedidos} pedido(s)
      </div>
    </div>
  )
}

// ─── Header de um pedido ─────────────────────────────────────────────────────
function PedidoHeaderCell({ index, expanded, onToggle }: { index: number; expanded: boolean; onToggle: () => void }) {
  return (
    <th
      colSpan={expanded ? FIELDS_PER_PEDIDO_EXPANDED : 1}
      className={`border-b border-l-2 border-primary/40 px-2 py-2 text-center font-semibold text-primary ${
        expanded ? 'bg-blue-100 dark:bg-slate-800' : 'bg-blue-50 dark:bg-slate-900'
      }`}
    >
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 hover:underline"
        title={expanded ? 'Recolher pedido' : 'Expandir pedido'}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Pedido {index + 1}
      </button>
    </th>
  )
}

function PedidoSubHeaderExpanded() {
  const bg = 'bg-blue-100 dark:bg-slate-800'
  return (
    <>
      <th className={`border-b border-l-2 border-primary/40 px-2 py-1.5 text-left ${bg}`}>Forn.</th>
      <th className={`border-b px-2 py-1.5 text-center ${bg}`}>Cond.</th>
      <th className={`border-b px-2 py-1.5 text-center ${bg}`}>Entrega</th>
      <th className={`border-b px-2 py-1.5 text-center ${bg}`}>Med.</th>
      <th className={`border-b px-2 py-1.5 text-center ${bg}`}>Ini.Med</th>
      <th className={`border-b px-2 py-1.5 text-right ${bg}`}>Casas</th>
      <th className={`border-b px-2 py-1.5 text-right ${bg}`}>Qtd</th>
      <th className={`border-b px-2 py-1.5 text-right ${bg}`}>V.Unit</th>
      <th className={`border-b px-2 py-1.5 text-right ${bg}`}>V.Total</th>
    </>
  )
}

function PedidoSubHeaderCollapsed() {
  return (
    <th className="border-b border-l-2 border-primary/40 bg-blue-50 dark:bg-slate-900 px-2 py-1.5 text-center text-[9px]">
      Resumo
    </th>
  )
}

// ─── Linha de subtotal com valores alinhados nas colunas de pedido ──────────
const W_ETAPA_SUB = 140
const W_ITEM_SUB = 280

function SubtotalRow({
  label, total, pedidoTotals, showPorCasa, showNCasas, maxPedidos, expandedPedidos, variant,
}: {
  label: string
  total: number
  pedidoTotals: number[]
  showPorCasa: boolean
  showNCasas: boolean
  maxPedidos: number
  expandedPedidos: Set<number>
  variant: 'etapa' | 'fornecedor' | 'warning' | 'none'
}) {
  const bg = variant === 'etapa'
    ? 'bg-amber-50 dark:bg-amber-900/40'
    : variant === 'fornecedor'
      ? 'bg-blue-50/80 dark:bg-blue-900/30'
      : variant === 'warning'
        ? 'bg-amber-50/80 dark:bg-amber-900/30'
        : 'bg-zinc-100 dark:bg-zinc-900/40'
  const text = variant === 'etapa'
    ? 'text-amber-900 dark:text-amber-100'
    : variant === 'fornecedor'
      ? 'text-blue-900 dark:text-blue-100'
      : variant === 'warning'
        ? 'text-amber-900 dark:text-amber-100'
        : 'text-zinc-700 dark:text-zinc-300'

  const fmt = (v: number) => v > 0 ? formatCurrency(v) : '—'

  return (
    <tr className={`${bg} text-[10px] font-semibold ${text}`}>
      <td className={`sticky left-0 z-[8] border-b border-t px-3 py-1 ${bg}`} style={{ minWidth: W_ETAPA_SUB, width: W_ETAPA_SUB }}>
        Subtotal
      </td>
      <td className={`sticky z-[8] border-b border-t border-r px-3 py-1 italic ${bg}`} style={{ left: W_ETAPA_SUB, minWidth: W_ITEM_SUB, width: W_ITEM_SUB }} title={label}>
        <span className="truncate block max-w-[260px]">{label}</span>
      </td>
      {showPorCasa && (
        <>
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t border-r px-2 py-1" />
        </>
      )}
      {showNCasas && (
        <>
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t px-2 py-1" />
          <td className="border-b border-t border-r px-2 py-1" />
        </>
      )}
      {Array.from({ length: maxPedidos }, (_, i) => {
        const v = pedidoTotals[i] ?? 0
        const isExpanded = expandedPedidos.has(i)
        if (!isExpanded) {
          return (
            <td key={`st-${i}`} className={`border-b border-t border-l-2 border-primary/40 px-2 py-1 text-right tabular-nums ${bg}`}>
              {fmt(v)}
            </td>
          )
        }
        // Expandido: 9 cells; 8 em branco + última com total
        return (
          <React.Fragment key={`st-${i}`}>
            <td className={`border-b border-t border-l-2 border-primary/40 px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 ${bg}`} />
            <td className={`border-b border-t px-2 py-1 text-right text-[9px] italic opacity-60 ${bg}`}>Σ</td>
            <td className={`border-b border-t px-2 py-1 text-right tabular-nums ${bg}`}>{fmt(v)}</td>
          </React.Fragment>
        )
      })}
      <td className={`border-b border-t px-2 py-1 text-right tabular-nums font-bold ${bg}`} title="Total consolidado">
        {total > 0 ? formatCurrency(total) : ''}
      </td>
    </tr>
  )
}

// ─── Accordion de uma etapa ─────────────────────────────────────────────────
interface FornecedorGroup {
  key: string; nome: string; rows: ItemRow[]; pedCount: number
  totalOrcado: number; totalPedidos: number
  pedidoTotals: number[]
}

interface EtapaAccordionProps {
  etapaId: string
  etapaNome: string
  fornecedores: FornecedorGroup[]
  totalItems: number
  totalPedCount: number
  totalOrcado: number
  totalPedidos: number
  etapaPedidoTotals: number[]
  expanded: boolean
  onToggleEtapa: () => void
  collapsedFornecedores: Set<string>
  onToggleFornecedor: (key: string) => void
  startRowIdx: number
  headerColCount: number
  qtdCasas: number
  showPorCasa: boolean
  showNCasas: boolean
  maxPedidos: number
  expandedPedidos: Set<number>
  pedidoColOffset: number[]
  distsByEtapa: Map<string, Array<{ medicao_numero: number; data_inicio: string | null }>>
  fornecedoresList: Array<{ id: string; nome: string }>
  activeCell: { r: number; c: number } | null
  setActiveCell: (v: { r: number; c: number } | null) => void
  editingCell: { r: number; c: number } | null
  setEditingCell: (v: { r: number; c: number } | null) => void
  onUpdatePedido: (id: string, patch: Partial<Pedido>) => Promise<void>
  onUpdateDataEntrega: (id: string, etapaId: string, pedidoIndex: number, novaData: string) => Promise<void>
  onAddPedido: (item: ItemCompra) => Promise<void>
  onDeletePedido: (id: string) => void
  parcelasByPedido: Map<string, Array<{ id: string; numero_parcela: number; valor: number; data_vencimento: string; status: string; valor_pago: number }>>
  expandedParcelas: Set<string>
  onToggleParcelas: (itemId: string) => void
}

function EtapaAccordion(props: EtapaAccordionProps) {
  const {
    etapaId, etapaNome, fornecedores, totalItems, totalPedCount,
    totalOrcado, totalPedidos, etapaPedidoTotals,
    expanded, onToggleEtapa, collapsedFornecedores, onToggleFornecedor,
    startRowIdx, headerColCount, ...rest
  } = props

  let localRowIdx = 0

  return (
    <>
      {/* Etapa header — sempre visível */}
      <tr>
        <td
          colSpan={headerColCount}
          className="sticky left-0 z-10 cursor-pointer border-b border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950 hover:bg-amber-200 dark:hover:bg-amber-900"
          onClick={onToggleEtapa}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-amber-800 dark:text-amber-300" /> : <ChevronRight className="h-4 w-4 text-amber-800 dark:text-amber-300" />}
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100">
              {etapaNome}
            </span>
            <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-100">
              {totalItems} item(ns)
            </span>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
              {totalPedCount} pedido(s)
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {fornecedores.length} fornecedor(es)
            </span>
            <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
              <span className="text-muted-foreground">
                Orçado: <span className="font-semibold text-amber-900 dark:text-amber-100">{formatCurrency(totalOrcado)}</span>
              </span>
              <span className="text-muted-foreground">
                Pedidos: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(totalPedidos)}</span>
              </span>
            </span>
          </div>
        </td>
      </tr>

      {/* Subtotal agregado da etapa — per pedido column */}
      {expanded && (
        <SubtotalRow
          label={`Σ ${etapaNome}`}
          total={totalPedidos}
          pedidoTotals={etapaPedidoTotals}
          showPorCasa={rest.showPorCasa}
          showNCasas={rest.showNCasas}
          maxPedidos={rest.maxPedidos}
          expandedPedidos={rest.expandedPedidos}
          variant="etapa"
        />
      )}

      {expanded && fornecedores.map(fg => {
        const fKey = `${etapaId}|${fg.key}`
        const fornCollapsed = collapsedFornecedores.has(fKey)
        const isNone = fg.key === '_none'
        const rowsToRender = fornCollapsed ? [] : fg.rows
        const fornStartRowIdx = startRowIdx + localRowIdx

        const fgNode = (
          <FornecedorSubAccordion
            key={fKey}
            fornKey={fKey}
            nome={fg.nome}
            isNone={isNone}
            itemCount={fg.rows.length}
            pedCount={fg.pedCount}
            fornOrcado={fg.totalOrcado}
            fornPedidos={fg.totalPedidos}
            fornPedidoTotals={fg.pedidoTotals}
            collapsed={fornCollapsed}
            onToggle={() => onToggleFornecedor(fKey)}
            headerColCount={headerColCount}
            rows={rowsToRender}
            etapaId={etapaId}
            startRowIdx={fornStartRowIdx}
            {...rest}
          />
        )

        if (!fornCollapsed) localRowIdx += fg.rows.length
        return fgNode
      })}
    </>
  )
}

// ─── Sub-accordion de fornecedor dentro de uma etapa ────────────────────────
interface FornecedorSubAccordionProps extends Omit<EtapaAccordionProps, 'etapaNome' | 'fornecedores' | 'totalItems' | 'totalPedCount' | 'totalOrcado' | 'totalPedidos' | 'etapaPedidoTotals' | 'expanded' | 'onToggleEtapa' | 'collapsedFornecedores' | 'onToggleFornecedor'> {
  fornKey: string
  nome: string
  isNone: boolean
  itemCount: number
  pedCount: number
  fornOrcado: number
  fornPedidos: number
  fornPedidoTotals: number[]
  collapsed: boolean
  onToggle: () => void
  rows: ItemRow[]
}

function FornecedorSubAccordion(props: FornecedorSubAccordionProps) {
  const {
    fornKey, nome, isNone, itemCount, pedCount, fornOrcado, fornPedidos, fornPedidoTotals,
    collapsed, onToggle,
    headerColCount, rows, etapaId, startRowIdx, ...rest
  } = props

  // 3 variantes visuais: normal (azul) · sem fornecedor (âmbar, alerta) · sem pedidos (cinza)
  const isNoSupplier = fornKey.endsWith('_sem_fornecedor')
  const headerBg = isNone
    ? 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700'
    : isNoSupplier
      ? 'bg-amber-100 dark:bg-amber-950 hover:bg-amber-200 dark:hover:bg-amber-900'
      : 'bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900'
  const headerText = isNone
    ? 'text-zinc-700 dark:text-zinc-300'
    : isNoSupplier
      ? 'text-amber-900 dark:text-amber-100'
      : 'text-blue-900 dark:text-blue-100'
  const iconColor = isNone
    ? 'text-zinc-500'
    : isNoSupplier
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-blue-600 dark:text-blue-400'
  const icon = isNone ? '📭 ' : isNoSupplier ? '⚠️ ' : '🏢 '

  return (
    <>
      <tr>
        <td
          colSpan={headerColCount}
          className={`sticky left-0 z-[9] cursor-pointer border-b ${headerBg}`}
          onClick={onToggle}
        >
          <div className="flex items-center gap-2 px-6 py-1.5">
            {collapsed ? <ChevronRight className={`h-3.5 w-3.5 ${iconColor}`} /> : <ChevronDown className={`h-3.5 w-3.5 ${iconColor}`} />}
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${headerText}`}>
              {icon}{nome}
            </span>
            <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {itemCount} item(ns) · {pedCount} pedido(s)
            </span>
            <span className="ml-auto flex items-center gap-3 text-[10px] tabular-nums">
              <span className="text-muted-foreground">
                Orçado: <span className={`font-semibold ${headerText}`}>{formatCurrency(fornOrcado)}</span>
              </span>
              <span className="text-muted-foreground">
                Pedidos: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(fornPedidos)}</span>
              </span>
            </span>
          </div>
        </td>
      </tr>
      {!collapsed && (
        <SubtotalRow
          label={`Σ ${nome}`}
          total={fornPedidos}
          pedidoTotals={fornPedidoTotals}
          showPorCasa={rest.showPorCasa}
          showNCasas={rest.showNCasas}
          maxPedidos={rest.maxPedidos}
          expandedPedidos={rest.expandedPedidos}
          variant={isNone ? 'none' : isNoSupplier ? 'warning' : 'fornecedor'}
        />
      )}
      {!collapsed && rows.map((row, localIdx) => (
        <ItemMatrixRow
          key={row.item.id}
          row={row}
          rowIdx={startRowIdx + localIdx}
          etapaId={etapaId}
          {...rest}
        />
      ))}
    </>
  )
}


// ─── Linha de 1 item ─────────────────────────────────────────────────────────
interface ItemRowProps {
  row: ItemRow
  rowIdx: number
  etapaId: string
  qtdCasas: number
  showPorCasa: boolean
  showNCasas: boolean
  maxPedidos: number
  expandedPedidos: Set<number>
  pedidoColOffset: number[]
  distsByEtapa: Map<string, Array<{ medicao_numero: number; data_inicio: string | null }>>
  fornecedoresList: Array<{ id: string; nome: string }>
  activeCell: { r: number; c: number } | null
  setActiveCell: (v: { r: number; c: number } | null) => void
  editingCell: { r: number; c: number } | null
  setEditingCell: (v: { r: number; c: number } | null) => void
  onUpdatePedido: (id: string, patch: Partial<Pedido>) => Promise<void>
  onUpdateDataEntrega: (id: string, etapaId: string, pedidoIndex: number, novaData: string) => Promise<void>
  onAddPedido: (item: ItemCompra) => Promise<void>
  onDeletePedido: (id: string) => void
  parcelasByPedido: Map<string, Array<{ id: string; numero_parcela: number; valor: number; data_vencimento: string; status: string; valor_pago: number }>>
  expandedParcelas: Set<string>
  onToggleParcelas: (itemId: string) => void
}

const W_ETAPA = 140
const W_ITEM = 280

function ItemMatrixRow(props: ItemRowProps) {
  const {
    row, rowIdx, etapaId, qtdCasas, showPorCasa, showNCasas, maxPedidos,
    expandedPedidos, pedidoColOffset, distsByEtapa, fornecedoresList,
    activeCell, setActiveCell, editingCell, setEditingCell,
    onUpdatePedido, onUpdateDataEntrega, onAddPedido, onDeletePedido,
    parcelasByPedido, expandedParcelas, onToggleParcelas,
  } = props

  const item = row.item
  const qtdPorCasa = Number(item.qtd_por_casa) || 0
  const custoUnit = Number(item.custo_unitario_orcado) || 0
  const valorPorCasa = qtdPorCasa * custoUnit
  const qtdTotal = qtdPorCasa * qtdCasas
  const valorTotal = qtdTotal * custoUnit

  // Sólidos, alto contraste — sem alpha (páginas usam dark theme)
  const rowBg = rowIdx % 2 === 0
    ? 'bg-white dark:bg-zinc-900'
    : 'bg-zinc-50 dark:bg-zinc-800'

  // Quantidade total de parcelas dos pedidos desse item
  const totalParcelas = row.pedidos.reduce((s, p) => s + (parcelasByPedido.get(p.id)?.length ?? 0), 0)
  const parcelasOpen = expandedParcelas.has(item.id)
  // Pra ocupar todas as colunas no row de parcelas
  const colSpanFull = 2 + (showPorCasa ? 4 : 0) + (showNCasas ? 4 : 0) + (1 + maxPedidos)

  return (
    <>
    <tr className={`${rowBg} hover:bg-accent`}>
      <td
        className={`sticky left-0 z-10 border-b border-r px-3 py-1.5 text-[11px] text-muted-foreground ${rowBg}`}
        style={{ minWidth: W_ETAPA, width: W_ETAPA }}
      >
        <span className="truncate block max-w-[130px]">{item.etapa_nome ?? '—'}</span>
      </td>
      <td
        className={`sticky z-10 border-b border-r px-3 py-1.5 font-medium text-foreground ${rowBg}`}
        style={{ left: W_ETAPA, minWidth: W_ITEM, width: W_ITEM }}
        title={item.descricao}
      >
        <div className="flex items-center gap-1.5">
          {totalParcelas > 0 && (
            <button
              onClick={() => onToggleParcelas(item.id)}
              className={`rounded px-1 py-0.5 text-[9px] font-bold transition-colors ${parcelasOpen ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
              title={`${parcelasOpen ? 'Ocultar' : 'Ver'} ${totalParcelas} parcela(s)`}
            >
              {parcelasOpen ? '▾' : '▸'} {totalParcelas}
            </button>
          )}
          <div className="truncate max-w-[230px]">{item.descricao}</div>
        </div>
      </td>

      {showPorCasa && (
        <>
          <td className="border-b px-2 py-1.5 text-center text-muted-foreground">{item.unidade ?? '—'}</td>
          <td className="border-b px-2 py-1.5 text-right tabular-nums">{formatNumber(qtdPorCasa, 2, 2)}</td>
          <td className="border-b px-2 py-1.5 text-right text-muted-foreground tabular-nums">{formatCurrency(custoUnit)}</td>
          <td className="border-b border-r px-2 py-1.5 text-right font-medium tabular-nums">{formatCurrency(valorPorCasa)}</td>
        </>
      )}

      {showNCasas && (
        <>
          <td className="border-b px-2 py-1.5 text-center text-muted-foreground">{item.unidade ?? '—'}</td>
          <td className="border-b px-2 py-1.5 text-right tabular-nums">{formatNumber(qtdTotal, 2, 2)}</td>
          <td className="border-b px-2 py-1.5 text-right text-muted-foreground tabular-nums">{formatCurrency(custoUnit)}</td>
          <td className="border-b border-r px-2 py-1.5 text-right font-medium tabular-nums">{formatCurrency(valorTotal)}</td>
        </>
      )}

      {Array.from({ length: maxPedidos }, (_, i) => {
        const ped = row.pedidos[i]
        const expanded = expandedPedidos.has(i)
        const colStart = pedidoColOffset[i] ?? 0

        if (!expanded) {
          // Célula resumo (1 col)
          return (
            <PedidoSummaryCell
              key={`p-${i}`}
              pedido={ped}
              rowIdx={rowIdx}
              colIdx={colStart}
              activeCell={activeCell}
              setActiveCell={setActiveCell}
              onAdd={!ped && i === row.pedidos.length ? () => onAddPedido(item) : undefined}
            />
          )
        }

        if (!ped) {
          return (
            <PedidoEmptyCells
              key={`p-${i}`}
              rowIdx={rowIdx}
              onAdd={i === row.pedidos.length ? () => onAddPedido(item) : undefined}
            />
          )
        }

        return (
          <PedidoCells
            key={ped.id}
            pedido={ped}
            rowIdx={rowIdx}
            baseColIdx={colStart}
            etapaId={etapaId}
            pedidoIndex={i}
            distsByEtapa={distsByEtapa}
            fornecedoresList={fornecedoresList}
            activeCell={activeCell}
            setActiveCell={setActiveCell}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            onUpdatePedido={onUpdatePedido}
            onUpdateDataEntrega={onUpdateDataEntrega}
            onDeletePedido={onDeletePedido}
          />
        )
      })}

      <td className="border-b px-2 py-1.5 text-center">
        <button
          onClick={() => onAddPedido(item)}
          className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/20"
          title="Adicionar pedido"
        >
          <Plus className="h-3 w-3" />
        </button>
      </td>
    </tr>

    {/* Sub-linha: parcelas formadas a partir da cond. de pagamento */}
    {parcelasOpen && totalParcelas > 0 && (
      <tr className="bg-blue-50/40 dark:bg-blue-900/10 border-b">
        <td colSpan={colSpanFull} className="px-3 py-2">
          <div className="space-y-1.5">
            {row.pedidos.map(ped => {
              const parcs = parcelasByPedido.get(ped.id) ?? []
              if (parcs.length === 0) return null
              const totalPedido = parcs.reduce((s, p) => s + Number(p.valor), 0)
              return (
                <div key={ped.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="font-bold text-blue-700 dark:text-blue-400 shrink-0 min-w-[110px]">
                    Pedido #{ped.numero_pedido ?? '?'}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {ped.cond_pagamento || '—'} · {parcs.length}x · Total {formatCurrency(totalPedido)}
                  </span>
                  <span className="flex flex-wrap gap-1 ml-auto">
                    {parcs.map(p => {
                      const statusCls =
                        p.status === 'paga' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : p.status === 'parcialmente_paga' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        : p.status === 'vencida' ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                        : 'bg-muted text-muted-foreground'
                      const dataFmt = p.data_vencimento
                        ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'
                      return (
                        <span key={p.id} className={`rounded px-1.5 py-0.5 font-mono tabular-nums ${statusCls}`}
                          title={`P${p.numero_parcela} · Venc ${dataFmt} · ${p.status}${p.valor_pago > 0 ? ` · Pago ${formatCurrency(p.valor_pago)}` : ''}`}>
                          P{p.numero_parcela} · {dataFmt} · {formatCurrency(Number(p.valor))}
                        </span>
                      )
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        </td>
      </tr>
    )}
    </>
  )
}

// ─── Célula resumo quando pedido colapsado ──────────────────────────────────
function PedidoSummaryCell({
  pedido, rowIdx, colIdx, activeCell, setActiveCell, onAdd,
}: {
  pedido: Pedido | undefined
  rowIdx: number
  colIdx: number
  activeCell: { r: number; c: number } | null
  setActiveCell: (v: { r: number; c: number } | null) => void
  onAdd?: () => void
}) {
  const active = activeCell?.r === rowIdx && activeCell.c === colIdx
  const cellBg = rowIdx % 2 === 0 ? 'bg-blue-50 dark:bg-slate-900' : 'bg-blue-100 dark:bg-slate-800'
  return (
    <td
      className={`border-b border-l-2 border-primary/40 px-2 py-1.5 text-center ${cellBg} ${
        active ? 'outline outline-2 outline-primary -outline-offset-2 z-[5]' : ''
      }`}
      onClick={() => setActiveCell({ r: rowIdx, c: colIdx })}
    >
      <button
        data-r={rowIdx}
        data-c={colIdx}
        tabIndex={0}
        onFocus={() => setActiveCell({ r: rowIdx, c: colIdx })}
        className="block w-full text-[11px] outline-none"
        title={
          pedido
            ? `${pedido.fornecedor_nome ?? '—'} · ${fmtDateShort(pedido.data_entrega_prevista)} · ${pedido.valor_total_real != null ? formatCurrency(pedido.valor_total_real) : '—'}`
            : 'Sem pedido'
        }
      >
        {pedido ? (
          <span className="truncate block max-w-[90px] text-primary">
            {pedido.fornecedor_nome ?? '●'}
          </span>
        ) : onAdd ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={e => { e.stopPropagation(); onAdd() }}
            className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 hover:bg-emerald-500/20 cursor-pointer"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </button>
    </td>
  )
}

// ─── Células de um pedido expandido ─────────────────────────────────────────
interface PedidoCellsProps {
  pedido: Pedido
  rowIdx: number
  baseColIdx: number
  etapaId: string
  pedidoIndex: number
  distsByEtapa: Map<string, Array<{ medicao_numero: number; data_inicio: string | null }>>
  fornecedoresList: Array<{ id: string; nome: string }>
  activeCell: { r: number; c: number } | null
  setActiveCell: (v: { r: number; c: number } | null) => void
  editingCell: { r: number; c: number } | null
  setEditingCell: (v: { r: number; c: number } | null) => void
  onUpdatePedido: (id: string, patch: Partial<Pedido>) => Promise<void>
  onUpdateDataEntrega: (id: string, etapaId: string, pedidoIndex: number, novaData: string) => Promise<void>
  onDeletePedido: (id: string) => void
}

function PedidoCells(props: PedidoCellsProps) {
  const {
    pedido, rowIdx, baseColIdx, etapaId, pedidoIndex,
    distsByEtapa, fornecedoresList,
    activeCell, setActiveCell, editingCell, setEditingCell,
    onUpdatePedido, onUpdateDataEntrega, onDeletePedido,
  } = props

  const medicao = findMedicao(etapaId, pedido.data_entrega_prevista, distsByEtapa)

  // Fundo sólido: herda row bg (rowIdx % 2) com tint azul para marcar bloco pedido
  const cellBg = rowIdx % 2 === 0
    ? 'bg-blue-50 dark:bg-slate-900'
    : 'bg-blue-100 dark:bg-slate-800'
  const borderLeft = 'border-l-2 border-primary/40'

  const isActive = (c: number) => activeCell?.r === rowIdx && activeCell.c === c
  const isEditing = (c: number) => editingCell?.r === rowIdx && editingCell.c === c

  const renderEditableCell = (
    colOffset: number,
    className: string,
    display: React.ReactNode,
    editor: React.ReactNode,
  ) => {
    const c = baseColIdx + colOffset
    const active = isActive(c)
    const editing = isEditing(c)
    return (
      <td
        className={`relative border-b ${className} ${cellBg} ${
          active && !editing ? 'outline outline-2 outline-primary -outline-offset-2 z-[5]' : ''
        }`}
        onClick={() => { if (!editing) setActiveCell({ r: rowIdx, c }) }}
        onDoubleClick={() => setEditingCell({ r: rowIdx, c })}
      >
        {editing ? editor : (
          <button
            data-r={rowIdx}
            data-c={c}
            tabIndex={0}
            onFocus={() => setActiveCell({ r: rowIdx, c })}
            className="block w-full truncate text-left px-0.5 py-0 outline-none"
          >
            {display}
          </button>
        )}
      </td>
    )
  }

  const commitAndClose = () => setEditingCell(null)

  return (
    <>
      {renderEditableCell(0,
        `${borderLeft} px-2 py-1.5 text-foreground`,
        <span>{pedido.fornecedor_nome ?? '—'}</span>,
        <select
          autoFocus defaultValue={pedido.fornecedor_id ?? ''}
          onBlur={commitAndClose}
          onChange={async e => { await onUpdatePedido(pedido.id, { fornecedor_id: e.target.value || null }) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') commitAndClose() }}
          className="w-full rounded border bg-background px-1 py-0.5 text-xs"
        >
          <option value="">—</option>
          {fornecedoresList.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>,
      )}
      {renderEditableCell(1,
        'px-2 py-1.5 text-center text-muted-foreground',
        <span>{pedido.cond_pagamento ?? '—'}</span>,
        <TextInput initial={pedido.cond_pagamento ?? ''} onCommit={async v => { await onUpdatePedido(pedido.id, { cond_pagamento: v || null }); commitAndClose() }} onCancel={commitAndClose} />,
      )}
      {renderEditableCell(2,
        'px-2 py-1.5 text-center tabular-nums',
        <span>{fmtDateShort(pedido.data_entrega_prevista)}</span>,
        <DateInput initial={pedido.data_entrega_prevista ?? ''} onCommit={async v => { if (v) await onUpdateDataEntrega(pedido.id, etapaId, pedidoIndex, v); commitAndClose() }} onCancel={commitAndClose} />,
      )}

      {/* Med + Ini med (read-only, participam da navegação) */}
      <td
        className={`border-b px-2 py-1.5 text-center text-muted-foreground ${cellBg} ${
          isActive(baseColIdx + 3) ? 'outline outline-2 outline-primary/50 -outline-offset-2' : ''
        }`}
        title="Derivado do cronograma"
        onClick={() => setActiveCell({ r: rowIdx, c: baseColIdx + 3 })}
      >
        <button data-r={rowIdx} data-c={baseColIdx + 3} tabIndex={0} onFocus={() => setActiveCell({ r: rowIdx, c: baseColIdx + 3 })} className="block w-full outline-none">
          {medicao ? `Med ${String(medicao.numero).padStart(2, '0')}` : '—'}
        </button>
      </td>
      <td
        className={`border-b px-2 py-1.5 text-center text-muted-foreground tabular-nums ${cellBg} ${
          isActive(baseColIdx + 4) ? 'outline outline-2 outline-primary/50 -outline-offset-2' : ''
        }`}
        title="Derivado do cronograma"
        onClick={() => setActiveCell({ r: rowIdx, c: baseColIdx + 4 })}
      >
        <button data-r={rowIdx} data-c={baseColIdx + 4} tabIndex={0} onFocus={() => setActiveCell({ r: rowIdx, c: baseColIdx + 4 })} className="block w-full outline-none">
          {medicao ? fmtDateShort(medicao.data_inicio) : '—'}
        </button>
      </td>

      {renderEditableCell(5,
        'px-2 py-1.5 text-right tabular-nums',
        <span>{pedido.casas_lote != null ? formatNumber(Number(pedido.casas_lote), 0, 0) : '—'}</span>,
        <NumberInput initial={String(pedido.casas_lote ?? '')} onCommit={async v => { await onUpdatePedido(pedido.id, { casas_lote: v === '' ? null : parseFloat(v) || 0 }); commitAndClose() }} onCancel={commitAndClose} />,
      )}
      {renderEditableCell(6,
        'px-2 py-1.5 text-right tabular-nums',
        <span>{pedido.qtd_lote != null ? formatNumber(Number(pedido.qtd_lote), 2, 2) : '—'}</span>,
        <NumberInput initial={String(pedido.qtd_lote ?? '')} onCommit={async v => { await onUpdatePedido(pedido.id, { qtd_lote: v === '' ? null : parseFloat(v) || 0 }); commitAndClose() }} onCancel={commitAndClose} />,
      )}
      {renderEditableCell(7,
        'px-2 py-1.5 text-right text-muted-foreground tabular-nums',
        <span>{pedido.valor_unitario_real != null ? formatCurrency(pedido.valor_unitario_real) : '—'}</span>,
        <NumberInput initial={String(pedido.valor_unitario_real ?? '')} onCommit={async v => { await onUpdatePedido(pedido.id, { valor_unitario_real: v === '' ? null : parseBRL(v) }); commitAndClose() }} onCancel={commitAndClose} />,
      )}
      {renderEditableCell(8,
        'px-2 py-1.5 text-right font-medium tabular-nums',
        <div className="flex items-center justify-end gap-1">
          <span>{pedido.valor_total_real != null ? formatCurrency(pedido.valor_total_real) : '—'}</span>
          <span
            role="button"
            tabIndex={-1}
            onClick={e => { e.stopPropagation(); if (confirm(`Excluir Pedido #${pedido.numero_pedido}?`)) onDeletePedido(pedido.id) }}
            className="rounded p-0.5 text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
            title="Excluir pedido"
          >
            <X className="h-3 w-3" />
          </span>
        </div>,
        <NumberInput initial={String(pedido.valor_total_real ?? '')} onCommit={async v => { await onUpdatePedido(pedido.id, { valor_total_real: v === '' ? null : parseBRL(v) }); commitAndClose() }} onCancel={commitAndClose} />,
      )}
    </>
  )
}

function PedidoEmptyCells({ onAdd, rowIdx }: { onAdd?: () => void; rowIdx: number }) {
  const bg = rowIdx % 2 === 0 ? 'bg-blue-50 dark:bg-slate-900' : 'bg-blue-100 dark:bg-slate-800'
  return (
    <td colSpan={FIELDS_PER_PEDIDO_EXPANDED} className={`border-b border-l-2 border-primary/40 ${bg} px-2 py-1.5 text-center text-[11px] text-muted-foreground/60`}>
      {onAdd ? (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/20"
        >
          <Plus className="h-3 w-3" /> Adicionar pedido
        </button>
      ) : '—'}
    </td>
  )
}

// ─── Inputs ──────────────────────────────────────────────────────────────────
function TextInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  return (
    <input autoFocus value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Tab') { onCommit(v); e.preventDefault() }
        else if (e.key === 'Escape') { onCancel(); e.preventDefault() }
      }}
      className="w-full rounded border bg-background px-1 py-0.5 text-xs"
    />
  )
}

function DateInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  return (
    <input type="date" autoFocus value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Tab') { onCommit(v); e.preventDefault() }
        else if (e.key === 'Escape') { onCancel(); e.preventDefault() }
      }}
      className="w-full rounded border bg-background px-1 py-0.5 text-xs"
    />
  )
}

function NumberInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  return (
    <input type="text" inputMode="decimal" autoFocus value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Tab') { onCommit(v); e.preventDefault() }
        else if (e.key === 'Escape') { onCancel(); e.preventDefault() }
      }}
      className="w-full rounded border bg-background px-1 py-0.5 text-right text-xs tabular-nums"
    />
  )
}
