/**
 * Build Fleury — Simulador Engine
 *
 * Lógica pura de cascata em memória. Sem React, sem Supabase.
 * 
 * Regra financeira central:
 *   ORÇADO = CONSUMIDO + PLANEJADO_FIRME + PLANEJADO_BRUTO
 *
 * Nível 1 (bruto): itens SEM pedido → projetados na data da etapa
 * Nível 2 (firme): itens COM pedido → parcelas com data de vencimento
 *
 * Cadeia: Etapa(data) → Pedido(entrega) → Parcela(vencimento) → Fluxo de caixa(saldo)
 */

import { parsearCondicao, ajustarDiaUtil, localDate } from './parcelas'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SimEtapa {
  id: string; codigo: string; nome: string; ordem: number
  data_inicio_plan: string | null; data_fim_plan: string | null
  sim_data_inicio: string | null; sim_data_fim: string | null
  delta_dias: number; modified: boolean
}

export interface SimPedido {
  id: string; item_compra_id: string; etapa_id: string
  fornecedor_id: string | null; fornecedor_nome: string | null
  item_descricao: string | null; cond_pagamento: string | null
  valor_total_real: number; data_entrega_prevista: string | null
  sim_data_entrega: string | null; modified: boolean
}

export interface SimParcela {
  id: string; pedido_id: string | null; numero_parcela: number
  valor: number; data_vencimento: string; status: string
  valor_pago: number
  sim_data_vencimento: string; sim_valor: number; modified: boolean
  fornecedor_nome: string | null; etapa_nome: string | null
}

export interface SimMedicao {
  id: string; numero: number; valor_planejado: number
  data_prevista: string; status: string; valor_liberado: number
  sim_data_prevista: string; delta_dias: number; modified: boolean
}

export interface SimFornecedor {
  id: string; nome: string; cond_pagamento_padrao: string | null
  sim_cond_pagamento: string | null; modified: boolean
}

export interface SimItemCompra {
  id: string; etapa_id: string; descricao: string
  valor_total_orcado: number; valor_consumido: number
  fornecedor_nome: string | null; etapa_nome: string | null
}

export interface SimSnapshot {
  etapas: SimEtapa[]; pedidos: SimPedido[]; parcelas: SimParcela[]
  medicoes: SimMedicao[]; fornecedores: SimFornecedor[]
  itensCompra: SimItemCompra[]; saldoInicial: number
}

export interface CashFlowPoint {
  date: string; entradas: number; saidasFirme: number; saidasBruto: number
  saldo: number
}

export interface SimMetrics {
  saldoMinimo: { valor: number; data: string }
  diasNegativos: number
  piorSemana: { valor: number; semana: string }
  dataCritica: string | null
  custoTotal: number
}

export interface ParcelaImpacto {
  fornecedor_nome: string; etapa_nome: string; valor: number
  vencimento_base: string; vencimento_cenario: string; delta_dias: number
}

export type Adjustment =
  | { type: 'mover_etapa'; etapaId: string; deltaDias: number }
  | { type: 'alterar_cond_fornecedor'; fornecedorId: string; novaCond: string }
  | { type: 'adiar_medicao'; medicaoId: string; novaData: string }

// ═══════════════════════════════════════════════════════════════
// Date helpers
// ═══════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000

function addDays(iso: string, days: number): string {
  const d = localDate(iso); d.setDate(d.getDate() + days); return fmtISO(d)
}

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diffDays(a: string, b: string): number {
  return Math.round((localDate(a).getTime() - localDate(b).getTime()) / DAY_MS)
}

function weekKey(iso: string): string {
  const d = localDate(iso); const day = d.getDay()
  const mon = new Date(d.getTime() - (day === 0 ? 6 : day - 1) * DAY_MS)
  return fmtISO(mon)
}

// ═══════════════════════════════════════════════════════════════
// Build base snapshot
// ═══════════════════════════════════════════════════════════════

