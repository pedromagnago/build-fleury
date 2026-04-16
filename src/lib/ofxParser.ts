/**
 * Build Fleury — OFX/JSON Parser Engine
 *
 * Parseia extratos bancários brasileiros em formato padronizado.
 * Suporta: OFX SGML (Caixa, Itaú), OFX XML e JSON (InfinitePay).
 * Processamento 100% client-side — nenhum dado sai do browser.
 */

// ─── Interfaces ──────────────────────────────────────────────

export interface StandardTransaction {
  fitid: string
  date: string              // ISO YYYY-MM-DD
  amount: number            // + crédito, - débito
  type: 'credit' | 'debit'
  memoRaw: string
  memoClean: string
  balance: number           // saldo acumulado
  source: 'ofx' | 'json'
}

export interface StatementMeta {
  bankId: string
  accountId: string
  startDate: string
  endDate: string
  openingBalance: number
  closingBalance: number
  currency: string
  transactionCount: number
}

export interface ParseResult {
  meta: StatementMeta
  transactions: StandardTransaction[]
  warnings: string[]
}

// ─── Format Detection ────────────────────────────────────────

type FileFormat = 'ofx-sgml' | 'ofx-xml' | 'json' | 'unknown'

function detectFormat(content: string): FileFormat {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.includes('<?xml') && trimmed.includes('<OFX')) return 'ofx-xml'
  if (trimmed.includes('<OFX') || trimmed.includes('OFXHEADER')) return 'ofx-sgml'
  return 'unknown'
}

// ─── Memo Sanitization ──────────────────────────────────────

const PRESERVED_ACRONYMS = new Set([
  'PIX', 'TED', 'DOC', 'TEV', 'TAR', 'IOF', 'CPMF',
  'SISPAG', 'GPS', 'DARF', 'GRU', 'FGTS', 'INSS',
  'NF', 'NFE', 'CTE', 'SAL', 'DEB', 'PAG',
])

function titleCase(word: string): string {
  if (word.length <= 2) return word.toLowerCase()
  if (PRESERVED_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase()
  if (/^\d+$/.test(word)) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

export function cleanMemo(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/[\r\n\t]+/g, ' ')       // Quebras de linha → espaço
    .replace(/\s{2,}/g, ' ')           // Múltiplos espaços
    .replace(/[^\w\sÀ-ü.,/\-*#@()]/g, '') // Caracteres especiais
    .trim()
    .split(/\s+/)
    .map(titleCase)
    .join(' ')
}

// ─── Date Parsing ────────────────────────────────────────────

function parseOFXDate(raw: string): string {
  if (!raw) return ''
  // YYYYMMDD[HHMMSS[.XXX][tz]]
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (digits.length < 8) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function parseJSONDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]!
}

// ─── OFX SGML Parser ────────────────────────────────────────

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = block.match(re)
  return m ? m[1]!.trim() : ''
}

function parseOFX(content: string): ParseResult {
  const warnings: string[] = []
  const transactions: StandardTransaction[] = []

  // Extract meta
  const bankId = extractTag(content, 'BANKID') || extractTag(content, 'ORG')
  const accountId = extractTag(content, 'ACCTID')
  const currency = extractTag(content, 'CURDEF') || 'BRL'
  const dtStart = parseOFXDate(extractTag(content, 'DTSTART'))
  const dtEnd = parseOFXDate(extractTag(content, 'DTEND'))
  const balAmt = parseFloat(extractTag(content, 'BALAMT')) || 0

  // Extract transactions
  const txnRegex = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = txnRegex.exec(content)) !== null) {
    const block = match[1]!
    const trnType = extractTag(block, 'TRNTYPE').toUpperCase()
    const dtPosted = parseOFXDate(extractTag(block, 'DTPOSTED'))
    const trnAmt = parseFloat(extractTag(block, 'TRNAMT')) || 0
    const fitid = extractTag(block, 'FITID') || `gen-${idx}-${Date.now()}`
    const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME')

    if (!dtPosted) {
      warnings.push(`Transação ${fitid}: data inválida`)
      continue
    }

    transactions.push({
      fitid,
      date: dtPosted,
      amount: trnAmt,
      type: trnAmt >= 0 ? 'credit' : 'debit',
      memoRaw: memo,
      memoClean: cleanMemo(memo),
      balance: 0, // calculado depois
      source: 'ofx',
    })
    idx++
  }

  if (transactions.length === 0) {
    warnings.push('Nenhuma transação encontrada no arquivo OFX')
  }

  // Sort cronologicamente + calcular saldo
  sortAndBalance(transactions, balAmt)

  return {
    meta: {
      bankId,
      accountId,
      startDate: dtStart || (transactions[0]?.date ?? ''),
      endDate: dtEnd || (transactions.at(-1)?.date ?? ''),
      openingBalance: balAmt,
      closingBalance: transactions.at(-1)?.balance ?? balAmt,
      currency,
      transactionCount: transactions.length,
    },
    transactions,
    warnings,
  }
}

