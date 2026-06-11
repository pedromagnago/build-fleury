/**
 * Safe XLSX wrapper — leitura/escrita de planilhas via exceljs.
 *
 * Substitui o pacote xlsx@0.18.5 (abandonado, CVE GHSA-4r6h-8v6p-xvw6 de
 * Prototype Pollution). A leitura normaliza células (richText, hyperlink,
 * fórmula → resultado; Date → ISO YYYY-MM-DD) e nunca usa chaves vindas do
 * arquivo sem sanitizar __proto__/constructor/prototype.
 *
 * Compatibilidade: exceljs só lê .xlsx. Arquivos .xls legados (BIFF) caem
 * num fallback que carrega o xlsx sob demanda (dynamic import) e sanitiza a
 * saída; CSV cai num parser próprio. Assim os inputs que aceitam .xls/.csv
 * continuam funcionando.
 */
import { Workbook, type Worksheet, type CellValue as ExcelCellValue } from 'exceljs'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Keys that enable Prototype Pollution attacks
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// ─── Tipos de leitura ───────────────────────────────────────

export type CellValue = string | number | boolean | null

export interface SafeWorkSheet {
  name: string
  /** Linhas posicionais (índice 0 = coluna A), equivalente a sheet_to_json com header:1. */
  rows: CellValue[][]
}

export interface SafeWorkBook {
  SheetNames: string[]
  Sheets: Record<string, SafeWorkSheet>
}

// ─── Normalização de células ────────────────────────────────

function dateToISO(d: Date): string {
  const t = d.getTime()
  if (Number.isNaN(t)) return ''
  return d.toISOString().slice(0, 10)
}

function cellToValue(v: ExcelCellValue): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return dateToISO(v)
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v as CellValue

  const obj = v as unknown as Record<string, unknown>
  if (Array.isArray(obj.richText)) {
    return (obj.richText as { text?: unknown }[]).map(r => String(r.text ?? '')).join('')
  }
  if ('hyperlink' in obj && 'text' in obj) {
    return cellToValue(obj.text as ExcelCellValue)
  }
  if ('formula' in obj || 'sharedFormula' in obj) {
    if ('result' in obj && obj.result !== undefined) return cellToValue(obj.result as ExcelCellValue)
    return null
  }
  if ('error' in obj) return null
  return String(v)
}

// ─── Leitura ────────────────────────────────────────────────

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

function sniffFormat(bytes: Uint8Array): 'xlsx' | 'xls' | 'csv' {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx' // ZIP "PK"
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls' // CFB
  return 'csv'
}

function worksheetToRows(ws: Worksheet): CellValue[][] {
  const rows: CellValue[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values
    const arr: CellValue[] = []
    if (Array.isArray(vals)) {
      // exceljs usa índice 1-based (vals[1] = coluna A)
      for (let c = 1; c < vals.length; c++) arr.push(cellToValue(vals[c] as ExcelCellValue))
    }
    rows.push(arr)
  }
  return rows
}

async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<SafeWorkBook> {
  const wb = new Workbook()
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0])
  const SheetNames: string[] = []
  const Sheets: Record<string, SafeWorkSheet> = Object.create(null)
  wb.eachSheet(ws => {
    if (DANGEROUS_KEYS.has(ws.name)) return
    SheetNames.push(ws.name)
    Sheets[ws.name] = { name: ws.name, rows: worksheetToRows(ws) }
  })
  return { SheetNames, Sheets }
}

/** Fallback para .xls legado (BIFF) — exceljs não lê; usa xlsx sob demanda e sanitiza. */
async function readLegacyXls(data: ArrayBuffer | Uint8Array): Promise<SafeWorkBook> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const SheetNames: string[] = []
  const Sheets: Record<string, SafeWorkSheet> = Object.create(null)
  for (const name of wb.SheetNames) {
    if (DANGEROUS_KEYS.has(name)) continue
    const ws = wb.Sheets[name]
    const aoa = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]) : []
    SheetNames.push(name)
    Sheets[name] = {
      name,
      rows: aoa.map(row => row.map(c => {
        if (c === null || c === undefined) return null
        if (c instanceof Date) return dateToISO(c)
        const t = typeof c
        if (t === 'string' || t === 'number' || t === 'boolean') return c as CellValue
        return String(c)
      })),
    }
  }
  return { SheetNames, Sheets }
}

function readCsv(data: ArrayBuffer | Uint8Array): SafeWorkBook {
  const text = new TextDecoder('utf-8').decode(toUint8(data))
  const lines = text.split(/\r?\n/)
  const first = lines.find(l => l.trim() !== '') ?? ''
  const semi = (first.match(/;/g) ?? []).length
  const comma = (first.match(/,/g) ?? []).length
  const tab = (first.match(/\t/g) ?? []).length
  const sep = tab > semi && tab > comma ? '\t' : semi >= comma ? ';' : ','
  const rows: CellValue[][] = lines.map(line => line.split(sep).map(c => c.trim()))
  const sheet: SafeWorkSheet = { name: 'Sheet1', rows }
  return { SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } }
}