export function buildBaseSnapshot(
  etapas: any[], pedidos: any[], parcelas: any[], medicoes: any[],
  fornecedores: any[], itensCompra: any[], saldoInicial: number,
): SimSnapshot {
  return {
    etapas: etapas.map(e => ({
      id: e.id, codigo: e.codigo, nome: e.nome, ordem: e.ordem,
      data_inicio_plan: e.data_inicio_plan, data_fim_plan: e.data_fim_plan,
      sim_data_inicio: e.data_inicio_plan, sim_data_fim: e.data_fim_plan,
      delta_dias: 0, modified: false,
    })),
    pedidos: pedidos.map(p => ({
      id: p.id, item_compra_id: p.item_compra_id, etapa_id: p.etapa_id ?? '',
      fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome ?? null,
      item_descricao: p.item_descricao ?? null, cond_pagamento: p.cond_pagamento,
      valor_total_real: p.valor_total_real ?? 0,
      data_entrega_prevista: p.data_entrega_prevista,
      sim_data_entrega: p.data_entrega_prevista, modified: false,
    })),
    parcelas: parcelas.map(p => ({
      id: p.id, pedido_id: p.pedido_id, numero_parcela: p.numero_parcela,
      valor: p.valor, data_vencimento: p.data_vencimento, status: p.status,
      valor_pago: p.valor_pago ?? 0,
      sim_data_vencimento: p.data_vencimento, sim_valor: p.valor, modified: false,
      fornecedor_nome: p.fornecedor_nome ?? null, etapa_nome: p.etapa_nome ?? null,
    })),
    medicoes: medicoes.map(m => ({
      id: m.id, numero: m.numero, valor_planejado: m.valor_planejado,
      data_prevista: m.data_prevista, status: m.status, valor_liberado: m.valor_liberado ?? 0,
      sim_data_prevista: m.data_prevista, delta_dias: 0, modified: false,
    })),
    fornecedores: fornecedores.map(f => ({
      id: f.id, nome: f.nome, cond_pagamento_padrao: f.cond_pagamento_padrao,
      sim_cond_pagamento: null, modified: false,
    })),
    itensCompra: itensCompra.map(i => ({
      id: i.id, etapa_id: i.etapa_id, descricao: i.descricao,
      valor_total_orcado: i.valor_total_orcado ?? 0, valor_consumido: i.valor_consumido ?? 0,
      fornecedor_nome: i.fornecedor_nome ?? null, etapa_nome: i.etapa_nome ?? null,
    })),
    saldoInicial,
  }
}

// ═══════════════════════════════════════════════════════════════
// Apply adjustments
// ═══════════════════════════════════════════════════════════════

