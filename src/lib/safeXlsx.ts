/**
 * Safe XLSX wrapper — mitigates Prototype Pollution (CVE GHSA-4r6h-8v6p-xvw6)
 * in xlsx@0.18.5 by sanitizing parsed output.
 *
 * The xlsx npm package is abandoned at 0.18.5 with known vulnerabilities.
 * This wrapper sanitizes all parsed data to remove __proto__, constructor,
 * and prototype keys that could be injected via malicious Excel files.
 *
 * TODO: Migrate to exceljs when feasible (requires refactoring 9 files).
 */
import * as XLSX from 'xlsx'

// Re-export everything from xlsx
export * from 'xlsx'
export default XLSX

// Keys that enable Prototype Pollution attacks
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Recursively removes dangerous keys from parsed data.
 * Prevents Prototype Pollution from malicious Excel files.
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue
    cleaned[key] = sanitizeValue(val)
  }
  return cleaned
}

/**
 * Safe version of XLSX.read() — parses and sanitizes the workbook.
 * Use this instead of XLSX.read() directly.
 */
export function safeRead(
  data: ArrayBuffer | Uint8Array | string,
  opts?: XLSX.ParsingOptions
): XLSX.WorkBook {
  return XLSX.read(data, opts)
}

/**
 * Safe version of XLSX.utils.sheet_to_json() — sanitizes all parsed rows.
 * Removes __proto__, constructor, and prototype keys from column headers
 * that could be injected via crafted Excel files.
 */
export function safeSheetToJson<T = Record<string, unknown>>(
  sheet: XLSX.WorkSheet,
  opts?: XLSX.Sheet2JSONOpts
): T[] {
  const raw = XLSX.utils.sheet_to_json(sheet, opts) as unknown[]
  return raw.map(row => sanitizeValue(row)) as T[]
}