// ─── JSON Parser (InfinitePay / Fintechs) ────────────────────

function parseJSON(content: string): ParseResult {
  const warnings: string[] = []
  const transactions: StandardTransaction[] = []

  let json: any
  try {
    json = JSON.parse(content)
  } catch {
    return { meta: emptyMeta(), transactions: [], warnings: ['JSON inválido'] }
  }

  const items = Array.isArray(json) ? json : (json.data ?? json.transactions ?? json.items ?? [])

  if (!Array.isArray(items) || items.length === 0) {
    return { meta: emptyMeta(), transactions: [], warnings: ['Nenhuma transação no JSON'] }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const date = parseJSONDate(item.dateTime || item.date || item.created_at || '')
    if (!date) { warnings.push(`Item ${i}: data inválida`); continue }

    // Valor: rawAmount (centavos) ou amount (string com vírgula)
    let amount: number
    if (item.rawAmount != null) {
      amount = Number(item.rawAmount) / 100
    } else if (item.amount != null) {
      amount = parseFloat(String(item.amount).replace(/\./g, '').replace(',', '.'))
    } else {
      amount = parseFloat(String(item.value || item.valor || 0).replace(',', '.'))
    }

    // Direção
    const dir = (item.direction || item.tipo || '').toLowerCase()
    const isDebit = dir === 'out' || dir === 'debito' || dir === 'debit' || amount < 0
    if (isDebit && amount > 0) amount = -amount

    const memo = item.title || item.description || item.descricao || item.memo || ''
    const fitid = item.id || item.fitid || `json-${i}-${Date.now()}`

    transactions.push({
      fitid: String(fitid),
      date,
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      memoRaw: memo,
      memoClean: cleanMemo(memo),
      balance: 0,
      source: 'json',
    })
  }

  sortAndBalance(transactions, 0)

  return {
    meta: {
      bankId: 'fintech',
      accountId: json.accountId || '',
      startDate: transactions[0]?.date ?? '',
      endDate: transactions.at(-1)?.date ?? '',
      openingBalance: 0,
      closingBalance: transactions.at(-1)?.balance ?? 0,
      currency: 'BRL',
      transactionCount: transactions.length,
    },
    transactions,
    warnings,
  }
}

// ─── Sorting & Balance Calc ──────────────────────────────────

function sortAndBalance(txns: StandardTransaction[], openingBalance: number): void {
  // Ordenação estável: data ASC, depois posição original mantida
  txns.sort((a, b) => a.date.localeCompare(b.date))

  let bal = openingBalance
  for (const t of txns) {
    bal += t.amount
    t.balance = Math.round(bal * 100) / 100
  }
}

// ─── Public API ──────────────────────────────────────────────

function emptyMeta(): StatementMeta {
  return { bankId: '', accountId: '', startDate: '', endDate: '', openingBalance: 0, closingBalance: 0, currency: 'BRL', transactionCount: 0 }
}

/**
 * Parseia um arquivo de extrato bancário (OFX ou JSON).
 * Retorna transações padronizadas com saldo acumulado.
 */
export function parseStatement(content: string): ParseResult {
  const format = detectFormat(content)
  switch (format) {
    case 'ofx-sgml':
    case 'ofx-xml':
      return parseOFX(content)
    case 'json':
      return parseJSON(content)
    default:
      return { meta: emptyMeta(), transactions: [], warnings: ['Formato não reconhecido'] }
  }
}

/**
 * Lê um File do browser e retorna o conteúdo como string.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    // Tenta Latin-1 primeiro (comum em OFX brasileiros), fallback UTF-8
    reader.readAsText(file, file.name.toLowerCase().endsWith('.ofx') ? 'latin1' : 'utf-8')
  })
}
