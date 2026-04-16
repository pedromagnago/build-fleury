import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useItensCompra } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { supabase } from '@/lib/supabase'
import { useAuditLogs } from '@/hooks/useOperacional'
import { parsearCondicao, gerarParcelas, localDate } from '@/lib/parcelas'
import { formatCurrency } from '@/lib/utils'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download,
  ArrowRight, ShoppingCart, Calendar, BarChart3, Plus, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'
import { useQueryClient } from '@tanstack/react-query'
import { parseWBSImport, buildImportPreview } from '@/lib/wbsImport'
import ImportPreviewModal from '@/components/cronograma/ImportPreviewModal'

// ═══════════════════════════════════════════════════════════════
// Shared types & helpers
// ═══════════════════════════════════════════════════════════════
interface ParsedRow { [key: string]: string }
interface ImportPreview { headers: string[]; rows: ParsedRow[]; fileName: string }

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function parseSheetToRows(worksheet: XLSX.WorkSheet): { headers: string[]; rows: ParsedRow[] } {
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })
  if (jsonData.length === 0) return { headers: [], rows: [] }
  const rawHeaders = Object.keys(jsonData[0]!)
  const headers = rawHeaders.map(normalizeHeader)
  const rows: ParsedRow[] = jsonData.map((item) => {
    const row: ParsedRow = {}
    rawHeaders.forEach((rawH, idx) => {
      row[headers[idx]!] = item[rawH] != null ? String(item[rawH]).trim() : ''
    })
    return row
  })
  return { headers, rows }
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split('\n')
  const headerLine = lines[0]
  if (!headerLine) return { headers: [], rows: [] }
  const semiCount = (headerLine.match(/;/g) ?? []).length
  const commaCount = (headerLine.match(/,/g) ?? []).length
  const tabCount = (headerLine.match(/\t/g) ?? []).length
  const sep = tabCount > semiCount && tabCount > commaCount ? '\t' : semiCount >= commaCount ? ';' : ','
  const headers = headerLine.split(sep).map(normalizeHeader)
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(sep)
    const row: ParsedRow = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
  return { headers, rows }
}

function processFile(file: File, onDone: (p: ImportPreview) => void) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv' || ext === 'txt') {
    const reader = new FileReader()
    reader.onload = (e) => {
      const { headers, rows } = parseCSV(e.target?.result as string)
      onDone({ headers, rows, fileName: file.name })
    }
    reader.readAsText(file, 'UTF-8')
  } else {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.SheetNames[0]
        if (!sheet) { toast.error('Planilha vazia'); return }
        const { headers, rows } = parseSheetToRows(wb.Sheets[sheet]!)
        onDone({ headers, rows, fileName: file.name })
      } catch { toast.error('Erro ao ler arquivo Excel') }
    }
    reader.readAsArrayBuffer(file)
  }
}

function downloadTemplate(name: string, headers: string[], exampleRow: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const filename = `template_${name}.xlsx`

  if ('showSaveFilePicker' in window) {
    (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      })
      .then(async (handle) => {
        const w = await handle.createWritable(); await w.write(blob); await w.close()
        toast.success('Template salvo!')
      })
      .catch((err: Error) => { if (err.name !== 'AbortError') throw err })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}

function formatError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, any>
    
    // Traduções amigáveis para erros comuns de banco de dados (Postgres)
    if (e.code === '23505') {
      const match = typeof e.details === 'string' ? e.details.match(/Key \((.+)\)=\((.+)\) already exists/) : null
      if (match) return `Item duplicado. O valor "${match[2]}" já está cadastrado.`
      return 'Registro duplicado. Já existe um item com esta chave/código no sistema.'
    }
    if (e.code === '23503') return 'Referência inválida: você está informando um campo (ex: Etapa, Fornecedor ou Centro de Custo) que não existe no banco de dados.'
    if (e.code === '22P02') return 'Formato inválido: ocorreu um erro de tipo de dados (ex: letra em campo de número, ou número fora do limite suportado).'
    if (e.code === '23502') return 'Campo vazio: a importação tentou gravar um campo que é preenchimento obrigatório e ele está nulo ou vazio.'
    if (e.code === '23514') return 'Violação de restrição: o valor não obedece a regra de preenchimento (ex.: valor negativo).'
    if (e.code === '22001') return 'Texto muito longo para a capacidade do sistema.'
    
    const rootMsg = err instanceof Error ? err.message : ''
    const msg = e.message || e.error_description || rootMsg || 'Erro desconhecido'
    const details = e.details || e.hint ? ` - Detalhes: ${e.details || ''} ${e.hint || ''}`.trim() : ''
    return String(msg) + details
  }
  return String(err)
}

// ═══════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════
type Tab = 'wbs' | 'dados' | 'pedidos' | 'medicoes' | 'distribuicao' | 'logs' | 'pagamentos'