export function applyAdjustments(base: SimSnapshot, adjustments: Adjustment[]): SimSnapshot {
  const snap: SimSnapshot = {
    etapas: base.etapas.map(e => ({ ...e, sim_data_inicio: e.data_inicio_plan, sim_data_fim: e.data_fim_plan, delta_dias: 0, modified: false })),
    pedidos: base.pedidos.map(p => ({ ...p, sim_data_entrega: p.data_entrega_prevista, modified: false })),
    parcelas: base.parcelas.map(p => ({ ...p, sim_data_vencimento: p.data_vencimento, sim_valor: p.valor, modified: false })),
    medicoes: base.medicoes.map(m => ({ ...m, sim_data_prevista: m.data_prevista, delta_dias: 0, modified: false })),
    fornecedores: base.fornecedores.map(f => ({ ...f, sim_cond_pagamento: null, modified: false })),
    itensCompra: base.itensCompra.map(i => ({ ...i })),
    saldoInicial: base.saldoInicial,
  }

  const etapaDeltas = new Map<string, number>()
  const fornecedorConds = new Map<string, string>()
  const medicaoMoves = new Map<string, string>()

  for (const adj of adjustments) {
    if (adj.type === 'mover_etapa') etapaDeltas.set(adj.etapaId, adj.deltaDias)
    else if (adj.type === 'alterar_cond_fornecedor') fornecedorConds.set(adj.fornecedorId, adj.novaCond)
    else if (adj.type === 'adiar_medicao') medicaoMoves.set(adj.medicaoId, adj.novaData)
  }

  // 1. Etapas
  for (const et of snap.etapas) {
    const d = etapaDeltas.get(et.id)
    if (d && d !== 0) {
      et.delta_dias = d; et.modified = true
      if (et.data_inicio_plan) et.sim_data_inicio = addDays(et.data_inicio_plan, d)
      if (et.data_fim_plan) et.sim_data_fim = addDays(et.data_fim_plan, d)
    }
  }

  // 2. Fornecedores
  for (const f of snap.fornecedores) {
    const nc = fornecedorConds.get(f.id)
    if (nc) { f.sim_cond_pagamento = nc; f.modified = true }
  }

  // 3. Medições
  for (const m of snap.medicoes) {
    const nd = medicaoMoves.get(m.id)
    if (nd) { m.sim_data_prevista = nd; m.delta_dias = diffDays(nd, m.data_prevista); m.modified = true }
  }

  // 4. Cascade pedidos + parcelas
  for (const ped of snap.pedidos) {
    const eDelta = etapaDeltas.get(ped.etapa_id) ?? 0
    const forn = ped.fornecedor_id ? snap.fornecedores.find(f => f.id === ped.fornecedor_id) : null
    const condChanged = forn?.modified && forn.sim_cond_pagamento

    if (eDelta !== 0 && ped.data_entrega_prevista) {
      ped.sim_data_entrega = addDays(ped.data_entrega_prevista, eDelta); ped.modified = true
    }

    if ((ped.modified || condChanged) && ped.sim_data_entrega) {
      const cond = condChanged ? forn!.sim_cond_pagamento! : (ped.cond_pagamento ?? 'à vista')
      const dias = parsearCondicao(cond)
      const dataEnt = localDate(ped.sim_data_entrega)
      const pedParcelas = snap.parcelas.filter(p => p.pedido_id === ped.id)
      const naoPagas = pedParcelas.filter(p => p.status !== 'paga' && p.status !== 'parcialmente_paga')
      const pagas = pedParcelas.filter(p => p.status === 'paga' || p.status === 'parcialmente_paga')
      const valorJaPago = pagas.reduce((s, p) => s + p.valor_pago, 0)
      const valorRestante = Math.max(0, ped.valor_total_real - valorJaPago)

      if (naoPagas.length > 0 && valorRestante > 0 && dias.length > 0) {
        const n = dias.length
        const valorBase = Math.floor((valorRestante * 100) / n) / 100
        const somaBase = Math.round(valorBase * (n - 1) * 100) / 100
        const valorUlt = Math.round((valorRestante - somaBase) * 100) / 100

        for (let i = 0; i < naoPagas.length; i++) {
          const parc = naoPagas[i]!
          if (i < n) {
            const dv = new Date(dataEnt.getTime()); dv.setDate(dv.getDate() + dias[i]!)
            parc.sim_data_vencimento = fmtISO(ajustarDiaUtil(dv))
            parc.sim_valor = i === n - 1 ? valorUlt : valorBase
          } else {
            parc.sim_valor = 0
          }
          parc.modified = true
        }
      }
    }
  }

  return snap
}

// ═══════════════════════════════════════════════════════════════
// Compute cash flow with Level 1 (bruto) + Level 2 (firme)
// ═══════════════════════════════════════════════════════════════

