/**
 * Build Fleury — Reconciliation Engine
 *
 * Cruza transações bancárias (StandardTransaction[]) com
 * parcelas do ERP (PayableReceivable[]) usando 4 estratégias
 * em cascata: Exact → Key → Grouped → Partial.
 *
 * Complexidade: O(T × P) otimizado com Maps de pré-indexação.
 */

import type { StandardTransaction } from './ofxParser'

// ─── Interfaces ──────────────────────────────────────────────

export type MatchType = 'exact' | 'key' | 'grouped' | 'partial' | 'rule' | 'none'

export interface PayableReceivable {
  id: string
  valor: number
  dataVencimento: string         // ISO date
  dataPagamento: string | null   // ISO date — when actually paid
  valorPago: number | null       // valor efetivamente pago
  status: string
  descricao: string | null
  fornecedorNome: string | null
  documentoRef: string | null    // NF, CNPJ, etc.
  tipo: 'pagar' | 'receber'
}

export interface MatchedParcela {
  parcela: PayableReceivable
  valorAplicado: number
}

export interface ReconciliationMatch {
  transaction: StandardTransaction
  matchType: MatchType
  confidence: number              // 0-100
  parcelas: MatchedParcela[]
  diferenca: number               // valor não explicado
  sugestaoDiferenca: string | null
}

export interface BankRule {
  id: string
  padraoTexto: string
  tipoMatch: 'contains' | 'exact' | 'regex'
  valorMin: number | null
  valorMax: number | null
  acao: 'classificar' | 'ignorar' | 'auto_conciliar'
  categoria: string | null
  fornecedorNome: string | null
  descricaoPadrao: string | null
}

export interface ReconciliationConfig {
  toleranciaDias: number          // default: 3
  toleranciaValor: number         // default: 0.50 (centavos)
  toleranciaTaxa: number          // default: 0.05 (5%)
  maxGroupSize: number            // default: 5
  bankRules: BankRule[]           // regras bancárias
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[]
  stats: {
    total: number
    rule: number
    exact: number
    key: number
    grouped: number
    partial: number
    noMatch: number
    valorConciliado: number
    valorPendente: number
  }
}

// ─── Config Default ──────────────────────────────────────────

const DEFAULT_CONFIG: ReconciliationConfig = {
  toleranciaDias: 3,
  toleranciaValor: 0.50,
  toleranciaTaxa: 0.05,
  maxGroupSize: 5,
  bankRules: [],
}

// ─── Helpers ─────────────────────────────────────────────────

function daysDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000))
}

function valuesMatch(a: number, b: number, tol: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tol
}