export default function ImportacaoPage() {
  const { restartTour } = useTour('importacao', pageTours.importacao)

  const [tab, setTab] = useState<Tab>('wbs')

  const tabs: { key: Tab; label: string; icon: typeof Upload }[] = [
    { key: 'wbs', label: 'WBS Completa (Excel)', icon: FileSpreadsheet },
    { key: 'dados', label: 'Dados Base', icon: FileSpreadsheet },
    { key: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
    { key: 'medicoes', label: 'Medições', icon: Calendar },
    { key: 'distribuicao', label: 'Distribuição Cronograma', icon: BarChart3 },
    { key: 'pagamentos', label: 'Pagamentos Realizados', icon: CheckCircle2 as typeof Upload },
    { key: 'logs', label: 'Logs de Importação', icon: AlertCircle as typeof Upload },
  ]

  return (
    <div>
      <PageHeader title="Importação" description="Importe dados via CSV ou Excel" icon={Upload} onHelp={restartTour} />

      {/* Tabs */}
      <div id="tour-import-tabs" className="mb-5 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'wbs' && <WBSTab />}
      {tab === 'dados' && <DadosBaseTab />}
      {tab === 'pedidos' && <PedidosTab />}
      {tab === 'medicoes' && <MedicoesTab />}
      {tab === 'distribuicao' && <DistribuicaoTab />}
      {tab === 'pagamentos' && <PagamentosRealizadosTab />}
      {tab === 'logs' && <LogsImportacaoTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab: Dados Base (existing functionality)
// ═══════════════════════════════════════════════════════════════
type TargetTable = 'etapas' | 'itens_compra' | 'fornecedores'

const TABLE_MAPPINGS: Record<TargetTable, { label: string; required: string[]; optional: string[] }> = {
  etapas: {
    label: 'Etapas do Cronograma',
    required: ['codigo', 'nome'],
    optional: ['ordem', 'data_inicio_plan', 'data_fim_plan', 'casas_total', 'valor_total_orcado', 'status', 'observacoes'],
  },
  itens_compra: {
    label: 'Itens de Compra',
    required: ['codigo', 'descricao', 'tipo', 'etapa_codigo'],
    optional: ['categoria', 'unidade', 'qtd_por_casa', 'qtd_total', 'custo_unitario_orcado', 'valor_total_orcado', 'fornecedor_nome', 'cond_pagamento'],
  },
  fornecedores: {
    label: 'Fornecedores',
    required: ['nome'],
    optional: ['cnpj', 'contato', 'cond_pagamento_padrao', 'observacoes'],
  },
}

function DadosBaseTab() {
  const { currentCompany } = useProject()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [targetTable, setTargetTable] = useState<TargetTable>('etapas')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file, (p) => { setPreview(p); setResult(null) })
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file, (p) => { setPreview(p); setResult(null) })
  }, [])

  const doImport = async () => {
    if (!preview || !currentCompany) return
    setImporting(true); setProgress(0)
    const errors: string[] = []; let success = 0
    const mapping = TABLE_MAPPINGS[targetTable]

    for (let i = 0; i < preview.rows.length; i++) {
      setProgress(Math.round(((i + 1) / preview.rows.length) * 100))
      const row = preview.rows[i]!
      const missing = mapping.required.filter((f) => !row[f])
      if (missing.length > 0) { errors.push(`Linha ${i + 2}: campos faltando: ${missing.join(', ')}`); continue }

      try {
        if (targetTable === 'etapas') {
          const { error } = await supabase.from('etapas').insert({
            company_id: currentCompany.id, codigo: row['codigo'], nome: row['nome'],
            ordem: row['ordem'] ? parseInt(row['ordem']) : i + 1,
            data_inicio_plan: row['data_inicio_plan'] || null, data_fim_plan: row['data_fim_plan'] || null,
            casas_total: row['casas_total'] ? parseInt(row['casas_total']) : 0,
            valor_total_orcado: row['valor_total_orcado'] ? parseFloat(row['valor_total_orcado'].replace(',', '.')) : 0,
            status: row['status'] || 'futuro', observacoes: row['observacoes'] || null,
          })
          if (error) throw error
        } else if (targetTable === 'fornecedores') {
          const { error } = await supabase.from('fornecedores').insert({
            company_id: currentCompany.id, nome: row['nome'],
            cnpj: row['cnpj'] || null, contato: row['contato'] || null,
            cond_pagamento_padrao: row['cond_pagamento_padrao'] || null, observacoes: row['observacoes'] || null,
          })
          if (error) throw error
        } else if (targetTable === 'itens_compra') {
          const { data: etapa } = await supabase.from('etapas').select('id').eq('company_id', currentCompany.id).eq('codigo', row['etapa_codigo']).single()
          if (!etapa) { errors.push(`Linha ${i + 2}: etapa "${row['etapa_codigo']}" não encontrada`); continue }
          let fornecedorId: string | null = null
          if (row['fornecedor_nome']) {
            const { data: forn } = await supabase.from('fornecedores').select('id').eq('company_id', currentCompany.id).ilike('nome', row['fornecedor_nome']).limit(1).single()
            fornecedorId = forn?.id ?? null
          }
          const { error } = await supabase.from('itens_compra').insert({
            company_id: currentCompany.id, etapa_id: etapa.id, codigo: row['codigo'], descricao: row['descricao'],
            tipo: row['tipo']?.toUpperCase() || 'MATERIAL', categoria: row['categoria'] || null,
            unidade: row['unidade'] || null,
            qtd_por_casa: row['qtd_por_casa'] ? parseFloat(row['qtd_por_casa'].replace(',', '.')) : null,
            qtd_total: row['qtd_total'] ? parseFloat(row['qtd_total'].replace(',', '.')) : null,
            custo_unitario_orcado: row['custo_unitario_orcado'] ? parseFloat(row['custo_unitario_orcado'].replace(',', '.')) : 0,
            valor_total_orcado: row['valor_total_orcado'] ? parseFloat(row['valor_total_orcado'].replace(',', '.')) : 0,
            fornecedor_id: fornecedorId, cond_pagamento: row['cond_pagamento'] || null,
          })
          if (error) throw error
        }
        success++
      } catch (err) { errors.push(`Linha ${i + 2}: ${formatError(err)}`) }
    }
    
    if (errors.length > 0) {
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: targetTable,
        acao: 'INSERT',
        agente: 'sistema',
        dados_depois: { type: 'import_lote', success, total: preview.rows.length, errors }
      })
    }

    setResult({ success, errors }); setImporting(false)
    if (success > 0) toast.success(`${success} registro(s) importado(s)!`)
    if (errors.length > 0) toast.error(`${errors.length} erro(s)`)
  }

  const doDownload = () => {
    const mapping = TABLE_MAPPINGS[targetTable]
    const allHeaders = [...mapping.required, ...mapping.optional]
    const example = allHeaders.map((h) => {
      if (h === 'codigo') return 'EX-01'; if (h.includes('nome') || h === 'descricao') return 'Exemplo'
      if (h === 'tipo') return 'MATERIAL'; if (h === 'etapa_codigo') return 'EX-01'
      if (h === 'status') return 'futuro'; if (h === 'ordem') return '1'
      if (h.includes('valor') || h.includes('custo') || h.includes('qtd')) return '0'
      if (h.includes('data')) return '2026-01-01'; if (h === 'casas_total') return '0'; return ''
    })
    downloadTemplate(targetTable, allHeaders, example)
  }

  return (
    <>
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {(Object.entries(TABLE_MAPPINGS) as [TargetTable, (typeof TABLE_MAPPINGS)[TargetTable]][]).map(([key, val]) => (
          <button key={key} onClick={() => { setTargetTable(key); setPreview(null); setResult(null) }}
            className={`rounded-xl border p-4 text-left transition-all ${targetTable === key ? 'border-primary bg-primary/5 shadow-sm' : 'hover:border-primary/50'}`}>
            <p className="font-medium">{val.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">Obrigatórios: {val.required.join(', ')}</p>
          </button>
        ))}
      </div>

      <div className="mb-5">
        <button onClick={doDownload} className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4 text-primary" />Baixar template — {TABLE_MAPPINGS[targetTable].label}
        </button>
      </div>

      <DropZone onFile={(f) => processFile(f, (p) => { setPreview(p); setResult(null) })} handleFile={handleFile} handleDrop={handleDrop} />

      {preview && (
        <PreviewTable preview={preview} onClose={() => setPreview(null)} importing={importing} progress={progress}
          importLabel={`Importar ${preview.rows.length} registros para ${TABLE_MAPPINGS[targetTable].label}`}
          onImport={doImport}
          columnChecker={(h) => {
            const m = TABLE_MAPPINGS[targetTable]
            return m.required.includes(h) ? 'required' : m.optional.includes(h) ? 'optional' : 'unknown'
          }}
        />
      )}
      {result && <ResultCard result={result} />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab: Pedidos — aceita formato real da planilha de compras
// ═══════════════════════════════════════════════════════════════
const PEDIDOS_HEADERS = ['item_codigo', 'numero_pedido', 'casas_lote', 'fornecedor_nome', 'cond_pagamento', 'data_entrega_prevista', 'valor_unitario_real']

function findPedCol(row: ParsedRow, candidates: string[]): string {
  for (const c of candidates) {
    const norm = normalizeHeader(c)
    if (row[norm] !== undefined && row[norm] !== '') return String(row[norm])
  }
  for (const key of Object.keys(row)) {
    const kn = key.toLowerCase().replace(/[_\s.]+/g, '')
    for (const c of candidates) {
      const cn = c.toLowerCase().replace(/[_\s.]+/g, '')
      if (kn.includes(cn) || cn.includes(kn)) return String(row[key])
    }
  }
  return ''
}

function excelSerialToISO(val: string | number): string {
  const num = Number(val)
  if (!num || num < 1000) return String(val)
  const d = new Date(Date.UTC(1899, 11, 30 + num))
  return d.toISOString().split('T')[0]!
}

function parsePedDate(val: string): string {
  if (!val) return ''
  const num = Number(val)
  if (num > 40000 && num < 60000) return excelSerialToISO(num)
  const ddmm = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2]!.padStart(2, '0')}-${ddmm[1]!.padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10)
  return val
}

function normalizePedidoRows(raw: ParsedRow[], headers: string[]): ParsedRow[] {
  const isRealFormat = headers.some(h => ['etapa', 'item', 'fornecedor'].includes(h.replace(/[_\s]/g, '').toLowerCase()))
  if (!isRealFormat) return raw
  return raw.map(row => {
    const etapaNome = findPedCol(row, ['ETAPA', 'etapa'])
    const itemDesc = findPedCol(row, ['ITEM', 'item', 'descricao'])
    const fornecedor = findPedCol(row, ['FORNECEDOR', 'fornecedor_nome'])
    const condPag = findPedCol(row, ['COND PAGTO', 'COND. PAGTO', 'cond_pagamento', 'Cond Pagamento'])
    const casas = findPedCol(row, ['QUANTIDADE DE CASAS', 'casas_lote', 'casas'])
    const valorUnit = findPedCol(row, ['valor_unit._1', ' VALOR UNIT. ', 'valor_unitario_real', 'VALOR UNIT.'])
    const valorTotal = findPedCol(row, ['valor_total_1', 'VALOR TOTAL_1', 'VALOR TOTAL'])
    const qtdEntrega = findPedCol(row, ['quant._2', 'QUANT._2'])
    const dataEntrega = findPedCol(row, ['DATA DA ENTREGA', 'data_da_entrega', 'data_entrega_prevista', 'DATA ENTREGA'])
    return {
      'item_codigo': '',
      '_item_descricao': itemDesc,
      '_etapa_nome': etapaNome,
      'numero_pedido': '',
      'casas_lote': casas,
      'fornecedor_nome': fornecedor,
      'cond_pagamento': condPag,
      'data_entrega_prevista': parsePedDate(dataEntrega),
      'valor_unitario_real': valorUnit ? String(parseFloat(String(valorUnit).replace(',', '.')) || 0) : '',
      'valor_total_override': valorTotal ? String(parseFloat(String(valorTotal).replace(',', '.')) || 0) : '',
      '_qtd_entrega': qtdEntrega,
    }
  })
}

function PedidosTab() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const { data: projectEtapas = [] } = useEtapas()
  const qc = useQueryClient()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; parcelas: number; errors: string[] } | null>(null)

  const handleFile = useCallback((p: ImportPreview) => {
    const normalized = normalizePedidoRows(p.rows, p.headers)
    setPreview({ ...p, rows: normalized })
    setResult(null)
  }, [])

  type EnrichedPedido = Record<string, any> & { itemExists: boolean; valorTotal: number; parcelasPrevistas: number; itemNome: string; unitarioAplicado: number; _matchedItem?: any }
  const enrichedRows = useMemo((): EnrichedPedido[] => {
    if (!preview) return []
    return preview.rows.map((row): EnrichedPedido => {
      let itemCodigo = row['item_codigo'] ?? ''
      let item = itens.find((i) => i.codigo === itemCodigo)
      if (!item && row['_item_descricao']) {
        const descNorm = row['_item_descricao'].toLowerCase().trim()
        const etapaNorm = (row['_etapa_nome'] || '').toLowerCase().trim()
        const candidates = itens.filter(i => i.descricao.toLowerCase().trim() === descNorm)
        if (candidates.length === 1) { item = candidates[0] }
        else if (candidates.length > 1 && etapaNorm) {
          const etapaMatch = projectEtapas.find(e => e.nome.toLowerCase().trim() === etapaNorm)
          if (etapaMatch) item = candidates.find(c => c.etapa_id === etapaMatch.id) ?? candidates[0]
          else item = candidates[0]
        }
        if (!item) {
          const fuzzy = itens.filter(i => { const id = i.descricao.toLowerCase().trim(); return id.includes(descNorm) || descNorm.includes(id) })
          if (fuzzy.length === 1) item = fuzzy[0]
          else if (fuzzy.length > 1 && etapaNorm) {
            const etapaMatch = projectEtapas.find(e => e.nome.toLowerCase().includes(etapaNorm) || etapaNorm.includes(e.nome.toLowerCase()))
            if (etapaMatch) item = fuzzy.find(c => c.etapa_id === etapaMatch.id) ?? fuzzy[0]
            else item = fuzzy[0]
          }
        }
        if (item) itemCodigo = item.codigo
      }
      const casas = parseInt(row['casas_lote'] ?? '0') || 0
      const sheetUnitario = row['valor_unitario_real'] ? parseFloat(String(row['valor_unitario_real']).replace(',', '.')) : 0
      const unitario = sheetUnitario > 0 ? sheetUnitario : (item?.custo_unitario_orcado ?? 0)
      const overrideTotal = row['valor_total_override'] ? parseFloat(String(row['valor_total_override']).replace(',', '.')) : 0
      let valorTotal: number
      if (overrideTotal > 0) { valorTotal = overrideTotal } else { const qtdPorCasa = item?.qtd_por_casa ?? 1; valorTotal = casas * qtdPorCasa * unitario }
      const cond = row['cond_pagamento'] ?? ''
      const dias = parsearCondicao(cond)
      return { ...row, item_codigo: itemCodigo, itemExists: !!item, valorTotal, parcelasPrevistas: dias.length, itemNome: item?.descricao ?? row['_item_descricao'] ?? '?', unitarioAplicado: unitario, _matchedItem: item }
    })
  }, [preview, itens, projectEtapas])

  const doImport = async () => {
    if (!preview || !currentCompany) return
    setImporting(true); setProgress(0)
    const errors: string[] = []
    let successPedidos = 0, totalParcelas = 0
    for (let i = 0; i < enrichedRows.length; i++) {
      setProgress(Math.round(((i + 1) / enrichedRows.length) * 100))
      const row = enrichedRows[i]!
      if (!row.itemExists) { errors.push(`Linha ${i + 2}: Item "${row['_item_descricao'] || row['item_codigo']}" não encontrado`); continue }
      const item = row._matchedItem || itens.find((it) => it.codigo === row['item_codigo'])
      if (!item) continue
      try {
        let fornecedorId: string | null = null
        let fornCond: string | null = null
        if (row['fornecedor_nome']) {
          const { data: forn } = await supabase.from('fornecedores').select('id, cond_pagamento_padrao').eq('company_id', currentCompany.id).ilike('nome', row['fornecedor_nome']).limit(1).single()
          if (forn) { fornecedorId = forn.id; fornCond = forn.cond_pagamento_padrao }
          else {
            const newFornData: any = { company_id: currentCompany.id, nome: row['fornecedor_nome'] }
            if (row['cond_pagamento']) newFornData.cond_pagamento_padrao = row['cond_pagamento']
            const { data: newForn } = await supabase.from('fornecedores').insert(newFornData).select('id').single()
            fornecedorId = newForn?.id ?? null
          }
        }
        let condPagamento = row['cond_pagamento'] || null
        if (!condPagamento) condPagamento = fornCond || 'à vista'
        let dataEntrega = row['data_entrega_prevista'] || null
        if (!dataEntrega) {
          const etapaObj = projectEtapas.find((e: any) => e.id === item.etapa_id)
          if (etapaObj?.data_inicio_plan) dataEntrega = etapaObj.data_inicio_plan
          else { const d30 = new Date(); d30.setDate(d30.getDate() + 30); dataEntrega = d30.toISOString().split('T')[0] }
        }
        const casas = parseFloat(row['casas_lote'] ?? '0') || 0
        const unitario = row.unitarioAplicado
        const qtdPorCasa = item.qtd_por_casa ?? 1
        const qtdLote = row['_qtd_entrega'] ? parseFloat(row['_qtd_entrega']) : casas * qtdPorCasa
        const valorTotal = row.valorTotal
        const { data: pedido, error: pedErr } = await supabase.from('pedidos').insert({
          company_id: currentCompany.id, item_compra_id: item.id,
          numero_pedido: row['numero_pedido'] ? parseInt(row['numero_pedido']) : null,
          casas_lote: casas, qtd_lote: qtdLote, valor_unitario_real: unitario, valor_total_real: valorTotal,
          fornecedor_id: fornecedorId, cond_pagamento: condPagamento,
          data_entrega_prevista: dataEntrega, status: 'planejado',
        }).select('id').single()
        if (pedErr) throw pedErr
        if (!pedido) throw new Error('Pedido não criado')
        if (valorTotal > 0 && condPagamento) {
          const parcelas = gerarParcelas({ pedidoId: pedido.id, companyId: currentCompany.id, valorTotal, condPagamento: condPagamento || 'à vista', dataEntrega: localDate(dataEntrega) })
          if (parcelas.length > 0) {
            const { error: parcErr } = await supabase.from('parcelas').insert(parcelas)
            if (parcErr) console.warn('Erro ao gerar parcelas:', parcErr.message)
            else totalParcelas += parcelas.length
          }
        }
        successPedidos++
      } catch (err) { errors.push(`Linha ${i + 2}: ${formatError(err)}`) }
    }
    await supabase.from('audit_logs').insert({ company_id: currentCompany.id, tabela: 'pedidos', acao: 'INSERT', agente: 'sistema', dados_depois: { type: 'import_lote', success: successPedidos, total: enrichedRows.length, errors } })
    setResult({ success: successPedidos, parcelas: totalParcelas, errors }); setImporting(false)
    if (successPedidos > 0) { toast.success(`Importados ${successPedidos} pedidos, ${totalParcelas} parcelas geradas`); qc.invalidateQueries({ queryKey: ['pedidos'] }); qc.invalidateQueries({ queryKey: ['parcelas'] }); qc.invalidateQueries({ queryKey: ['fornecedores'] }) }
    if (errors.length > 0) toast.error(`${errors.length} erro(s)`)
  }

  const stats = useMemo(() => {
    const valid = enrichedRows.filter(r => r.itemExists)
    const invalid = enrichedRows.filter(r => !r.itemExists)
    const total = valid.reduce((s, r) => s + r.valorTotal, 0)
    return { valid: valid.length, invalid: invalid.length, total }
  }, [enrichedRows])

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Importar Pedidos</h3>
        <p className="mb-3 text-[10px] text-muted-foreground">
          Aceita planilha real: <strong>ETAPA, ITEM, FORNECEDOR, COND PAGTO, QUANTIDADE DE CASAS, VALOR UNIT., VALOR TOTAL, DATA DA ENTREGA</strong>
          <br/>Ou template: {PEDIDOS_HEADERS.join(' | ')}
          <br/><span className="text-blue-500">📌 Itens vinculados por nome + etapa. Fornecedores criados automaticamente.</span>
        </p>
        <button onClick={() => downloadTemplate('pedidos', PEDIDOS_HEADERS, ['EX-01', '1', '16', 'Fornecedor ABC', '30/60', '2026-05-01', ''])}
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent">
          <Download className="h-3.5 w-3.5 text-primary" />Baixar template
        </button>
      </div>
      <DropZone onFile={(f) => processFile(f, handleFile)} />
      {preview && (
        <div className="mb-5 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h3 className="font-semibold">Preview: {preview.fileName}</h3>
              <p className="text-xs text-muted-foreground">
                {preview.rows.length} linhas •
                <span className="text-emerald-600 font-medium"> {stats.valid} vinculados</span>
                {stats.invalid > 0 && <span className="text-red-500 font-medium"> • {stats.invalid} sem item</span>}
                {' • '}<span className="font-medium">Total: {formatCurrency(stats.total)}</span>
              </p>
            </div>
            <button onClick={() => setPreview(null)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted"><tr>
                <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Etapa</th>
                <th className="px-3 py-2 text-right">Casas</th><th className="px-3 py-2 text-right">Unit.</th><th className="px-3 py-2 text-left">Fornecedor</th>
                <th className="px-3 py-2 text-left">Cond.</th><th className="px-3 py-2 text-left">Entrega</th><th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Parc.</th><th className="px-3 py-2 text-center">✓</th>
              </tr></thead>
              <tbody className="divide-y">
                {enrichedRows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={`hover:bg-muted/30 ${!row.itemExists ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={row.itemNome}>
                      {row.itemNome}
                      {row['item_codigo'] && <span className="block text-[9px] text-muted-foreground font-mono">{row['item_codigo']}</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={row['_etapa_nome']}>{row['_etapa_nome'] || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row['casas_lote']}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(row.unitarioAplicado)}
                      {row['valor_unitario_real'] && parseFloat(row['valor_unitario_real']) > 0 ? <span className="block text-[9px] text-blue-500">Planilha</span> : <span className="block text-[9px] text-muted-foreground">Do Item</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{row['fornecedor_nome'] ?? '—'}</td>
                    <td className="px-3 py-2">{row['cond_pagamento'] ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{row['data_entrega_prevista'] ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(row.valorTotal)}</td>
                    <td className="px-3 py-2 text-center"><span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">{row.parcelasPrevistas}</span></td>
                    <td className="px-3 py-2 text-center">
                      {row.itemExists ? <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="mx-auto h-3.5 w-3.5 text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {importing && <ProgressBar value={progress} />}
          <div className="border-t p-4 flex items-center gap-4">
            <button onClick={doImport} disabled={importing || stats.valid === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {importing ? <><Spinner />Importando...</> : <><ArrowRight className="h-4 w-4" />Importar {stats.valid} pedidos ({formatCurrency(stats.total)})</>}
            </button>
            {stats.invalid > 0 && <span className="text-xs text-amber-500">⚠ {stats.invalid} linhas sem item serão ignoradas</span>}
          </div>
        </div>
      )}
      {result && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">Resultado</h3>
          {result.success > 0 && (<div className="mb-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />Importados {result.success} pedidos, {result.parcelas} parcelas geradas</div>)}
          {result.errors.length > 0 && <ErrorLog errors={result.errors} />}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab: Medições (NEW)
// ═══════════════════════════════════════════════════════════════
interface MedicaoRow {
  numero: number; valor: string; data_prevista: string; etapa_ids: string[]
}

function MedicoesTab() {
  const { currentCompany } = useProject()
  const { data: etapas = [] } = useEtapas()
  const [rows, setRows] = useState<MedicaoRow[]>(() =>
    Array.from({ length: 8 }, (_, i) => ({ numero: i + 1, valor: '', data_prevista: '', etapa_ids: [] }))
  )
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  const updateRow = (idx: number, field: keyof MedicaoRow, value: string | string[]) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const addRow = () => {
    setRows((prev) => [...prev, { numero: prev.length + 1, valor: '', data_prevista: '', etapa_ids: [] }])
  }

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, numero: i + 1 })))
  }

  const toggleEtapa = (rowIdx: number, etapaId: string) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r
      const has = r.etapa_ids.includes(etapaId)
      return { ...r, etapa_ids: has ? r.etapa_ids.filter((id) => id !== etapaId) : [...r.etapa_ids, etapaId] }
    }))
  }

  const validRows = rows.filter((r) => r.valor && r.data_prevista)

  const doSave = async () => {
    if (!currentCompany || validRows.length === 0) return
    setSaving(true)
    const errors: string[] = []; let success = 0

    for (const row of validRows) {
      try {
        const valor = parseFloat(row.valor.replace(',', '.'))
        if (isNaN(valor) || valor <= 0) { errors.push(`Medição ${row.numero}: valor inválido`); continue }

        const { error } = await supabase.from('medicoes').insert({
          company_id: currentCompany.id,
          numero: row.numero,
          valor_planejado: valor,
          data_prevista: row.data_prevista,
          valor_liberado: 0,
          status: 'futura',
          percentual_fisico_meta: 0,
          percentual_fisico_real: 0,
        })
        if (error) throw error
        success++
      } catch (err) { errors.push(`Medição ${row.numero}: ${formatError(err)}`) }
    }

    if (errors.length > 0 || success > 0) {
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'medicoes',
        acao: 'INSERT',
        agente: 'sistema',
        dados_depois: { type: 'import_lote', success, total: validRows.length, errors }
      })
    }

    setResult({ success, errors }); setSaving(false)
    if (success > 0) toast.success(`${success} medição(ões) salva(s)`)
    if (errors.length > 0) toast.error(`${errors.length} erro(s)`)
  }

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Cadastro de Medições</h3>
        <p className="text-[10px] text-muted-foreground">Preencha as medições planejadas. Cada medição pode ter etapas vinculadas.</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted z-10">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center font-medium">#</th>
                <th className="w-40 px-3 py-2.5 text-left font-medium">Valor (R$)</th>
                <th className="w-40 px-3 py-2.5 text-left font-medium">Data Prevista</th>
                <th className="px-3 py-2.5 text-left font-medium">Etapas Vinculadas</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-center font-bold text-muted-foreground">{row.numero}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.valor}
                      onChange={(e) => updateRow(i, 'valor', e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={row.data_prevista}
                      onChange={(e) => updateRow(i, 'data_prevista', e.target.value)}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {etapas.map((et) => (
                        <button
                          key={et.id}
                          onClick={() => toggleEtapa(i, et.id)}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${
                            row.etapa_ids.includes(et.id)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {et.codigo}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t p-4">
          <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent">
            <Plus className="h-3 w-3" />Adicionar linha
          </button>
          <button onClick={doSave} disabled={saving || validRows.length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? <><Spinner />Salvando...</> : <><CheckCircle2 className="h-4 w-4" />Salvar {validRows.length} medição(ões)</>}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4 rounded-xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">Resultado</h3>
          {result.success > 0 && <div className="mb-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{result.success} medição(ões) salva(s)</div>}
          {result.errors.length > 0 && <ErrorLog errors={result.errors} />}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab: Distribuição Cronograma (NEW)
// ═══════════════════════════════════════════════════════════════
const DIST_HEADERS = ['etapa_codigo', 'medicao_numero', 'data', 'casas']

function DistribuicaoTab() {
  const { currentCompany } = useProject()
  const { data: etapas = [] } = useEtapas()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  type EnrichedDist = Record<string, any> & { etapaExists: boolean; etapaNome: string }
  const enriched = useMemo((): EnrichedDist[] => {
    if (!preview) return []
    return preview.rows.map((row): EnrichedDist => {
      const etapa = etapas.find((e) => e.codigo === (row['etapa_codigo'] ?? ''))
      return { ...row, etapaExists: !!etapa, etapaNome: etapa?.nome ?? '?' }
    })
  }, [preview, etapas])

  const doImport = async () => {
    if (!preview || !currentCompany) return
    setImporting(true); setProgress(0)
    const errors: string[] = []; let success = 0

    // Fetch max medicao_numero currently in DB to handle auto-increment correctly if omitted
    const { data: existing } = await supabase.from('cronograma_distribuicao')
      .select('etapa_id, medicao_numero')
      .eq('company_id', currentCompany.id)
    
    const nextMedicao: Record<string, number> = {}
    existing?.forEach(e => {
      if ((nextMedicao[e.etapa_id] || 0) < e.medicao_numero) {
        nextMedicao[e.etapa_id] = e.medicao_numero
      }
    })

    for (let i = 0; i < enriched.length; i++) {
      setProgress(Math.round(((i + 1) / enriched.length) * 100))
      const row = enriched[i]!
      if (!row.etapaExists) { errors.push(`Linha ${i + 2}: etapa "${row['etapa_codigo']}" não encontrada`); continue }
      const etapa = etapas.find((e) => e.codigo === row['etapa_codigo'])
      if (!etapa) continue

      try {
        const casas = parseInt(row['casas'] ?? '0') || 0
        const data = row['data'] ?? ''
        if (!data) { errors.push(`Linha ${i + 2}: data vazia`); continue }
        
        let medNum = row['medicao_numero'] ? parseInt(row['medicao_numero']) : 0
        if (!medNum || isNaN(medNum)) {
          nextMedicao[etapa.id] = (nextMedicao[etapa.id] || 0) + 1
          medNum = nextMedicao[etapa.id]!
        }

        const { error } = await supabase.from('cronograma_distribuicao').insert({
          company_id: currentCompany.id,
          etapa_id: etapa.id,
          medicao_numero: medNum,
          data_inicio: data,
          casas_planejadas: casas,
        })
        if (error) throw error
        success++
      } catch (err) { errors.push(`Linha ${i + 2}: ${formatError(err)}`) }
    }

    if (errors.length > 0 || success > 0) {
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'cronograma_distribuicao',
        acao: 'INSERT',
        agente: 'sistema',
        dados_depois: { type: 'import_lote', success, total: preview.rows.length, errors }
      })
    }

    setResult({ success, errors }); setImporting(false)
    if (success > 0) toast.success(`${success} distribuição(ões) importada(s)`)
    if (errors.length > 0) toast.error(`${errors.length} erro(s)`)
  }

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Distribuição do Cronograma</h3>
        <p className="mb-1 text-[10px] text-muted-foreground">
          Define quantas casas são executadas em cada data para cada etapa. Usado pelo Gantt para os blocos de casas.
        </p>
        <p className="mb-3 text-[10px] text-muted-foreground">Template: {DIST_HEADERS.join(' | ')} — Exemplo: 7, 1, 2026-03-16, 16</p>
        <button onClick={() => downloadTemplate('distribuicao', DIST_HEADERS, ['7', '1', '2026-03-16', '16'])}
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent">
          <Download className="h-3.5 w-3.5 text-primary" />Baixar template
        </button>
      </div>

      <DropZone onFile={(f) => processFile(f, (p) => { setPreview(p); setResult(null) })} />

      {preview && (
        <div className="mb-5 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h3 className="font-semibold">Preview: {preview.fileName}</h3>
              <p className="text-xs text-muted-foreground">{preview.rows.length} distribuições</p>
            </div>
            <button onClick={() => setPreview(null)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Etapa</th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-center">Medição</th>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-right">Casas</th>
                  <th className="px-3 py-2 text-center">✓</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enriched.slice(0, 30).map((row, i) => (
                  <tr key={i} className={`hover:bg-muted/30 ${!row.etapaExists ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row['etapa_codigo']}</td>
                    <td className="px-3 py-2">{row.etapaNome}</td>
                    <td className="px-3 py-2 text-center font-medium opacity-80">{row['medicao_numero'] || '1'}</td>
                    <td className="px-3 py-2">{row['data']}</td>
                    <td className="px-3 py-2 text-right font-bold">{row['casas']}</td>
                    <td className="px-3 py-2 text-center">
                      {row.etapaExists
                        ? <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-500" />
                        : <AlertCircle className="mx-auto h-3.5 w-3.5 text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {importing && <ProgressBar value={progress} />}
          <div className="border-t p-4">
            <button onClick={doImport} disabled={importing}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {importing ? <><Spinner />Importando...</> : <><ArrowRight className="h-4 w-4" />Importar {enriched.filter((r) => r.etapaExists).length} distribuições</>}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">Resultado</h3>
          {result.success > 0 && <div className="mb-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{result.success} distribuição(ões) importada(s)</div>}
          {result.errors.length > 0 && <ErrorLog errors={result.errors} />}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared UI Components
// ═══════════════════════════════════════════════════════════════
function DropZone({ onFile, handleFile, handleDrop }: { onFile: (f: File) => void; handleFile?: (e: React.ChangeEvent<HTMLInputElement>) => void; handleDrop?: (e: React.DragEvent) => void }) {
  const onDrop = handleDrop ?? ((e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) })
  const onChange = handleFile ?? ((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onFile(f) })

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      className="mb-5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center transition-colors hover:border-primary/50">
      <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-primary/50" />
      <p className="text-sm font-medium">Arraste um arquivo CSV ou Excel aqui</p>
      <p className="mt-1 text-xs text-muted-foreground">ou</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        <Upload className="h-4 w-4" />Selecionar arquivo
        <input type="file" accept=".csv,.txt,.xls,.xlsx" onChange={onChange} className="hidden" />
      </label>
      <p className="mt-3 text-[10px] text-muted-foreground">Formatos: .xlsx, .xls, .csv (separador ; ou , ou tab)</p>
    </div>
  )
}

function PreviewTable({ preview, onClose, importing, progress, importLabel, onImport, columnChecker, extraColumns }: {
  preview: ImportPreview; onClose: () => void; importing: boolean; progress: number
  importLabel: string; onImport: () => void
  columnChecker?: (h: string) => 'required' | 'optional' | 'unknown'
  extraColumns?: Array<{ header: string; render: (row: ParsedRow, i: number) => React.ReactNode }>
}) {
  return (
    <div className="mb-5 rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h3 className="font-semibold">Preview: {preview.fileName}</h3>
          <p className="text-xs text-muted-foreground">{preview.rows.length} linhas • {preview.headers.length} colunas</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>

      {columnChecker && (
        <div className="border-b bg-muted/30 px-4 py-2">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium">Colunas:</span>{' '}
            {preview.headers.map((h) => {
              const type = columnChecker(h)
              return (
                <span key={h} className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                  type === 'required' ? 'bg-emerald-500/10 text-emerald-600' :
                  type === 'optional' ? 'bg-blue-500/10 text-blue-500' :
                  'bg-amber-500/10 text-amber-600'
                }`}>{h}{type === 'required' ? ' ✓' : type === 'unknown' ? ' ?' : ''}</span>
              )
            })}
          </p>
        </div>
      )}

      <div className="max-h-80 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
              {preview.headers.map((h) => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
              {extraColumns?.map((c) => <th key={c.header} className="px-3 py-2 text-left font-medium text-muted-foreground">{c.header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {preview.rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                {preview.headers.map((h) => <td key={h} className="px-3 py-2">{row[h] ?? ''}</td>)}
                {extraColumns?.map((c) => <td key={c.header} className="px-3 py-2">{c.render(row, i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.rows.length > 20 && <p className="border-t p-3 text-center text-xs text-muted-foreground">Mostrando 20 de {preview.rows.length} linhas</p>}
      {importing && <ProgressBar value={progress} />}
      <div className="border-t p-4">
        <button onClick={onImport} disabled={importing}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {importing ? <><Spinner />{`Importando... ${progress}%`}</> : <><ArrowRight className="h-4 w-4" />{importLabel}</>}
        </button>
      </div>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="border-t px-4 py-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">{value}%</p>
    </div>
  )
}

function ResultCard({ result }: { result: { success: number; errors: string[] } }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-3 font-semibold">Resultado da Importação</h3>
      {result.success > 0 && <div className="mb-2 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{result.success} registro(s) importado(s)</div>}
      {result.errors.length > 0 && <ErrorLog errors={result.errors} />}
    </div>
  )
}

function ErrorLog({ errors }: { errors: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{errors.length} erro(s)</div>
      <div className="max-h-40 overflow-y-auto rounded-lg bg-destructive/5 p-3">
        {errors.map((err, i) => <p key={i} className="text-xs text-destructive">{err}</p>)}
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
}

// ═══════════════════════════════════════════════════════════════
// Tab: Logs de Importacao (NEW)
// ════════════════════════════════════════════════════════════
function LogsImportacaoTab() {
  const { currentCompany } = useProject()
  const { data: logs = [], isLoading, refetch } = useAuditLogs()
  const qc = useQueryClient()
  const importLogs = logs.filter(l => {
    const type = (l.dados_depois as any)?.type
    return type === 'import_lote' || type === 'import_wbs' || type === 'import_bd_realizado_v3_history'
  })
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null)
  const [isRollingBack, setIsRollingBack] = useState(false)

  const downloadErrorLog = (logId: string, errors: string[], warnings?: string[]) => {
    const lines = [
      "=== ERROS DE IMPORTACAO ===",
      ...(errors.map(e => `[ERRO] ${e}`)),
      "",
      ...(warnings && warnings.length > 0 ? ["=== AVISOS ===", ...warnings.map(w => `[AVISO] ${w}`)] : []),
    ]
    const content = lines.join("\n")
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erros_importacao_${logId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Rollback BD Realizado: delete only data created by the specific import batch
  const handleRollbackBdRealizado = async (logId: string) => {
    if (!currentCompany) return
    setIsRollingBack(true)
    try {
      // Fetch the specific log to get tracked IDs
      const { data: log } = await supabase.from('audit_logs').select('dados_depois').eq('id', logId).single()
      const dados = typeof log?.dados_depois === 'string' ? JSON.parse(log.dados_depois) : log?.dados_depois;
      const trackedIds = dados?.tracked_ids;

      let movCount = 0, pedCount = 0, mutCount = 0, flexCount = 0, despCount = 0;

      if (trackedIds) {
          // New Rollback Logic (Batch-specific)
          
          // 1. Delete Parcela & Conciliacaos (Cascade from Pedidos, Despesas and Movimentacoes, but just in case)
          if (trackedIds.conciliacao_ids?.length > 0) {
              await supabase.from('conciliacao_parcelas').delete().in('conciliacao_id', trackedIds.conciliacao_ids)
              await supabase.from('conciliacoes').delete().in('id', trackedIds.conciliacao_ids)
          }

          if (trackedIds.parcela_ids?.length > 0) {
              await supabase.from('parcelas').delete().in('id', trackedIds.parcela_ids)
          }

          // 2. Delete Movimentacoes
          if (trackedIds.mov_ids?.length > 0) {
              const { count } = await supabase.from('movimentacoes_bancarias').delete({ count: 'exact' }).in('id', trackedIds.mov_ids)
              movCount = count ?? 0;
          }

          // 3. Delete Pedidos
          if (trackedIds.pedido_ids?.length > 0) {
              const { count } = await supabase.from('pedidos').delete({ count: 'exact' }).in('id', trackedIds.pedido_ids)
              pedCount = count ?? 0;
          }

          // 4. Delete Mutuos
          if (trackedIds.mutuo_ids?.length > 0) {
              const { count } = await supabase.from('mutuos').delete({ count: 'exact' }).in('id', trackedIds.mutuo_ids)
              mutCount = count ?? 0;
          }

          // 5. Delete Despesas Indiretas
          if (trackedIds.despesa_ids?.length > 0) {
              const { count } = await supabase.from('despesas_indiretas').delete({ count: 'exact' }).in('id', trackedIds.despesa_ids)
              despCount = count ?? 0;
          }

          // 6. Delete Item Flex
          if (trackedIds.item_flex_ids?.length > 0) {
              const { count } = await supabase.from('itens_compra').delete({ count: 'exact' }).in('id', trackedIds.item_flex_ids)
              flexCount = count ?? 0;
          }

      } else {
          // Legacy Fallback (Global delete of BD Realizado) - Remove if we want to be strict, but keeps compatibility with recent imports
          const { count: mvC } = await supabase.from('movimentacoes_bancarias').delete({ count: 'exact' })
            .eq('company_id', currentCompany.id).eq('origem', 'bd_realizado')
          movCount = mvC ?? 0;

          const { count: pdC } = await supabase.from('pedidos').delete({ count: 'exact' })
            .eq('company_id', currentCompany.id).ilike('observacoes', '%BD Realizado%')
          pedCount = pdC ?? 0;

          const { count: mtC } = await supabase.from('mutuos').delete({ count: 'exact' })
            .eq('company_id', currentCompany.id).ilike('observacoes', '%BD Realizado%')
          mutCount = mtC ?? 0;

          const { data: despParaDeletar } = await supabase.from('despesas_indiretas').select('id')
            .eq('company_id', currentCompany.id).is('deleted_at', null)
          if (despParaDeletar && despParaDeletar.length > 0) {
            const despIds = despParaDeletar.map(d => d.id)
            await supabase.from('parcelas').delete().in('despesa_indireta_id', despIds)
            await supabase.from('despesas_indiretas').delete().in('id', despIds)
            despCount = despIds.length;
          }
          const { count: fxC } = await supabase.from('itens_compra').delete({ count: 'exact' })
            .eq('company_id', currentCompany.id).eq('codigo', 'FLEX')
          flexCount = fxC ?? 0;
      }

      // Delete the audit log itself
      await supabase.from('audit_logs').delete().eq('id', logId)

      // Invalidate all queries
      qc.invalidateQueries({ queryKey: [] })
      await refetch()

      toast.success(
        `Rollback concluido: ${movCount ?? 0} movs, ${pedCount ?? 0} pedidos, ${despCount} desp.ind., ${mutCount ?? 0} mutuos, ${flexCount ?? 0} itens flex`
      )
    } catch (err) {
      console.error('Erro no rollback:', err)
      toast.error('Erro ao reverter importacao: ' + (err as Error).message)
    } finally {
      setIsRollingBack(false)
      setRollbackTarget(null)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Carregando logs...</div>
  if (importLogs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <AlertCircle className="mb-4 h-10 w-10 text-muted-foreground/50" />
      <h3 className="text-lg font-medium text-muted-foreground">Nenhum log de importacao</h3>
      <p className="mt-1 text-sm text-muted-foreground/80">O sistema registrara lotes importados daqui para frente.</p>
    </div>
  )

  // Rollback confirmation dialog
  const RollbackDialog = () => {
    if (!rollbackTarget) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Reverter Importacao</h3>
              <p className="text-xs text-muted-foreground">Esta acao nao pode ser desfeita</p>
            </div>
          </div>
          <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-destructive mb-1">Serao removidos:</p>
            <ul className="space-y-0.5 ml-2">
              <li>- Todas as movimentacoes bancarias (origem: BD Realizado)</li>
              <li>- Pedidos fantasma gerados automaticamente</li>
              <li>- Despesas indiretas e suas parcelas</li>
              <li>- Mutuos criados via importacao</li>
              <li>- Itens Flex (codigo FLEX) na WBS</li>
              <li>- Conciliacoes vinculadas</li>
            </ul>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setRollbackTarget(null)}
              disabled={isRollingBack}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleRollbackBdRealizado(rollbackTarget)}
              disabled={isRollingBack}
              className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {isRollingBack ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Revertendo...</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Confirmar Exclusao</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <RollbackDialog />
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Historico de Importacoes Recentes</h3>
        <p className="text-[10px] text-muted-foreground">Registros de todas as importacoes (WBS, lotes de pedidos e pagamentos realizados) com detalhamento e opcao de rollback.</p>
      </div>

      <div className="flex flex-col gap-3">
        {importLogs.map((log) => {
          const dados = log.dados_depois as Record<string, any> | null
          const logType = dados?.type
          const isExpanded = expandedLog === log.id

          // ──── BD REALIZADO card ────
          if (logType === 'import_bd_realizado_v3_history') {
            const despesas = dados?.despesas_criadas ?? 0
            const flex = dados?.pedidos_flex ?? 0
            const creditos = dados?.creditos ?? 0
            const mutuos = dados?.mutuos ?? 0
            const errCount = dados?.errors ?? 0
            const totalItems = despesas + flex + creditos + mutuos
            const hasErrors = errCount > 0

            return (
              <div key={log.id} className="rounded-lg border bg-card shadow-sm transition-all hover:border-primary/30">
                <div 
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${hasErrors ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                      {hasErrors ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">
                        <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-400 mr-1.5">BD REALIZADO</span>
                        Pagamentos Realizados
                      </h4>
                      <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-medium">
                        <span className="text-emerald-600">{totalItems}</span> registros
                        {hasErrors && <> / <span className="text-amber-600">{errCount}</span> avisos</>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {despesas > 0 && `${despesas} desp. `}
                        {flex > 0 && `${flex} flex `}
                        {creditos > 0 && `${creditos} cred. `}
                        {mutuos > 0 && `${mutuos} mut.`}
                      </p>
                    </div>
                    <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/20 p-4 space-y-4">
                    {/* Summary grid */}
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="rounded-md border bg-card p-2.5 text-center">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Despesas Ind.</p>
                        <p className="mt-1 text-lg font-bold text-amber-600">{despesas}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5 text-center">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Itens Flex</p>
                        <p className="mt-1 text-lg font-bold text-blue-600">{flex}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5 text-center">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Creditos</p>
                        <p className="mt-1 text-lg font-bold text-emerald-600">{creditos}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5 text-center">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Mutuos</p>
                        <p className="mt-1 text-lg font-bold text-purple-600">{mutuos}</p>
                      </div>
                    </div>

                    {/* Error details */}
                    {dados?.error_details && dados.error_details.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errCount} erros na importação
                        </p>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {(dados.error_details as string[]).map((err: string, i: number) => (
                            <div key={i} className="text-[11px] text-amber-800 dark:text-amber-300 py-0.5 px-2 bg-amber-100/50 dark:bg-amber-900/20 rounded">
                              {err}
                            </div>
                          ))}
                          {errCount > 50 && (
                            <p className="text-[10px] text-muted-foreground italic pt-1">... e mais {errCount - 50} erros (mostrando os 50 primeiros)</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadErrorLog(log.id, dados.error_details as string[])
                          }}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 hover:text-amber-900 underline"
                        >
                          Baixar log de erros (.txt)
                        </button>
                      </div>
                    )}

                    {/* Rollback button */}
                    <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                      <div>
                        <p className="text-xs font-medium text-destructive">Reverter esta importacao</p>
                        <p className="text-[10px] text-muted-foreground">Remove todas as movimentacoes, pedidos e mutuos criados por esta importacao.</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRollbackTarget(log.id) }}
                        className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive/90"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Reverter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // ──── WBS import card ────
          if (logType === 'import_wbs') {
            const etapas = dados?.etapas ?? { atualizadas: 0, criadas: 0 }
            const itens = dados?.itens ?? { atualizados: 0, criados: 0 }
            const dists = dados?.distribuicoes ?? { atualizadas: 0, criadas: 0 }
            const errosCount = dados?.erros ?? 0
            const avisosCount = dados?.avisos ?? 0
            const totalLinhas = dados?.total_linhas ?? 0
            const errors: string[] = dados?.errors ?? []
            const warnings: string[] = dados?.warnings ?? []
            const totalProcessado = (etapas.atualizadas + etapas.criadas) + (itens.atualizados + itens.criados) + (dists.atualizadas + dists.criadas)
            const hasIssues = errosCount > 0 || avisosCount > 0

            return (
              <div key={log.id} className="rounded-lg border bg-card shadow-sm transition-all hover:border-primary/30">
                <div 
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${errosCount > 0 ? 'bg-destructive/10 text-destructive' : avisosCount > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-green-500/10 text-green-600'}`}>
                      {errosCount > 0 ? <AlertCircle className="h-5 w-5" /> : avisosCount > 0 ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary mr-1.5">WBS</span>
                        Importacao Completa
                      </h4>
                      <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-medium">
                        <span className="text-emerald-600">{totalProcessado}</span> processados
                        {errosCount > 0 && <> / <span className="text-destructive">{errosCount}</span> erros</>}
                        {avisosCount > 0 && <> / <span className="text-amber-600">{avisosCount}</span> avisos</>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Etapas: {etapas.atualizadas + etapas.criadas} | Itens: {itens.atualizados + itens.criados} | Dist: {dists.atualizadas + dists.criadas} | {totalLinhas} linhas lidas
                      </p>
                    </div>
                    <div className="ml-2">
                      <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t bg-muted/20 p-4 space-y-4">
                    {/* Summary grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Etapas</p>
                        <p className="mt-0.5">{etapas.criadas > 0 && <span className="text-emerald-600">{etapas.criadas} criadas</span>}{etapas.criadas > 0 && etapas.atualizadas > 0 && ' | '}{etapas.atualizadas > 0 && <span className="text-blue-600">{etapas.atualizadas} atualizadas</span>}{(etapas.criadas + etapas.atualizadas) === 0 && <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Itens de Compra</p>
                        <p className="mt-0.5">{itens.criados > 0 && <span className="text-emerald-600">{itens.criados} criados</span>}{itens.criados > 0 && itens.atualizados > 0 && ' | '}{itens.atualizados > 0 && <span className="text-blue-600">{itens.atualizados} atualizados</span>}{(itens.criados + itens.atualizados) === 0 && <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Distribuicoes</p>
                        <p className="mt-0.5">{dists.criadas > 0 && <span className="text-emerald-600">{dists.criadas} criadas</span>}{dists.criadas > 0 && dists.atualizadas > 0 && ' | '}{dists.atualizadas > 0 && <span className="text-blue-600">{dists.atualizadas} atualizadas</span>}{(dists.criadas + dists.atualizadas) === 0 && <span className="text-muted-foreground">-</span>}</p>
                      </div>
                    </div>

                    {/* Errors */}
                    {errors.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h5 className="text-xs font-semibold uppercase text-destructive">Erros ({errors.length})</h5>
                          <button 
                            onClick={(e) => { e.stopPropagation(); downloadErrorLog(log.id, errors, warnings); }}
                            className="flex items-center gap-1.5 rounded bg-muted-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted-foreground/20"
                          >
                            <Download className="h-3.5 w-3.5" /> Exportar Log Completo
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-3 text-xs">
                          <ul className="space-y-1">
                            {errors.map((erro, idx) => (
                              <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-destructive font-bold shrink-0">x</span> <span className="text-muted-foreground">{erro}</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {warnings.length > 0 && (
                      <div>
                        <h5 className="mb-2 text-xs font-semibold uppercase text-amber-600">Avisos ({warnings.length})</h5>
                        <div className="max-h-36 overflow-y-auto rounded-md border bg-background p-3 text-xs">
                          <ul className="space-y-1">
                            {warnings.map((aviso, idx) => (
                              <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-amber-600 font-bold shrink-0">!</span> <span className="text-muted-foreground">{aviso}</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {!hasIssues && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> Importacao concluida sem erros ou avisos.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          // ──── Legacy import_lote card ────
          const successCount = dados?.success ?? 0
          const totalCount = dados?.total ?? 0
          const errors: string[] = dados?.errors ?? []

          return (
            <div key={log.id} className="rounded-lg border bg-card shadow-sm transition-all hover:border-primary/30">
              <div 
                className="flex cursor-pointer items-center justify-between p-4"
                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${errors.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
                    {errors.length > 0 ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">
                      <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400 mr-1.5">LOTE</span>
                      Tabela: <span className="text-primary">{log.tabela.toUpperCase()}</span>
                    </h4>
                    <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-sm font-medium"><span className="text-emerald-600">{successCount}</span> importados / <span className="text-destructive">{errors.length}</span> com erro</p>
                    <p className="text-[10px] text-muted-foreground">Total de linhas lidas: {totalCount}</p>
                  </div>
                  <div className="ml-2">
                    <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>

              {isExpanded && errors.length > 0 && (
                <div className="border-t bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h5 className="text-xs font-semibold uppercase text-destructive">Detalhamento dos Erros</h5>
                    <button 
                      onClick={(e) => { e.stopPropagation(); downloadErrorLog(log.id, errors); }}
                      className="flex items-center gap-1.5 rounded bg-muted-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted-foreground/20"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar para Correcao
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-md border bg-background p-3 text-xs">
                    <ul className="space-y-1">
                      {errors.map((erro, idx) => (
                        <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-destructive font-bold">-</span> <span className="text-muted-foreground">{erro}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
// Tab: WBS Completa (Excel)
// ═══════════════════════════════════════════════════════════════

function downloadWBSTemplate() {
  const wb = XLSX.utils.book_new()

  // Aba 1: Etapas — mesmas colunas do exportador
  const etapaHeaders = [
    'Código', 'Nome', 'Status', 'Casas', 'Ordem',
    'Receita CEF', 'Preço Unitário (Serv)', 'Qtd/Casa (Serv)', 'Unidade (Serv)',
    'Data Início Plan', 'Data Fim Plan', 'Observações',
  ]
  const etapaEx1 = ['INFRA', 'Infraestrutura', 'futuro', 64, 1, 320000, 5000, 1, 'vb', '2026-01-15', '2026-06-30', '']
  const etapaEx2 = ['SUPER', 'Superestrutura', 'futuro', 64, 2, 480000, 7500, 1, 'vb', '2026-04-01', '2026-10-30', '']
  const wsEtapas = XLSX.utils.aoa_to_sheet([etapaHeaders, etapaEx1, etapaEx2])
  wsEtapas['!cols'] = [10, 30, 14, 8, 8, 16, 18, 14, 12, 16, 16, 30].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsEtapas, 'Etapas')

  // Aba 2: Itens de Compra — mesmas colunas do exportador
  const itemHeaders = [
    'Etapa Cód', 'Etapa Nome', 'Item Cód', 'Descrição', 'Tipo',
    'Qtd/Casa', 'Unidade', 'Custo Unitário',
    'Fornecedor', 'Cond. Pagamento',
  ]
  const itemEx1 = ['INFRA', 'Infraestrutura', 'INFRA-001', 'Concreto Usinado FCK 25', 'MATERIAL', 2.5, 'm³', 450, 'Concreteira ABC', '30/60/90']
  const itemEx2 = ['INFRA', 'Infraestrutura', 'INFRA-002', 'Aço CA-50', 'MATERIAL', 120, 'kg', 8.5, 'Aço Brasil', '30 DDL']
  const itemEx3 = ['SUPER', 'Superestrutura', 'SUPER-001', 'Alvenaria Bloco 14', 'MATERIAL', 35, 'm²', 42, '', '28 DDL']
  const wsItens = XLSX.utils.aoa_to_sheet([itemHeaders, itemEx1, itemEx2, itemEx3])
  wsItens['!cols'] = [10, 30, 14, 30, 12, 10, 8, 14, 20, 14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsItens, 'Itens de Compra')

  // Aba 3: Distribuição — mesmas colunas do exportador
  const distHeaders = [
    'Etapa Cód', 'Etapa Nome', 'Medição', 'Casas Planejadas',
    'Data Início', 'Data Fim', 'Receita a Liberar',
  ]
  const distEx1 = ['INFRA', 'Infraestrutura', 1, 16, '2026-01-15', '2026-03-15', 80000]
  const distEx2 = ['INFRA', 'Infraestrutura', 2, 16, '2026-03-16', '2026-05-15', 80000]
  const distEx3 = ['INFRA', 'Infraestrutura', 3, 16, '2026-05-16', '2026-06-30', 80000]
  const distEx4 = ['INFRA', 'Infraestrutura', 4, 16, '', '', 80000]
  const wsDist = XLSX.utils.aoa_to_sheet([distHeaders, distEx1, distEx2, distEx3, distEx4])
  wsDist['!cols'] = [10, 30, 10, 16, 14, 14, 16].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsDist, 'Distribuição')

  // Download
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const filename = 'template_wbs_completa.xlsx'

  if ('showSaveFilePicker' in window) {
    (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      })
      .then(async (handle) => {
        const w = await handle.createWritable(); await w.write(blob); await w.close()
        toast.success('Template salvo!')
      })
      .catch((err: Error) => { if (err.name !== 'AbortError') throw err })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}

function WBSTab() {
  const { currentCompany } = useProject()
  const queryClient = useQueryClient()
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [isWbsImporting, setIsWbsImporting] = useState(false)

  const handleWbsImport = async (file: File) => {
    if (!file || !currentCompany) return
    try {
      setIsWbsImporting(true)
      const buffer = await file.arrayBuffer()
      const { etapaRows, itemRows, distRows } = parseWBSImport(buffer)
      const preview = await buildImportPreview(etapaRows, itemRows, distRows, currentCompany.id)
      setImportPreview(preview)
    } catch (err: any) {
      toast.error('Erro ao ler arquivo WBS: ' + err.message)
    } finally {
      setIsWbsImporting(false)
    }
  }

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleWbsImport(file)
  }, [currentCompany])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleWbsImport(file)
  }, [currentCompany])

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Importação de WBS Completa</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Importe o escopo completo do projeto em uma única planilha Excel com 3 abas: 
          <strong> Etapas</strong>, <strong>Itens de Compra</strong> e <strong>Distribuição</strong>.
          O template é idêntico ao formato de exportação — você pode exportar, editar no Excel e reimportar.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadWBSTemplate}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent">
            <Download className="h-3.5 w-3.5 text-primary" /> Baixar Template WBS (3 abas)
          </button>
        </div>
        <div className="mt-3 rounded-lg bg-blue-500/5 p-3">
          <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">ℹ️ Formato unificado</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            O template possui as mesmas colunas do Excel exportado pelo botão "Exportar" do Cronograma.
            Preencha apenas os campos editáveis — colunas calculadas (Custo Total, Saldo, Margem) são 
            geradas automaticamente pelo sistema e serão ignoradas na importação.
          </p>
        </div>
      </div>

      <DropZone onFile={handleWbsImport} handleFile={handleFile} handleDrop={handleDrop} />
      
      {isWbsImporting && <div className="mt-4 flex max-w-sm items-center gap-2 text-sm text-muted-foreground"><Spinner /> Carregando arquivo...</div>}

      {importPreview && (
        <ImportPreviewModal 
          preview={importPreview} 
          companyId={currentCompany?.id ?? ''} 
          onClose={() => setImportPreview(null)} 
          onDone={() => { 
            setImportPreview(null); 
            queryClient.invalidateQueries({ queryKey: ['etapas'] }); 
            queryClient.invalidateQueries({ queryKey: ['itens_compra'] }); 
          }} 
        />
      )}
    </>
  )
}




// ═══════════════════════════════════════════════════════════════
// Tab: Pagamentos Realizados (Nova)
// ═══════════════════════════════════════════════════════════════
function PagamentosRealizadosTab() {
  const { currentCompany } = useProject()
  const qc = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [bdResult, setBdResult] = useState<import('@/lib/bdRealizadoImport').BdRealizadoResult | null>(null)
  const [progress, setProgress] = useState(0)

  // ── BD Realizado: file handler ──
  const handleBdRealizado = useCallback(async (file: File) => {
    if (!currentCompany) return
    try {
      const { parseBdRealizado } = await import('@/lib/bdRealizadoImport')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      // Buscar mútuos existentes para detecção de duplicatas
      const { data: rawMutuos } = await supabase
        .from('mutuos')
        .select('id, nome, valor_captado, data_captacao, status')
        .eq('company_id', currentCompany.id)

      type DbMutuo = import('@/lib/bdRealizadoImport').DbMutuo
      const mutuos: DbMutuo[] = (rawMutuos ?? []).map((m: any) => ({
        id: m.id,
        nome: m.nome,
        valor_captado: Number(m.valor_captado),
        data_captacao: m.data_captacao,
        status: m.status,
      }))

      const result = parseBdRealizado(wb, mutuos)
      setBdResult(result)
      toast.success(`${result.stats.total} registros classificados`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao processar planilha: ' + (err as Error).message)
    }
  }, [currentCompany])

  // ── Helper: conta bancaria (NOT NULL) ──
  async function getOrCreateContaBancaria(companyId: string, contaCorrenteStr: string): Promise<string> {
    if (contaCorrenteStr) {
      const searchTerm = contaCorrenteStr.split(' - ')[0]?.trim() || contaCorrenteStr
      const { data } = await supabase
        .from('contas_bancarias').select('id').eq('company_id', companyId)
        .or(`nome.ilike.%${searchTerm}%,banco.ilike.%${searchTerm}%`).limit(1)
      if (data?.[0]?.id) return data[0].id
    }
    const { data: fallback } = await supabase
      .from('contas_bancarias').select('id').eq('company_id', companyId).limit(1)
    if (fallback?.[0]?.id) return fallback[0].id
    const { data: created } = await supabase
      .from('contas_bancarias').insert({ company_id: companyId, nome: 'Conta Principal', banco: 'N/D' })
      .select('id').single()
    return created!.id
  }

  // ── BD Realizado: execute import ──
  const executeBdImport = async () => {
    if (!bdResult || !currentCompany) return
    setIsProcessing(true)
    setProgress(0)

    let despesasCriadas = 0
    let pedidosFlex = 0
    let creditosRegistrados = 0
    let mutuosCriados = 0
    let parcelasAtreladas = 0
    const errors: string[] = []
    
    // Arrays para rastrear IDs para o Rollback pontual
    const trackedIds = {
      mov_ids: [] as string[],
      pedido_ids: [] as string[],
      despesa_ids: [] as string[],
      mutuo_ids: [] as string[],
      item_flex_ids: [] as string[],
      parcela_ids: [] as string[],
      conciliacao_ids: [] as string[],
    }

    const actionable = bdResult.rows.filter(r => r.importPath !== 'skip')
    const total = actionable.length

    let processed = 0
    for (const row of actionable) {
      processed++
      setProgress(Math.round((processed / total) * 100))

      const absValor = Math.abs(row.pagoOuRecebido)
      const dataPgto = row.dataPagamento || row.dataEmissao
      const isSaida = row.pagoOuRecebido < 0

      if (!dataPgto) {
        errors.push(`#${row.seq} [Ignorado]: Sem data válida (pagamento/emissão).`);
        continue;
      }

      try {
        const contaId = await getOrCreateContaBancaria(currentCompany.id, row.contaCorrente)

        // 1. Sempre cria a Movimentação Bancária (Histórico Perfeito)
        const { data: mov, error: movErr } = await supabase.from('movimentacoes_bancarias').insert({
          company_id: currentCompany.id,
          conta_id: contaId,
          data: dataPgto,
          descricao: [row.fornecedor, row.categoria, row.departamento, row.item].filter(Boolean).join(' - ').substring(0, 255) || 'Lançamento',
          valor: absValor,
          tipo: isSaida ? 'saida' : 'entrada',
          categoria: row.categoria === 'Pagamento Devolvido' ? 'Estorno/Devolução' : row.categoria,
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          observacao: row.contaPai !== 'N/D' ? row.contaPai : null,
          origem: 'bd_realizado',
        }).select('id').single()

        if (movErr) { 
          console.error(`[SUPABASE 400 DETALHADO] Erro na linha ${row.seq}:`, JSON.stringify(movErr, null, 2));
          errors.push(`#${row.seq} [Mov]: ${movErr.message}`); 
          continue;
        }
        if (!mov) continue
        trackedIds.mov_ids.push(mov.id)

        // Helpers para Fornecedor
        let fornecedorId = null
        if (row.fornecedor && row.fornecedor !== 'Não informado' && row.fornecedor !== 'N/D') {
          const { data: existingForn } = await supabase
            .from('fornecedores').select('id').eq('company_id', currentCompany.id)
            .ilike('nome', row.fornecedor).limit(1)
          if (existingForn && existingForn.length > 0) fornecedorId = existingForn[0]!.id
          else {
            const { data: newForn } = await supabase.from('fornecedores').insert({ company_id: currentCompany.id, nome: row.fornecedor }).select('id').single()
            if (newForn) fornecedorId = newForn.id
          }
        }

        let parcelaIdParaConciliar = null

        // 2A. DESPESA (Saida)
        if (row.importPath === 'despesa') {
           // Tentar achar a Etapa
           let etapaId = null
           if (row.departamento) {
              const { data: etapa } = await supabase.from('etapas').select('id')
                 .eq('company_id', currentCompany.id).ilike('nome', `%${row.departamento}%`).limit(1).maybeSingle()
              if (etapa) etapaId = etapa.id
           }

           if (etapaId) {
              // 1. Achar o Item na WBS
              const fallbackItemNome = row.item && row.item !== 'N/D' ? row.item : 'Item Flex (Pago)'
              const fallbackClean = fallbackItemNome === 'Item Flex (Pago)' ? 'FLEX' : fallbackItemNome

                   let itemId = null
                   // A busca por item_compra existente (evitar erros de sintaxe no .or do PostgREST)
                   let query = supabase.from('itens_compra').select('id').eq('etapa_id', etapaId).limit(1)
                   if (fallbackClean === 'FLEX') {
                       query = query.eq('codigo', 'FLEX')
                   } else {
                       query = query.ilike('descricao', `%${fallbackItemNome}%`)
                   }
                   const { data: exItem } = await query.maybeSingle()
                   
                   if (exItem) {
                       itemId = exItem.id
                   } else {
                     // Criar item novo (Flex ou planejado fantasma)
                     const tipoItem = 'MATERIAL'
                     const { data: ni } = await supabase.from('itens_compra').insert({
                       company_id: currentCompany.id, etapa_id: etapaId, codigo: fallbackClean === 'FLEX' ? 'FLEX' : 'IMP', 
                       descricao: fallbackItemNome, tipo: tipoItem, valor_total_orcado: 0
                     }).select('id').single()
                     if (ni) {
                         itemId = ni.id
                         trackedIds.item_flex_ids.push(ni.id)
                     }
                   }

                   if (itemId && fornecedorId) {
                     // 2. Achar um Pedido existente para este Fornecedor e Item
                     const { data: exPed } = await supabase.from('pedidos')
                       .select('id, valor_total_real')
                       .eq('item_compra_id', itemId)
                       .eq('fornecedor_id', fornecedorId)
                       .limit(1).maybeSingle()

                     let pedidoId = exPed?.id
                     if (!pedidoId) {
                         // Criar um pedido fantasma estrutural APENAS para ancorar o pagamento
                         // O valor_total_real = 0 garante que NÃO adicione ao "Consumido" da WBS, apenas ao "Pago".
                         const { data: pedido, error: pedErr } = await supabase.from('pedidos').insert({
                           company_id: currentCompany.id, item_compra_id: itemId, fornecedor_id: fornecedorId,
                           data_entrega_real: dataPgto, valor_total_real: 0, status: 'entregue',
                           observacoes: 'Pedido Ancoragem de Pagamento (Criado auto - BD Realizado)'
                         }).select('id').single()
     
                         if (pedErr) {
                           console.error(`[PEDIDO 400] Linha ${row.seq}:`, JSON.stringify(pedErr, null, 2))
                           errors.push(`#${row.seq} [Pedido]: ${pedErr.message}`)
                         } else if (pedido) {
                           pedidoId = pedido.id
                           trackedIds.pedido_ids.push(pedido.id)
                           pedidosFlex++; 
                         }
                     }

                     if (pedidoId) {
                        // 3. Criar a parcela atrelada a este pedido
                        const { data: parc } = await supabase.from('parcelas').insert({
                          company_id: currentCompany.id, pedido_id: pedidoId, valor: absValor, valor_pago: absValor,
                          data_vencimento: dataPgto, data_pagamento_real: dataPgto, numero_parcela: 999, status: 'paga',
                          descricao: 'Parcela BD Realizado'
                        }).select('id').single()
                        if (parc) { 
                            parcelaIdParaConciliar = parc.id; 
                            trackedIds.parcela_ids.push(parc.id)
                        }
                     }
                   }
                } else {
             // Caminho 2: Nao achou Etapa -> Custo Indireto Generico
             const obsParts = [
               row.observacao && `Obs: ${row.observacao}`,
               row.nfCf && `NF: ${row.nfCf}`,
               row.contaPai && row.contaPai !== 'N/D' && `Conta: ${row.contaPai}`,
               row.origem && `Origem: ${row.origem}`,
               row.medicao && `Medicao: ${row.medicao}`,
             ].filter(Boolean).join(' | ')
             const { data: despesa } = await supabase.from('despesas_indiretas').insert({
                company_id: currentCompany.id, categoria: row.categoria || row.departamento || 'Despesa Importada',
                descricao: [row.departamento, row.fornecedor, row.item].filter(Boolean).join(' - ') || 'Lancamento',
                valor_orcado: absValor, valor_consumido: absValor, data_inicio: dataPgto, data_fim: dataPgto,
                fornecedor_id: fornecedorId, ativo: true,
                observacoes: obsParts || null,
             }).select('id').single()

             if (despesa) {
                trackedIds.despesa_ids.push(despesa.id)
                const { data: parc } = await supabase.from('parcelas').insert({
                   company_id: currentCompany.id, despesa_indireta_id: despesa.id, valor: absValor, valor_pago: absValor,
                   data_vencimento: dataPgto, data_pagamento_real: dataPgto, numero_parcela: 1, status: 'paga'
                }).select('id').single()
                if (parc) { 
                    parcelaIdParaConciliar = parc.id; 
                    trackedIds.parcela_ids.push(parc.id)
                    despesasCriadas++; 
                }
             }
          }
        }


        else if (row.importPath === 'mutuo') {
          const { data: mut } = await supabase.from('mutuos').insert({
            company_id: currentCompany.id,
            fornecedor_id: fornecedorId,
            nome: `${row.fornecedor || 'Mútuo'} - ${row.dataPagamento}`,
            tipo: isSaida ? 'ADIANTAMENTO' : 'MÚTUO',
            valor_captado: absValor,
            data_captacao: dataPgto,
            observacoes: 'Gerado via BD Realizado',
            status: 'ativo',
          }).select('id').single()
          if (mut) trackedIds.mutuo_ids.push(mut.id)
          mutuosCriados++
        }

        // 2C. CRÉDITO
        else if (row.importPath === 'credito') {
           creditosRegistrados++
        }

        // 3. Efetivar vínculo na engine de conciliação
        if (parcelaIdParaConciliar) {
          const { data: conc } = await supabase.from('conciliacoes').insert({
            company_id: currentCompany.id,
            movimentacao_id: mov.id,
            match_type: 'exact',
            confidence: 100,
            diferenca: 0,
            status: 'confirmado'
          }).select('id').single()
          if (conc) {
            trackedIds.conciliacao_ids.push(conc.id)
            await supabase.from('conciliacao_parcelas').insert({
              conciliacao_id: conc.id, parcela_id: parcelaIdParaConciliar, valor_aplicado: absValor
            })
          }
        }

      } catch (err) {
        errors.push(`#${row.seq}: ${(err as Error).message}`)
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      company_id: currentCompany.id,
      tabela: 'despesas_indiretas',
      acao: 'INSERT',
      agente: 'sistema',
      dados_depois: {
        type: 'import_bd_realizado_v3_history',
        despesas_criadas: despesasCriadas,
        pedidos_flex: pedidosFlex,
        parcelas_atreladas: parcelasAtreladas,
        creditos: creditosRegistrados,
        mutuos: mutuosCriados,
        errors: errors.length,
        error_details: errors.slice(0, 50),
        tracked_ids: trackedIds, // IDs gerados para rollback pontual!
      },
    })

    qc.invalidateQueries({ queryKey: [] })

    if (errors.length > 0) {
      toast.warning(`Importação com ${errors.length} avisos/erros. Verifique nos Logs de Importação.`)
      console.warn('Erros BD Realizado:', errors)
    }
    const totalProcessado = despesasCriadas + pedidosFlex + parcelasAtreladas + creditosRegistrados + mutuosCriados
    toast.success(`✅ ${totalProcessado} ações: ${despesasCriadas} Desp.Ind. · ${pedidosFlex} Itens Flex · ${parcelasAtreladas} Pagamentos Atrelados a Pedidos · ${mutuosCriados} Mútuos`)
    setIsProcessing(false)
    setProgress(0)
    setBdResult(null)
  }

  const PATH_COLORS: Record<string, string> = {
    despesa: 'bg-amber-100 text-amber-800',
    credito: 'bg-blue-100 text-blue-800',
    mutuo: 'bg-violet-100 text-violet-800',
    skip: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Upload area */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-6">
          <div className="rounded-full bg-primary/10 p-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="mb-1 text-lg font-semibold">Importar Pagamentos Realizados</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Suba a planilha <strong>BD REALIZADO - CONSTRUTORA</strong> para registrar todos os pagamentos como despesas a nível de etapa. O sistema classifica automaticamente saídas (despesas), entradas (créditos) e empréstimos (mútuos).
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
                <Upload className="h-4 w-4" />
                Subir BD Realizado (.xlsx)
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBdRealizado(f); e.target.value = '' }} />
              </label>
              {bdResult && (
                <button onClick={() => setBdResult(null)} className="rounded-lg border px-3 py-2 text-xs hover:bg-muted">
                  <X className="h-4 w-4 inline mr-1" />Limpar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {bdResult && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total', value: bdResult.stats.total, color: 'bg-card border' },
              { label: '📋 Despesas', value: bdResult.stats.despesas, color: 'bg-amber-50 border-amber-200' },
              { label: '💳 Créditos', value: bdResult.stats.creditos, color: 'bg-blue-50 border-blue-200' },
              { label: '🤝 Mútuos', value: bdResult.stats.mutuos, color: 'bg-violet-50 border-violet-200' },
              { label: '⏭️ Já Existem', value: bdResult.stats.skipped, color: 'bg-gray-50 border-gray-200' },
              { label: 'Saídas (R$)', value: null as any, sub: formatCurrency(bdResult.stats.valorSaidas), color: 'bg-red-50 border-red-200' },
            ].map((s, i) => (
              <div key={i} className={`rounded-xl border p-3 ${s.color}`}>
                <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
                {s.value != null ? (
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</p>
                ) : (
                  <p className="mt-0.5 text-sm font-bold tabular-nums">{s.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar during import */}
          {isProcessing && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs font-bold tabular-nums">{progress}%</span>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-sm font-semibold">
                Pré-visualização — {bdResult.rows.length} registros
              </h3>
              <button onClick={executeBdImport} disabled={isProcessing}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {isProcessing ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Processando...</>
                ) : (
                  <><ArrowRight className="h-4 w-4" />Confirmar Importação</>
                )}
              </button>
            </div>

            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Fornecedor</th>
                    <th className="px-3 py-2 font-medium">Departamento</th>
                    <th className="px-3 py-2 font-medium">Categoria</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bdResult.rows.map((row) => (
                    <tr key={row.seq} className={`hover:bg-muted/30 ${row.importPath === 'skip' ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.seq}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{row.dataPagamento ? fmtDateShort(row.dataPagamento) : '—'}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate font-medium" title={row.fornecedor}>
                        {row.fornecedor || '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={row.departamento}>
                        {row.departamento || '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[130px] truncate text-muted-foreground" title={row.categoria}>
                        {row.categoria}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${row.pagoOuRecebido >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatCurrency(Math.abs(row.pagoOuRecebido))}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${PATH_COLORS[row.importPath] || ''}`}>
                          {row.importLabel}
                        </span>
                        {row.autoSkipReason && (
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground italic max-w-[180px]" title={row.autoSkipReason}>{row.autoSkipReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function fmtDateShort(d: string): string {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}