export function computeCashFlow(snapshot: SimSnapshot, useSimulated: boolean): CashFlowPoint[] {
  const entradas = new Map<string, number>()
  const saidasFirme = new Map<string, number>()
  const saidasBruto = new Map<string, number>()

  // Entradas: medições futuras
  for (const m of snapshot.medicoes) {
    const val = m.valor_planejado - m.valor_liberado
    if (val <= 0) continue
    const date = useSimulated ? m.sim_data_prevista : m.data_prevista
    if (date) entradas.set(date, (entradas.get(date) ?? 0) + val)
  }

  // Nível 2 (firme): parcelas não pagas
  for (const p of snapshot.parcelas) {
    if (p.status === 'paga') continue
    const date = useSimulated ? p.sim_data_vencimento : p.data_vencimento
    const val = useSimulated ? p.sim_valor : p.valor
    if (val > 0 && date) saidasFirme.set(date, (saidasFirme.get(date) ?? 0) + val)
  }

  // Nível 1 (bruto): itens sem pedido completo → projetados na data da etapa
  const pedidosPorItem = new Map<string, number>()
  for (const ped of snapshot.pedidos) {
    pedidosPorItem.set(ped.item_compra_id, (pedidosPorItem.get(ped.item_compra_id) ?? 0) + ped.valor_total_real)
  }
  for (const item of snapshot.itensCompra) {
    const comPedido = pedidosPorItem.get(item.id) ?? 0
    const semPedido = Math.max(0, item.valor_total_orcado - comPedido - item.valor_consumido)
    if (semPedido <= 0) continue
    const etapa = snapshot.etapas.find(e => e.id === item.etapa_id)
    if (!etapa) continue
    const date = useSimulated ? etapa.sim_data_inicio : etapa.data_inicio_plan
    if (date) saidasBruto.set(date, (saidasBruto.get(date) ?? 0) + semPedido)
  }

  // Build weekly series
  const allDates = new Set([...entradas.keys(), ...saidasFirme.keys(), ...saidasBruto.keys()])
  if (allDates.size === 0) return []

  const sorted = [...allDates].sort()
  const startStr = sorted[0]!
  const endDate = localDate(sorted[sorted.length - 1]!)
  endDate.setDate(endDate.getDate() + 30)
  const extEnd = fmtISO(endDate)

  const points: CashFlowPoint[] = []
  let saldo = snapshot.saldoInicial
  let cur = startStr, wkIn = 0, wkFirme = 0, wkBruto = 0, curWk = weekKey(cur)

  while (cur <= extEnd) {
    const wk = weekKey(cur)
    if (wk !== curWk) {
      points.push({ date: curWk, entradas: wkIn, saidasFirme: wkFirme, saidasBruto: wkBruto, saldo })
      curWk = wk; wkIn = 0; wkFirme = 0; wkBruto = 0
    }
    const dIn = entradas.get(cur) ?? 0
    const dFirme = saidasFirme.get(cur) ?? 0
    const dBruto = saidasBruto.get(cur) ?? 0
    saldo += dIn - dFirme - dBruto
    wkIn += dIn; wkFirme += dFirme; wkBruto += dBruto
    cur = addDays(cur, 1)
  }
  points.push({ date: curWk, entradas: wkIn, saidasFirme: wkFirme, saidasBruto: wkBruto, saldo })
  return points
}

// ═══════════════════════════════════════════════════════════════
// Metrics
// ═══════════════════════════════════════════════════════════════

export function computeMetrics(flow: CashFlowPoint[]): SimMetrics {
  let sMin = { valor: Infinity, data: '' }, diasNeg = 0
  let piorSem = { valor: 0, semana: '' }, dataCrit: string | null = null, custo = 0

  for (const p of flow) {
    custo += p.saidasFirme + p.saidasBruto
    if (p.saldo < sMin.valor) sMin = { valor: p.saldo, data: p.date }
    if (p.saldo < 0) { diasNeg += 7; if (!dataCrit) dataCrit = p.date }
    const saLiq = p.saidasFirme + p.saidasBruto - p.entradas
    if (saLiq > piorSem.valor) piorSem = { valor: saLiq, semana: p.date }
  }
  if (sMin.valor === Infinity) sMin = { valor: 0, data: '' }
  return { saldoMinimo: sMin, diasNegativos: diasNeg, piorSemana: piorSem, dataCritica: dataCrit, custoTotal: custo }
}

// ═══════════════════════════════════════════════════════════════
// Diff parcelas (impact table)
// ═══════════════════════════════════════════════════════════════

export function diffParcelas(snap: SimSnapshot): ParcelaImpacto[] {
  return snap.parcelas
    .filter(p => p.modified && p.status !== 'paga')
    .map(p => ({
      fornecedor_nome: p.fornecedor_nome ?? '—', etapa_nome: p.etapa_nome ?? '—',
      valor: p.sim_valor, vencimento_base: p.data_vencimento,
      vencimento_cenario: p.sim_data_vencimento,
      delta_dias: diffDays(p.sim_data_vencimento, p.data_vencimento),
    }))
    .sort((a, b) => Math.abs(b.delta_dias) - Math.abs(a.delta_dias))
}

export function countChanges(snap: SimSnapshot): number {
  let n = 0
  for (const e of snap.etapas) if (e.modified) n++
  for (const f of snap.fornecedores) if (f.modified) n++
  for (const m of snap.medicoes) if (m.modified) n++
  return n
}
