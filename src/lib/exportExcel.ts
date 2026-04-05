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