/**
 * Lê um arquivo de planilha (.xlsx via exceljs; .xls legado via fallback
 * sanitizado; CSV via parser próprio) e devolve o workbook normalizado.
 */
export async function safeRead(data: ArrayBuffer | Uint8Array): Promise<SafeWorkBook> {
  const bytes = toUint8(data)
  const format = sniffFormat(bytes)
  if (format === 'xlsx') return readXlsx(data)
  if (format === 'xls') return readLegacyXls(data)
  return readCsv(data)
}

// ─── sheet_to_json compatível ───────────────────────────────

export interface SheetToJsonOpts {
  /** header: 1 → devolve array de arrays (posicional). */
  header?: 1
  /** Valor usado para células vazias. */
  defval?: unknown
  /** Mantido por compatibilidade — valores já vêm normalizados. */
  raw?: boolean
}

function isEmptyCell(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/**
 * Equivalente seguro de XLSX.utils.sheet_to_json().
 * - header:1 → linhas posicionais (preserva linhas em branco, como o xlsx).
 * - default  → objetos com chaves vindas da primeira linha (sanitizadas).
 */
export function safeSheetToJson<T = Record<string, unknown>>(
  sheet: SafeWorkSheet,
  opts?: SheetToJsonOpts,
): T[] {
  const rows = sheet.rows
  if (opts?.header === 1) {
    const hasDefval = opts !== undefined && 'defval' in opts
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
    return rows.map(r => {
      const out: unknown[] = []
      const len = hasDefval ? width : r.length
      for (let c = 0; c < len; c++) {
        const v = r[c]
        out.push(isEmptyCell(v) && hasDefval ? opts!.defval : (v ?? null))
      }
      return out
    }) as T[]
  }

  // Modo objeto: primeira linha não-vazia = headers
  let headerIdx = 0
  while (headerIdx < rows.length && rows[headerIdx]!.every(isEmptyCell)) headerIdx++
  const headerRow = rows[headerIdx] ?? []

  const keys: string[] = []
  const used = new Set<string>()
  headerRow.forEach((h, i) => {
    let key = isEmptyCell(h) ? (i === 0 ? '__EMPTY' : `__EMPTY_${i}`) : String(h)
    if (DANGEROUS_KEYS.has(key)) key = `_${key}`
    let unique = key
    let n = 1
    while (used.has(unique)) unique = `${key}_${n++}`
    used.add(unique)
    keys.push(unique)
  })

  const hasDefval = opts !== undefined && 'defval' in opts
  const out: T[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!
    const obj: Record<string, unknown> = {}
    let hasValue = false
    keys.forEach((key, c) => {
      const v = r[c]
      if (isEmptyCell(v)) {
        if (hasDefval) obj[key] = opts!.defval
        return
      }
      obj[key] = v
      hasValue = true
    })
    if (hasValue) out.push(obj as T)
  }
  return out
}

// ─── Escrita ────────────────────────────────────────────────

export type OutCellValue = string | number | boolean | Date | null | undefined

export interface SheetWriteOptions {
  /** Largura das colunas em caracteres (equivalente ao antigo wch). */
  widths?: number[]
  /** Congela a primeira linha (header). */
  freezeHeader?: boolean
}

export function newWorkbook(): Workbook {
  return new Workbook()
}

function applySheetOptions(ws: Worksheet, opts?: SheetWriteOptions) {
  if (opts?.widths) {
    opts.widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  }
  if (opts?.freezeHeader) {
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  }
}

function normalizeOutCell(v: unknown): OutCellValue {
  if (v === null || v === undefined) return null
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v as OutCellValue
  if (v instanceof Date) return v
  return String(v)
}

/** Equivalente de aoa_to_sheet + book_append_sheet. */
export function addAoaSheet(
  wb: Workbook,
  name: string,
  aoa: ReadonlyArray<ReadonlyArray<OutCellValue>>,
  opts?: SheetWriteOptions,
): Worksheet {
  const ws = wb.addWorksheet(name)
  for (const row of aoa) ws.addRow(row.map(normalizeOutCell))
  applySheetOptions(ws, opts)
  return ws
}

/** Equivalente de json_to_sheet + book_append_sheet (headers = união das chaves, na ordem de aparição). */
export function addJsonSheet(
  wb: Workbook,
  name: string,
  rows: Record<string, unknown>[],
  opts?: SheetWriteOptions,
): Worksheet {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) { seen.add(k); headers.push(k) }
    }
  }
  const ws = wb.addWorksheet(name)
  if (headers.length > 0) {
    ws.addRow(headers)
    for (const r of rows) ws.addRow(headers.map(h => normalizeOutCell(r[h])))
  }
  applySheetOptions(ws, opts)
  return ws
}

export async function workbookToBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf as unknown as ArrayBuffer], { type: XLSX_MIME })
}

/** Equivalente de XLSX.writeFile — gera o arquivo e dispara o download via <a>. */
export async function downloadWorkbook(wb: Workbook, filename: string): Promise<void> {
  const blob = await workbookToBlob(wb)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}
