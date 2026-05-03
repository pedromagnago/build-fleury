import * as XLSX from 'xlsx'

/**
 * Export an array of objects to an Excel file (.xlsx).
 * Columns are auto-detected from object keys.
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Dados',
) {
  if (data.length === 0) return

  const ws = XLSX.utils.json_to_sheet(data)

  // Auto-size columns
  const colWidths = Object.keys(data[0]!).map(key => {
    const maxLen = Math.max(
      key.length,
      ...data.map(row => String(row[key] ?? '').length),
    )
    return { wch: Math.min(maxLen + 2, 50) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Download a template-shaped XLSX with the current project data already filled.
 * Headers are EXACTLY the ones the importer accepts; rows preserve column order.
 *
 * If `rows` is empty, exports a single example row (or an empty placeholder)
 * so the user still gets a usable file.
 */
export function downloadFilledTemplate(opts: {
  filename: string
  sheetName?: string
  headers: readonly string[] | string[]
  rows: Record<string, unknown>[]
  /** Optional fallback row when there's no data in the project. */
  emptyExample?: (string | number)[]
}) {
  const { filename, sheetName = 'Template', headers, rows, emptyExample } = opts
  const headersArr = [...headers]

  // Build aoa: header line + data lines (preserve header order strictly)
  const aoa: (string | number | null)[][] = [headersArr]
  if (rows.length === 0 && emptyExample && emptyExample.length === headersArr.length) {
    aoa.push([...emptyExample])
  } else {
    for (const r of rows) {
      aoa.push(headersArr.map(h => {
        const v = r[h]
        if (v === null || v === undefined) return ''
        if (typeof v === 'number' || typeof v === 'string') return v
        return String(v)
      }))
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = headersArr.map(h => ({ wch: Math.max(h.length + 2, 14) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  triggerDownload(blob, safeName)
}

/** Trigger browser download with showSaveFilePicker fallback to <a> click. */
function triggerDownload(blob: Blob, filename: string) {
  if ('showSaveFilePicker' in window) {
    (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      })
      .then(async (handle) => {
        const w = await handle.createWritable()
        await w.write(blob)
        await w.close()
      })
      .catch((err: Error) => { if (err.name !== 'AbortError') throw err })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!
}

/** Same date suffix the WBS export uses. Useful for filenames. */
export function dateSuffix(): string {
  return todayISO()
}