function normalizeText(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Extrai possíveis chaves de identificação do memo bancário */
function extractKeys(memo: string): { nfs: string[]; cnpjs: string[]; pixIds: string[] } {
  const nfs: string[] = []
  const cnpjs: string[] = []
  const pixIds: string[] = []

  // NF-e: "NF 12345" ou "NFE12345" ou "NOTA 12345"
  const nfMatch = memo.match(/(?:nf[e-]?\s*|nota\s*(?:fiscal)?\s*)(\d{3,9})/gi)
  if (nfMatch) nfMatch.forEach(m => { const n = m.replace(/\D/g, ''); if (n) nfs.push(n) })

  // CNPJ: 14 dígitos (com ou sem pontuação)
  const cnpjMatch = memo.replace(/[./-]/g, '').match(/\d{14}/g)
  if (cnpjMatch) cnpjs.push(...cnpjMatch)

  // CPF: 11 dígitos
  const cpfMatch = memo.replace(/[.-]/g, '').match(/\d{11}/g)
  if (cpfMatch) cnpjs.push(...cpfMatch) // tratamos CPF como CNPJ para matching

  // PIX E2E ID: "E + 8 dígitos ISPB + ..."
  const pixMatch = memo.match(/E\d{8,32}/gi)
  if (pixMatch) pixIds.push(...pixMatch.map(s => s.toUpperCase()))

  return { nfs, cnpjs, pixIds }
}

// ─── Index Builder ───────────────────────────────────────────

interface ParcelaIndex {
  byDate: Map<string, PayableReceivable[]>        // data_vencimento → parcelas
  byNearDate: (date: string, tol: number) => PayableReceivable[]
  byDocRef: Map<string, PayableReceivable[]>       // NF/CNPJ normalizado → parcelas
  remaining: Set<string>                           // IDs ainda não matchados
}

function buildIndex(parcelas: PayableReceivable[]): ParcelaIndex {
  const byDate = new Map<string, PayableReceivable[]>()
  const byDocRef = new Map<string, PayableReceivable[]>()
  const remaining = new Set<string>()

  for (const p of parcelas) {
    // Include ALL parcels — paid and pending
    // Paid parcels are matched against bank debits
    // Pending parcels can also match (payment not yet registered in system)
    remaining.add(p.id)

    // Use dataPagamento for paid parcels, dataVencimento for pending
    const dateKey = p.dataPagamento || p.dataVencimento
    if (!byDate.has(dateKey)) byDate.set(dateKey, [])
    byDate.get(dateKey)!.push(p)

    // Index por documento de referência
    if (p.documentoRef) {
      const key = normalizeText(p.documentoRef)
      if (!byDocRef.has(key)) byDocRef.set(key, [])
      byDocRef.get(key)!.push(p)
    }
    if (p.fornecedorNome) {
      const key = normalizeText(p.fornecedorNome)
      if (!byDocRef.has(key)) byDocRef.set(key, [])
      byDocRef.get(key)!.push(p)
    }
  }

  const byNearDate = (date: string, tol: number): PayableReceivable[] => {
    const result: PayableReceivable[] = []
    for (const [d, ps] of byDate) {
      if (daysDiff(date, d) <= tol) {
        result.push(...ps.filter(p => remaining.has(p.id)))
      }
    }
    return result
  }

  return { byDate, byNearDate, byDocRef, remaining }
}

// ─── Strategy 0: Rule Match ─────────────────────────────────

function matchesRule(rule: BankRule, memo: string, amount: number): boolean {
  const memoNorm = normalizeText(memo)
  const patternNorm = normalizeText(rule.padraoTexto)
  
  let textMatch = false
  if (rule.tipoMatch === 'contains') {
    textMatch = memoNorm.includes(patternNorm)
  } else if (rule.tipoMatch === 'exact') {
    textMatch = memoNorm === patternNorm
  } else if (rule.tipoMatch === 'regex') {
    try { textMatch = new RegExp(rule.padraoTexto, 'i').test(memo) } catch { textMatch = false }
  }
  if (!textMatch) return false
  
  const absAmount = Math.abs(amount)
  if (rule.valorMin != null && absAmount < rule.valorMin) return false
  if (rule.valorMax != null && absAmount > rule.valorMax) return false
  
  return true
}

function tryRuleMatch(
  txn: StandardTransaction,
  rules: BankRule[],
): ReconciliationMatch | null {
  if (rules.length === 0) return null
  const memo = txn.memoRaw + ' ' + txn.memoClean
  
  for (const rule of rules) {
    if (matchesRule(rule, memo, txn.amount)) {
      return {
        transaction: txn,
        matchType: 'rule',
        confidence: rule.acao === 'auto_conciliar' ? 95 : 80,
        parcelas: [],
        diferenca: txn.amount,
        sugestaoDiferenca: rule.acao === 'ignorar' 
          ? 'Ignorado por regra' 
          : rule.categoria || rule.descricaoPadrao || 'Classificado por regra',
      }
    }
  }
  return null
}

// ─── Strategy 1: Exact Match ────────────────────────────────

function tryExactMatch(
  txn: StandardTransaction,
  idx: ParcelaIndex,
  cfg: ReconciliationConfig,
): ReconciliationMatch | null {
  const absAmount = Math.abs(txn.amount)
  const candidates = idx.byNearDate(txn.date, cfg.toleranciaDias)
    .filter(p => {
      const compareValue = (p.valorPago && p.status === 'paga') ? p.valorPago : p.valor
      return valuesMatch(compareValue, absAmount, cfg.toleranciaValor)
    })

  if (candidates.length === 0) return null

  // Paid parcels first, then by date proximity
  candidates.sort((a, b) => {
    const aPaid = a.status === 'paga' ? 0 : 1
    const bPaid = b.status === 'paga' ? 0 : 1
    if (aPaid !== bPaid) return aPaid - bPaid
    const dateA = a.dataPagamento || a.dataVencimento
    const dateB = b.dataPagamento || b.dataVencimento
    return daysDiff(txn.date, dateA) - daysDiff(txn.date, dateB)
  })
  
  const best = candidates[0]!
  const bestDate = best.dataPagamento || best.dataVencimento
  const diff = daysDiff(txn.date, bestDate)
  const baseConf = best.status === 'paga' ? 100 : 95
  const confidence = diff === 0 ? baseConf : Math.max(70, baseConf - diff * 10)
  
  // Fornecedor name match bonus
  const memoNorm = normalizeText(txn.memoRaw + ' ' + txn.memoClean)
  const fornecedorMatch = best.fornecedorNome && memoNorm.includes(normalizeText(best.fornecedorNome))

  return {
    transaction: txn,
    matchType: 'exact',
    confidence: Math.min(100, confidence + (fornecedorMatch ? 5 : 0)),
    parcelas: [{ parcela: best, valorAplicado: best.valorPago ?? best.valor }],
    diferenca: Math.round((absAmount - (best.valorPago ?? best.valor)) * 100) / 100,
    sugestaoDiferenca: null,
  }
}

// ─── Strategy 2: Key Match ──────────────────────────────────

function tryKeyMatch(
  txn: StandardTransaction,
  idx: ParcelaIndex,
): ReconciliationMatch | null {
  const keys = extractKeys(txn.memoRaw + ' ' + txn.memoClean)
  const absAmount = Math.abs(txn.amount)
  const candidates: PayableReceivable[] = []

  // Busca por NF
  for (const nf of keys.nfs) {
    const key = normalizeText(nf)
    for (const [docKey, ps] of idx.byDocRef) {
      if (docKey.includes(key)) candidates.push(...ps.filter(p => idx.remaining.has(p.id)))
    }
  }

  // Busca por CNPJ/CPF
  for (const cnpj of keys.cnpjs) {
    const key = normalizeText(cnpj)
    for (const [docKey, ps] of idx.byDocRef) {
      if (docKey.includes(key)) candidates.push(...ps.filter(p => idx.remaining.has(p.id)))
    }
  }

  // Busca por nome no memo
  const memoNorm = normalizeText(txn.memoRaw)
  for (const [docKey, ps] of idx.byDocRef) {
    if (memoNorm.includes(docKey) && docKey.length >= 4) {
      candidates.push(...ps.filter(p => idx.remaining.has(p.id)))
    }
  }

  // Deduplica
  const unique = [...new Map(candidates.map(c => [c.id, c])).values()]
  if (unique.length === 0) return null

  // Tenta match exato de valor entre os candidatos
  const exactValue = unique.find(p => valuesMatch(p.valor, absAmount, 0.05))
  if (exactValue) {
    return {
      transaction: txn,
      matchType: 'key',
      confidence: 90,
      parcelas: [{ parcela: exactValue, valorAplicado: exactValue.valor }],
      diferenca: Math.round((absAmount - exactValue.valor) * 100) / 100,
      sugestaoDiferenca: null,
    }
  }

  // Se não bateu valor exato, retorna o mais próximo com confiança menor
  unique.sort((a, b) => Math.abs(a.valor - absAmount) - Math.abs(b.valor - absAmount))
  const best = unique[0]!
  const valDiff = Math.abs(best.valor - absAmount)
  if (valDiff / absAmount > 0.10) return null // diferença > 10% = ignora

  return {
    transaction: txn,
    matchType: 'key',
    confidence: 70,
    parcelas: [{ parcela: best, valorAplicado: best.valor }],
    diferenca: Math.round((absAmount - best.valor) * 100) / 100,
    sugestaoDiferenca: valDiff > 0.05 ? 'Taxa Bancária / Desconto' : null,
  }
}

// ─── Strategy 3: Grouped Match (1:N) ────────────────────────

function tryGroupedMatch(
  txn: StandardTransaction,
  idx: ParcelaIndex,
  cfg: ReconciliationConfig,
): ReconciliationMatch | null {
  const absAmount = Math.abs(txn.amount)
  const candidates = idx.byNearDate(txn.date, cfg.toleranciaDias)
    .filter(p => p.valor < absAmount) // só parcelas menores que o total

  if (candidates.length < 2) return null

  // Ordenar por valor decrescente para greedy
  candidates.sort((a, b) => b.valor - a.valor)

  // Tentar combinações (backtracking limitado pelo maxGroupSize)
  const bestGroup = findSubsetSum(candidates, absAmount, cfg.toleranciaValor, cfg.maxGroupSize)
  if (!bestGroup || bestGroup.length < 2) return null

  const sumGroup = bestGroup.reduce((s, p) => s + p.valor, 0)
  const diff = Math.round((absAmount - sumGroup) * 100) / 100

  return {
    transaction: txn,
    matchType: 'grouped',
    confidence: Math.abs(diff) < 0.01 ? 95 : 80,
    parcelas: bestGroup.map(p => ({ parcela: p, valorAplicado: p.valor })),
    diferenca: diff,
    sugestaoDiferenca: Math.abs(diff) > 0.05 ? 'Arredondamento' : null,
  }
}

/** Encontra um subconjunto de parcelas cuja soma ≈ target */
function findSubsetSum(
  items: PayableReceivable[],
  target: number,
  tolerance: number,
  maxSize: number,
): PayableReceivable[] | null {
  let bestResult: PayableReceivable[] | null = null
  let bestDiff = Infinity

  function backtrack(start: number, current: PayableReceivable[], currentSum: number): void {
    // Checa se match
    const diff = Math.abs(currentSum - target)
    if (diff < bestDiff && current.length >= 2) {
      bestDiff = diff
      bestResult = [...current]
    }
    if (diff <= tolerance && current.length >= 2) return // found good enough

    if (current.length >= maxSize) return
    if (currentSum > target + tolerance) return // pruning

    for (let i = start; i < items.length && i < start + 20; i++) {
      current.push(items[i]!)
      backtrack(i + 1, current, currentSum + items[i]!.valor)
      current.pop()
      if (bestDiff <= tolerance) return // early exit
    }
  }

  backtrack(0, [], 0)
  return bestDiff <= tolerance ? bestResult : null
}

// ─── Strategy 4: Partial Match ──────────────────────────────

function tryPartialMatch(
  txn: StandardTransaction,
  idx: ParcelaIndex,
  cfg: ReconciliationConfig,
): ReconciliationMatch | null {
  const absAmount = Math.abs(txn.amount)
  const candidates = idx.byNearDate(txn.date, cfg.toleranciaDias + 5) // tolerância maior

  // Procura parcela onde o valor é próximo mas não exato
  const partial = candidates
    .filter(p => {
      const diff = Math.abs(p.valor - absAmount)
      const pct = diff / Math.max(p.valor, 1)
      return diff > cfg.toleranciaValor && pct <= cfg.toleranciaTaxa
    })
    .sort((a, b) => Math.abs(a.valor - absAmount) - Math.abs(b.valor - absAmount))

  if (partial.length === 0) return null

  const best = partial[0]!
  const diff = Math.round((absAmount - best.valor) * 100) / 100

  let sugestao: string
  if (diff < 0) {
    sugestao = 'Taxa Bancária / Tarifa'
  } else if (diff > 0) {
    sugestao = 'Juros / Multa Recebida'
  } else {
    sugestao = 'Arredondamento'
  }

  return {
    transaction: txn,
    matchType: 'partial',
    confidence: 60,
    parcelas: [{ parcela: best, valorAplicado: best.valor }],
    diferenca: diff,
    sugestaoDiferenca: sugestao,
  }
}

// ─── Main Engine ─────────────────────────────────────────────

/**
 * Executa a conciliação financeira automática.
 *
 * @param transactions - Transações do extrato bancário (output do parser)
 * @param payables - Parcelas a pagar/receber do ERP
 * @param config - Configurações de tolerância (opcional)
 * @returns Resultado com matches e estatísticas
 */
export function reconcile(
  transactions: StandardTransaction[],
  payables: PayableReceivable[],
  config?: Partial<ReconciliationConfig>,
): ReconciliationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const idx = buildIndex(payables)
  const matches: ReconciliationMatch[] = []

  let exact = 0, key = 0, grouped = 0, partial = 0, rule = 0, noMatch = 0
  let valorConciliado = 0, valorPendente = 0

  for (const txn of transactions) {
    // Cascade: Rule → Exact → Key → Grouped → Partial
    let result =
      tryRuleMatch(txn, cfg.bankRules) ??
      tryExactMatch(txn, idx, cfg) ??
      tryKeyMatch(txn, idx) ??
      tryGroupedMatch(txn, idx, cfg) ??
      tryPartialMatch(txn, idx, cfg)

    if (result) {
      // Remove parcelas matchadas do pool
      for (const mp of result.parcelas) {
        idx.remaining.delete(mp.parcela.id)
      }

      valorConciliado += Math.abs(txn.amount)
      switch (result.matchType) {
        case 'rule': rule++; break
        case 'exact': exact++; break
        case 'key': key++; break
        case 'grouped': grouped++; break
        case 'partial': partial++; break
      }
    } else {
      result = {
        transaction: txn,
        matchType: 'none',
        confidence: 0,
        parcelas: [],
        diferenca: txn.amount,
        sugestaoDiferenca: null,
      }
      noMatch++
      valorPendente += Math.abs(txn.amount)
    }

    matches.push(result)
  }

  return {
    matches,
    stats: {
      total: transactions.length,
      rule,
      exact,
      key,
      grouped,
      partial,
      noMatch,
      valorConciliado,
      valorPendente,
    },
  }
}
