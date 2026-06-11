import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useItensCompra, usePedidos, useFornecedores } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { useDespesasIndiretas } from '@/hooks/useDespesasIndiretas'
import { useMutuos } from '@/hooks/useMutuos'
import { useDistribuicao } from '@/hooks/useOperacional'
import { useParcelas } from '@/hooks/useFinanceiro'
import { supabase } from '@/lib/supabase'
import { useAuditLogs } from '@/hooks/useOperacional'
import { parsearCondicao, gerarParcelas, localDate } from '@/lib/parcelas'
import { formatCurrency } from '@/lib/utils'
import { downloadFilledTemplate, dateSuffix } from '@/lib/exportExcel'
import { exportWBSToExcel } from '@/lib/wbsExport'
import { exportComercialToExcel } from '@/lib/comercialExport'
import { parseComercialImport, buildComercialPreview, type ComercialPreview } from '@/lib/comercialImport'
import ComercialImportPreviewModal from '@/components/cronograma/ComercialImportPreviewModal'
import { safeRead, safeSheetToJson, newWorkbook, addAoaSheet, workbookToBlob, XLSX_MIME, type SafeWorkSheet } from '@/lib/safeXlsx'
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download,
  ArrowRight, ShoppingCart, Calendar, BarChart3, Plus, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTour } from '@/lib/tours/useTour'
import { pageTours } from '@/lib/tours/page-tours'
import { useQueryClient } from '@tanstack/react-query'
import { parseWBSImport, buildImportPreview, toDateISO, sanitizeStatus, sanitizeTipo } from '@/lib/wbsImport'
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

/** Trim + squash de espa\u00e7os internos. Mant\u00e9m case original (UI exibe assim). */
function normFornecedorNome(s: string): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Parse a number from a sheet cell that may include currency symbols, thousand
 * separators (pt-BR or US), or decimal separators of either style.
 * Examples that all return 570:
 *   "R$ 570.00" · "570,00" · "R$ 1.234,56" → 1234.56 · "1,234.56" → 1234.56
 */
function parseNumberCell(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const original = String(v).trim()
  if (!original) return 0
  let s = original.replace(/[R$\s\u00a0]/gi, '')
  if (s === '-' || s === '' || s === 'N/D' || /^[a-zA-Z]/.test(s)) {
    console.warn(`[parseNumberCell] valor n\u00e3o-num\u00e9rico ignorado: "${original}"`)
    return 0
  }
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  } else if (lastDot >= 0) {
    const parts = s.split('.')
    if (parts.length > 2) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  if (isNaN(n)) {
    console.warn(`[parseNumberCell] n\u00e3o consegui parsear: "${original}"`)
    return 0
  }
  return n
}

function parseSheetToRows(worksheet: SafeWorkSheet): { headers: string[]; rows: ParsedRow[] } {
  // Read as array-of-arrays to detect the real header row when the sheet has
  // descriptive lines on top (ex.: SFP template has 3 descriptive rows before
  // the ETAPA/ITEM/... header).
  const arr = safeSheetToJson<unknown[]>(worksheet, { header: 1, defval: '', raw: false })
  if (arr.length === 0) return { headers: [], rows: [] }

  const HEADER_KEYWORDS = [
    'etapa', 'item', 'fornecedor', 'descricao', 'descrição', 'valor', 'quantidade',
    'casas', 'codigo', 'código', 'data', 'cond', 'pagamento', 'vencimento',
  ]

  let headerIdx = 0
  for (let i = 0; i < Math.min(arr.length, 20); i++) {
    const row = (arr[i] ?? []) as unknown[]
    const cells = row.map(c => (c == null ? '' : String(c).trim())).filter(Boolean)
    if (cells.length < 2) continue
    const lowered = cells.join(' ').toLowerCase()
    if (HEADER_KEYWORDS.some(k => lowered.includes(k))) { headerIdx = i; break }
    if (cells.length >= 3) { headerIdx = i; break }
  }

  const rawHeaders = ((arr[headerIdx] ?? []) as unknown[]).map(h => String(h ?? '').trim())
  const headers = rawHeaders.map(normalizeHeader)
  const rows: ParsedRow[] = []
  for (let i = headerIdx + 1; i < arr.length; i++) {
    const row = (arr[i] ?? []) as unknown[]
    const obj: ParsedRow = {}
    rawHeaders.forEach((_, idx) => {
      const key = headers[idx]!
      const val = row[idx]
      obj[key] = val != null ? String(val).trim() : ''
    })
    if (Object.values(obj).some(v => v !== '')) rows.push(obj)
  }
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

function processFile(file: File, onDone: (p: ImportPreview) => void, preferredSheetKeyword?: string) {
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
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = await safeRead(data)
        let sheet = wb.SheetNames[0]
        if (preferredSheetKeyword) {
          const kw = preferredSheetKeyword.toLowerCase()
          const match = wb.SheetNames.find(n => n.toLowerCase().includes(kw))
          if (match) sheet = match
        }
        if (!sheet) { toast.error('Planilha vazia'); return }
        const { headers, rows } = parseSheetToRows(wb.Sheets[sheet]!)
        if (sheet !== wb.SheetNames[0]) {
          toast.info(`Aba "${sheet}" selecionada automaticamente`)
        }
        onDone({ headers, rows, fileName: file.name })
      } catch { toast.error('Erro ao ler arquivo Excel') }
    }
    reader.readAsArrayBuffer(file)
  }
}

async function downloadTemplate(name: string, headers: string[], exampleRow: string[]) {
  const wb = newWorkbook()
  addAoaSheet(wb, 'Template', [headers, exampleRow], { widths: headers.map((h) => Math.max(h.length + 4, 16)) })
  const blob = await workbookToBlob(wb)
  const filename = `template_${name}.xlsx`

  if ('showSaveFilePicker' in window) {
    (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { [XLSX_MIME]: ['.xlsx'] } }],
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
type Tab = 'wbs' | 'comercial' | 'dados' | 'pedidos' | 'indiretos' | 'medicoes' | 'distribuicao' | 'logs' | 'pagamentos'

export default function ImportacaoPage() {
  const { restartTour } = useTour('importacao', pageTours.importacao)

  const [tab, setTab] = useState<Tab>('wbs')

  const tabs: { key: Tab; label: string; icon: typeof Upload }[] = [
    { key: 'wbs', label: 'WBS Completa (Excel)', icon: FileSpreadsheet },
    { key: 'comercial', label: 'Pacote Comercial', icon: ShoppingCart },
    { key: 'dados', label: 'Dados Base', icon: FileSpreadsheet },
    { key: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
    { key: 'indiretos', label: 'Custos Indiretos', icon: BarChart3 },
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
      {tab === 'comercial' && <ComercialTab />}
      {tab === 'dados' && <DadosBaseTab />}
      {tab === 'pedidos' && <PedidosTab />}
      {tab === 'indiretos' && <CustosIndiretosTab />}
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
    optional: ['ordem', 'data_inicio_plan', 'data_fim_plan', 'casas_total', 'valor_total_orcado', 'status', 'observacoes', 'receita_cef', 'preco_unitario_serv', 'qtd_casa_serv', 'unidade_serv'],
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
  const { data: etapasData = [] } = useEtapas()
  const { data: itensData = [] } = useItensCompra()
  const { data: fornecedoresData = [] } = useFornecedores()
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
            data_inicio_plan: toDateISO(row['data_inicio_plan']),
            data_fim_plan: toDateISO(row['data_fim_plan']),
            casas_total: row['casas_total'] ? parseInt(row['casas_total']) : 0,
            valor_total_orcado: row['valor_total_orcado'] ? parseNumberCell(row['valor_total_orcado']) : 0,
            status: sanitizeStatus(row['status']),
            observacoes: row['observacoes'] || null,
            faturamento_valor_total: row['receita_cef'] ? parseNumberCell(row['receita_cef']) : null,
            faturamento_preco_unitario: row['preco_unitario_serv'] ? parseNumberCell(row['preco_unitario_serv']) : null,
            faturamento_quantidade_unitaria: row['qtd_casa_serv'] ? parseNumberCell(row['qtd_casa_serv']) : null,
            faturamento_unidade: row['unidade_serv'] || null,
          })
          if (error) throw error
        } else if (targetTable === 'fornecedores') {
          const nomeNorm = normFornecedorNome(row['nome'] ?? '')
          if (!nomeNorm) { errors.push(`Linha ${i + 2}: nome do fornecedor vazio`); continue }
          const { error } = await supabase.from('fornecedores').insert({
            company_id: currentCompany.id, nome: nomeNorm,
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
            tipo: sanitizeTipo(row['tipo']),
            categoria: row['categoria'] || null,
            unidade: row['unidade'] || null,
            qtd_por_casa: row['qtd_por_casa'] ? parseNumberCell(row['qtd_por_casa']) : null,
            qtd_total: row['qtd_total'] ? parseNumberCell(row['qtd_total']) : null,
            custo_unitario_orcado: row['custo_unitario_orcado'] ? parseNumberCell(row['custo_unitario_orcado']) : 0,
            valor_total_orcado: row['valor_total_orcado'] ? parseNumberCell(row['valor_total_orcado']) : 0,
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

  const doDownloadAtual = () => {
    const mapping = TABLE_MAPPINGS[targetTable]
    const headers = [...mapping.required, ...mapping.optional]
    const etapaById = new Map((etapasData as any[]).map(e => [e.id, e]))
    let rows: Record<string, unknown>[] = []
    if (targetTable === 'etapas') {
      rows = (etapasData as any[]).map(e => ({
        codigo: e.codigo,
        nome: e.nome,
        ordem: e.ordem,
        data_inicio_plan: e.data_inicio_plan ?? '',
        data_fim_plan: e.data_fim_plan ?? '',
        casas_total: e.casas_total ?? '',
        valor_total_orcado: e.valor_total_orcado ?? '',
        status: e.status ?? '',
        observacoes: e.observacoes ?? '',
        receita_cef: e.faturamento_valor_total ?? '',
        preco_unitario_serv: e.faturamento_preco_unitario ?? '',
        qtd_casa_serv: e.faturamento_quantidade_unitaria ?? '',
        unidade_serv: e.faturamento_unidade ?? '',
      }))
    } else if (targetTable === 'itens_compra') {
      rows = (itensData as any[]).map(i => ({
        codigo: i.codigo,
        descricao: i.descricao,
        tipo: i.tipo,
        etapa_codigo: etapaById.get(i.etapa_id)?.codigo ?? '',
        categoria: i.categoria ?? '',
        unidade: i.unidade ?? '',
        qtd_por_casa: i.qtd_por_casa ?? '',
        qtd_total: i.qtd_total ?? '',
        custo_unitario_orcado: i.custo_unitario_orcado ?? '',
        valor_total_orcado: i.valor_total_orcado ?? '',
        fornecedor_nome: i.fornecedor_nome ?? '',
        cond_pagamento: i.cond_pagamento ?? '',
      }))
    } else if (targetTable === 'fornecedores') {
      rows = (fornecedoresData as any[]).map(f => ({
        nome: f.nome,
        cnpj: f.cnpj ?? '',
        contato: f.contato ?? '',
        cond_pagamento_padrao: f.cond_pagamento_padrao ?? '',
        observacoes: f.observacoes ?? '',
      }))
    }
    if (rows.length === 0) {
      toast.info(`Sem dados para exportar em ${mapping.label}. Use "Baixar template" para um modelo vazio.`)
      return
    }
    downloadFilledTemplate({
      filename: `${targetTable}_atual_${dateSuffix()}`,
      sheetName: 'Template',
      headers,
      rows,
    })
    toast.success(`${rows.length} linha(s) exportadas em ${mapping.label}`)
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

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={doDownloadAtual} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          title="Baixa os dados atuais já preenchidos no formato do template — edite no Excel e re-importe.">
          <Download className="h-4 w-4" />Baixar atuais — {TABLE_MAPPINGS[targetTable].label}
        </button>
        <button onClick={doDownload} className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent"
          title="Template em branco com 1 linha de exemplo.">
          <Download className="h-4 w-4 text-primary" />Baixar template (vazio)
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
const PEDIDOS_HEADERS = ['item_codigo', 'numero_pedido', 'casas_lote', 'fornecedor_nome', 'cond_pagamento', 'data_entrega_prevista', 'valor_unitario_real'] as const

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
    const itemCodigo = findPedCol(row, ['Código', 'codigo', 'item_codigo', 'item_cod'])
    const fornecedor = findPedCol(row, ['FORNECEDOR', 'fornecedor_nome'])
    const condPag = findPedCol(row, ['COND PAGTO', 'COND. PAGTO', 'cond_pagamento', 'Cond Pagamento'])
    const casas = findPedCol(row, ['QUANTIDADE DE CASAS', 'casas_lote', 'casas'])
    const valorUnit = findPedCol(row, ['valor_unit._1', ' VALOR UNIT. ', 'valor_unitario_real', 'VALOR UNIT.'])
    const valorTotal = findPedCol(row, ['valor_total_1', 'VALOR TOTAL_1', 'VALOR TOTAL'])
    const qtdEntrega = findPedCol(row, ['quant._2', 'QUANT._2'])
    const dataEntrega = findPedCol(row, ['DATA DA ENTREGA', 'data_da_entrega', 'data_entrega_prevista', 'DATA ENTREGA'])
    const numeroPedido = findPedCol(row, ['NUMERO PEDIDO', 'NÚMERO PEDIDO', 'Nº Pedido', 'No Pedido', 'PEDIDO', 'numero_pedido', 'num_pedido'])
    return {
      'item_codigo': itemCodigo ?? '',
      '_item_descricao': itemDesc,
      '_etapa_nome': etapaNome,
      'numero_pedido': numeroPedido,
      'casas_lote': casas,
      'fornecedor_nome': fornecedor,
      'cond_pagamento': condPag,
      'data_entrega_prevista': parsePedDate(dataEntrega),
      'valor_unitario_real': valorUnit ? String(parseNumberCell(valorUnit)) : '',
      'valor_total_override': valorTotal ? String(parseNumberCell(valorTotal)) : '',
      '_qtd_entrega': qtdEntrega,
    }
  })
}

function PedidosTab() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const { data: projectEtapas = [] } = useEtapas()
  const { data: pedidosData = [] } = usePedidos()
  const { data: parcelasData = [] } = useParcelas()
  const qc = useQueryClient()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; parcelas: number; errors: string[] } | null>(null)

  const downloadPedidosAtuais = () => {
    if (pedidosData.length === 0) {
      toast.info('Sem pedidos para exportar — use "Baixar template" para um modelo vazio.')
      return
    }
    const itensById = new Map((itens as any[]).map(i => [i.id, i]))
    const etapasById = new Map((projectEtapas as any[]).map(e => [e.id, e]))
    const parcelasByPedido = new Map<string, any[]>()
    for (const p of (parcelasData as any[])) {
      if (!p.pedido_id) continue
      const arr = parcelasByPedido.get(p.pedido_id) ?? []
      arr.push(p)
      parcelasByPedido.set(p.pedido_id, arr)
    }
    // Cabeçalhos enriquecidos: importador ignora silenciosamente colunas extras (read-only).
    // As colunas que o parser realmente lê estão em PEDIDOS_HEADERS; demais são contexto humano.
    // Convenção: nomes terminados em _count = contagem de linhas; em _valor = soma em R$.
    const headers = [
      'etapa_codigo', 'etapa_nome',         // contexto/lookup
      'item_codigo', 'item_descricao',       // contexto
      'numero_pedido', 'casas_lote', 'qtd_lote',
      'fornecedor_nome', 'cond_pagamento',
      'data_entrega_prevista', 'data_entrega_real',
      'valor_unitario_real', 'valor_total_real',
      'status', 'observacoes',
      // resumo de parcelas — read-only (só pra você ver)
      'parcelas_count',                    // contagem total de parcelas (inclui adiantamentos)
      'parcelas_count_contratuais',        // contagem só das tipo='contratual'
      'parcelas_valor_total',              // Σ valor (todas — pode incluir adiantamentos!)
      'parcelas_valor_contratuais',        // Σ valor só das tipo='contratual' (= valor_total_real esperado)
      'parcelas_pagas_count', 'parcelas_pagas_valor',
      'parcelas_em_aberto_count', 'parcelas_saldo_aberto',
      'parcelas_proximo_vencimento',
    ] as const
    const rows = (pedidosData as any[]).map(p => {
      const item = itensById.get(p.item_compra_id)
      const etapa = item ? etapasById.get(item.etapa_id) : undefined
      const parcs = parcelasByPedido.get(p.id) ?? []
      const parcsContratuais = parcs.filter(x => (x.tipo ?? 'contratual') === 'contratual')
      const parcsValorTotal = parcs.reduce((s, x) => s + Number(x.valor || 0), 0)
      const parcsValorContratuais = parcsContratuais.reduce((s, x) => s + Number(x.valor || 0), 0)
      const parcsPagas = parcs.filter(x => x.status === 'paga')
      const parcsPagasValor = parcs.reduce((s, x) => s + Number(x.valor_pago || 0), 0)
      const parcsAbertas = parcs.filter(x => x.status !== 'paga' && x.status !== 'cancelada')
      const parcsSaldoAberto = parcsAbertas.reduce((s, x) => s + (Number(x.valor || 0) - Number(x.valor_pago || 0)), 0)
      const proxVenc = parcsAbertas
        .filter(x => x.data_vencimento)
        .map(x => x.data_vencimento)
        .sort()[0] ?? ''
      return {
        etapa_codigo: etapa?.codigo ?? '',
        etapa_nome: etapa?.nome ?? '',
        item_codigo: item?.codigo ?? '',
        item_descricao: item?.descricao ?? '',
        numero_pedido: p.numero_pedido ?? '',
        casas_lote: p.casas_lote ?? '',
        qtd_lote: p.qtd_lote ?? '',
        fornecedor_nome: p.fornecedor_nome ?? '',
        cond_pagamento: p.cond_pagamento ?? '',
        data_entrega_prevista: p.data_entrega_prevista ?? '',
        data_entrega_real: p.data_entrega_real ?? '',
        valor_unitario_real: p.valor_unitario_real ?? '',
        valor_total_real: p.valor_total_real ?? '',
        status: p.status ?? '',
        observacoes: p.observacoes ?? '',
        parcelas_count: parcs.length,
        parcelas_count_contratuais: parcsContratuais.length,
        parcelas_valor_total: parcsValorTotal.toFixed(2),
        parcelas_valor_contratuais: parcsValorContratuais.toFixed(2),
        parcelas_pagas_count: parcsPagas.length,
        parcelas_pagas_valor: parcsPagasValor.toFixed(2),
        parcelas_em_aberto_count: parcsAbertas.length,
        parcelas_saldo_aberto: parcsSaldoAberto.toFixed(2),
        parcelas_proximo_vencimento: proxVenc,
      }
    })
    downloadFilledTemplate({
      filename: `pedidos_atuais_${dateSuffix()}`,
      sheetName: 'Template',
      headers,
      rows,
    })
    toast.success(`${rows.length} pedido(s) exportado(s) com contexto + resumo de parcelas`)
  }

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
      const casas = parseNumberCell(row['casas_lote'])
      const sheetUnitario = parseNumberCell(row['valor_unitario_real'])
      const unitario = sheetUnitario > 0 ? sheetUnitario : (item?.custo_unitario_orcado ?? 0)
      const overrideTotal = parseNumberCell(row['valor_total_override'])
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
        const fornNomeNorm = normFornecedorNome(row['fornecedor_nome'] ?? '')
        if (fornNomeNorm) {
          const { data: forn } = await supabase.from('fornecedores').select('id, cond_pagamento_padrao').eq('company_id', currentCompany.id).ilike('nome', fornNomeNorm).limit(1).single()
          if (forn) { fornecedorId = forn.id; fornCond = forn.cond_pagamento_padrao }
          else {
            const newFornData: any = { company_id: currentCompany.id, nome: fornNomeNorm }
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
        const casas = parseNumberCell(row['casas_lote'])
        const unitario = row.unitarioAplicado
        const qtdPorCasa = item.qtd_por_casa ?? 1
        const qtdLote = row['_qtd_entrega'] ? parseNumberCell(row['_qtd_entrega']) : casas * qtdPorCasa
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
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadPedidosAtuais}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            title="Baixa os pedidos atuais do projeto já preenchidos — edite no Excel e re-importe.">
            <Download className="h-3.5 w-3.5" />Baixar pedidos atuais
          </button>
          <button onClick={() => downloadTemplate('pedidos', [...PEDIDOS_HEADERS], ['EX-01', '1', '16', 'Fornecedor ABC', '30/60', '2026-05-01', '450.00'])}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
            title="Template em branco com 1 linha de exemplo.">
            <Download className="h-3.5 w-3.5 text-primary" />Baixar template (vazio)
          </button>
        </div>
      </div>
      <DropZone onFile={(f) => processFile(f, handleFile, 'pedido')} />
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
            <table className="tbl-bf w-full text-xs">
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
// Tab: Custos Indiretos
// ═══════════════════════════════════════════════════════════════
const INDIRETOS_HEADERS = ['descricao', 'categoria', 'fornecedor_nome', 'cond_pagamento', 'data_inicio', 'valor_orcado']

function normalizeIndiretosRows(raw: ParsedRow[]): ParsedRow[] {
  return raw.map(row => {
    const descricao = findPedCol(row, ['Descrição', 'descricao', 'descriçao', 'DESCRIÇÃO'])
    const categoria = findPedCol(row, ['Categoria', 'categoria', 'CATEGORIA']) || 'Indireto'
    const fornecedor = findPedCol(row, ['Fornecedor', 'fornecedor', 'fornecedor_nome', 'FORNECEDOR'])
    const condPag = findPedCol(row, ['Cond. Pagamento', 'cond_pagamento', 'Cond Pagamento', 'COND PAGTO', 'Condição de Pagamento'])
    const dataInicio = findPedCol(row, ['Data Início', 'data_inicio', 'Data Inicio', 'Data de Início', 'DATA INÍCIO'])
    const valorOrcado = findPedCol(row, ['Valor Orçado', 'valor_orcado', 'Valor Orcado', 'VALOR ORÇADO', 'valor'])
    return {
      'descricao': descricao,
      'categoria': categoria,
      'fornecedor_nome': fornecedor,
      'cond_pagamento': condPag,
      'data_inicio': parsePedDate(dataInicio),
      'valor_orcado': valorOrcado ? String(parseNumberCell(valorOrcado)) : '',
    }
  })
}

function CustosIndiretosTab() {
  const { currentCompany } = useProject()
  const { despesas: despesasData = [] } = useDespesasIndiretas()
  const { data: parcelasData = [] } = useParcelas()
  const qc = useQueryClient()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; parcelas: number; total: number; errors: string[] } | null>(null)

  const downloadCustosAtuais = () => {
    if (despesasData.length === 0) {
      toast.info('Sem custos indiretos para exportar — use "Template" para um modelo vazio.')
      return
    }
    const parcelasByDesp = new Map<string, any[]>()
    for (const p of (parcelasData as any[])) {
      if (!p.despesa_indireta_id) continue
      const arr = parcelasByDesp.get(p.despesa_indireta_id) ?? []
      arr.push(p)
      parcelasByDesp.set(p.despesa_indireta_id, arr)
    }
    const headers = [
      'descricao', 'categoria', 'fornecedor_nome',
      'cond_pagamento', 'data_inicio', 'data_fim',
      'valor_orcado', 'recorrente', 'frequencia', 'ativo',
      'observacoes',
      // read-only — contexto
      'valor_consumido',
      'parcelas_count', 'parcelas_valor_total',
      'parcelas_pagas_count', 'parcelas_pagas_valor',
      'parcelas_em_aberto_count', 'parcelas_saldo_aberto',
      'parcelas_proximo_vencimento',
    ] as const
    const rows = (despesasData as any[]).map(d => {
      const parcs = parcelasByDesp.get(d.id) ?? []
      const parcsValorTotal = parcs.reduce((s, x) => s + Number(x.valor || 0), 0)
      const parcsPagas = parcs.filter(x => x.status === 'paga')
      const parcsPagasValor = parcs.reduce((s, x) => s + Number(x.valor_pago || 0), 0)
      const parcsAbertas = parcs.filter(x => x.status !== 'paga' && x.status !== 'cancelada')
      const parcsSaldoAberto = parcsAbertas.reduce((s, x) => s + (Number(x.valor || 0) - Number(x.valor_pago || 0)), 0)
      const proxVenc = parcsAbertas
        .filter(x => x.data_vencimento)
        .map(x => x.data_vencimento)
        .sort()[0] ?? ''
      return {
        descricao: d.descricao,
        categoria: d.categoria ?? '',
        fornecedor_nome: d.fornecedor_nome ?? '',
        cond_pagamento: d.cond_pagamento ?? '',
        data_inicio: d.data_inicio ?? '',
        data_fim: d.data_fim ?? '',
        valor_orcado: d.valor_orcado ?? '',
        recorrente: d.recorrente ? 'sim' : 'nao',
        frequencia: d.frequencia ?? '',
        ativo: d.ativo ? 'sim' : 'nao',
        observacoes: d.observacoes ?? '',
        valor_consumido: d.valor_consumido ?? 0,
        parcelas_count: parcs.length,
        parcelas_valor_total: parcsValorTotal.toFixed(2),
        parcelas_pagas_count: parcsPagas.length,
        parcelas_pagas_valor: parcsPagasValor.toFixed(2),
        parcelas_em_aberto_count: parcsAbertas.length,
        parcelas_saldo_aberto: parcsSaldoAberto.toFixed(2),
        parcelas_proximo_vencimento: proxVenc,
      }
    })
    downloadFilledTemplate({
      filename: `custos_indiretos_atuais_${dateSuffix()}`,
      sheetName: 'Template',
      headers,
      rows,
    })
    toast.success(`${rows.length} custo(s) indireto(s) exportado(s) com resumo de parcelas`)
  }

  const handleFile = useCallback((p: ImportPreview) => {
    const normalized = normalizeIndiretosRows(p.rows)
      .filter(r => r['descricao'] && !/^total/i.test(r['descricao']!) && parseNumberCell(r['valor_orcado']) > 0)
    setPreview({ ...p, rows: normalized })
    setResult(null)
  }, [])

  interface EnrichedIndireto {
    descricao?: string
    categoria?: string
    fornecedor_nome?: string
    cond_pagamento?: string
    data_inicio?: string
    valor_orcado?: string
    valorOrcado: number
    parcelasPrevistas: number
  }
  const enrichedRows = useMemo<EnrichedIndireto[]>(() => {
    if (!preview) return []
    return preview.rows.map(row => ({
      descricao: row['descricao'],
      categoria: row['categoria'],
      fornecedor_nome: row['fornecedor_nome'],
      cond_pagamento: row['cond_pagamento'],
      data_inicio: row['data_inicio'],
      valor_orcado: row['valor_orcado'],
      valorOrcado: parseNumberCell(row['valor_orcado']),
      parcelasPrevistas: parsearCondicao(row['cond_pagamento'] ?? '').length,
    }))
  }, [preview])

  const totalOrcado = useMemo(
    () => enrichedRows.reduce((s, r) => s + r.valorOrcado, 0),
    [enrichedRows]
  )

  const doImport = async () => {
    if (!preview || !currentCompany) return
    setImporting(true); setProgress(0)
    const errors: string[] = []
    let successDespesas = 0, totalParcelas = 0
    for (let i = 0; i < enrichedRows.length; i++) {
      setProgress(Math.round(((i + 1) / enrichedRows.length) * 100))
      const row = enrichedRows[i]!
      try {
        let fornecedorId: string | null = null
        const fornNomeNorm = normFornecedorNome(row['fornecedor_nome'] ?? '')
        if (fornNomeNorm) {
          const { data: forn } = await supabase.from('fornecedores').select('id')
            .eq('company_id', currentCompany.id).ilike('nome', fornNomeNorm).limit(1).single()
          if (forn) fornecedorId = forn.id
          else {
            const { data: newForn } = await supabase.from('fornecedores').insert({
              company_id: currentCompany.id, nome: fornNomeNorm,
            }).select('id').single()
            fornecedorId = newForn?.id ?? null
          }
        }
        const dataInicio = row['data_inicio'] || new Date().toISOString().split('T')[0]!
        const { data: despesa, error: despErr } = await supabase.from('despesas_indiretas').insert({
          company_id: currentCompany.id,
          categoria: row['categoria'] || 'Indireto',
          descricao: row['descricao']!,
          valor_orcado: row.valorOrcado,
          valor_consumido: 0,
          data_inicio: dataInicio,
          data_fim: null,
          fornecedor_id: fornecedorId,
          ativo: true,
          recorrente: false,
          frequencia: null,
        }).select('id').single()
        if (despErr) throw despErr
        if (!despesa) throw new Error('Despesa não criada')

        if (row.valorOrcado > 0) {
          const parcelas = gerarParcelas({
            pedidoId: despesa.id,
            companyId: currentCompany.id,
            valorTotal: row.valorOrcado,
            condPagamento: row['cond_pagamento'] || 'à vista',
            dataEntrega: localDate(dataInicio),
          })
          if (parcelas.length > 0) {
            const adapted = parcelas.map(p => ({ ...p, pedido_id: null, despesa_indireta_id: despesa.id }))
            const { error: parcErr } = await supabase.from('parcelas').insert(adapted)
            if (parcErr) console.warn('Erro ao gerar parcelas:', parcErr.message)
            else totalParcelas += parcelas.length
          }
        }
        successDespesas++
      } catch (err) { errors.push(`Linha ${i + 2} (${row['descricao']}): ${formatError(err)}`) }
    }
    await supabase.from('audit_logs').insert({
      company_id: currentCompany.id, tabela: 'despesas_indiretas', acao: 'INSERT', agente: 'sistema',
      dados_depois: { type: 'import_custos_indiretos', success: successDespesas, total: enrichedRows.length, errors },
    })
    setResult({ success: successDespesas, parcelas: totalParcelas, total: totalOrcado, errors }); setImporting(false)
    if (successDespesas > 0) {
      toast.success(`Importados ${successDespesas} custos indiretos, ${totalParcelas} parcelas geradas`)
      qc.invalidateQueries({ queryKey: ['despesas_indiretas'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        Aceita a aba <strong>06_Custos_Indiretos</strong> do arquivo completo (auto-detecta).
        <br/>Colunas esperadas: <code>Descrição</code>, <code>Categoria</code>, <code>Fornecedor</code>, <code>Cond. Pagamento</code>, <code>Data Início</code>, <code>Valor Orçado</code>.
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={downloadCustosAtuais}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
            title="Baixa os custos indiretos atuais já preenchidos — edite no Excel e re-importe.">
            <Download className="h-3 w-3" />Baixar custos atuais
          </button>
          <button onClick={() => downloadTemplate('custos_indiretos', INDIRETOS_HEADERS,
            ['Aluguel container', 'Indireto', 'Fornecedor ABC', '30/60/90', '2026-03-28', '3000'])}
            className="inline-flex items-center gap-1 text-primary hover:underline">
            <Download className="h-3 w-3" />Template (vazio)
          </button>
        </div>
      </div>

      <DropZone onFile={(f) => processFile(f, handleFile, 'indireto')} />

      {preview && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h3 className="font-semibold">Preview — {enrichedRows.length} custos indiretos</h3>
              <p className="text-xs text-muted-foreground">
                Total orçado: <strong className="text-foreground">{formatCurrency(totalOrcado)}</strong>
              </p>
            </div>
            <button onClick={() => { setPreview(null); setResult(null) }}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">
              <X className="inline h-3 w-3 mr-1" />Descartar
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="tbl-bf w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Cond.</th>
                  <th className="px-3 py-2 text-left">Data Início</th>
                  <th className="px-3 py-2 text-right">Valor Orçado</th>
                  <th className="px-3 py-2 text-center">Parcelas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enrichedRows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 max-w-[250px] truncate" title={row['descricao']}>{row['descricao']}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{row['categoria']}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[140px] truncate" title={row['fornecedor_nome']}>{row['fornecedor_nome'] || '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums">{row['cond_pagamento'] || 'à vista'}</td>
                    <td className="px-3 py-1.5 tabular-nums">{row['data_inicio']}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{formatCurrency(row.valorOrcado)}</td>
                    <td className="px-3 py-1.5 text-center"><span className="rounded-full bg-blue-500/10 text-blue-600 px-2 py-0.5 text-[10px] font-bold">{row.parcelasPrevistas}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted font-bold">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(totalOrcado)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t p-4">
            <button onClick={doImport} disabled={importing}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {importing ? <>Processando {progress}%</> : <><CheckCircle2 className="h-4 w-4" />Importar {enrichedRows.length} custos indiretos</>}
            </button>
            {importing && (
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h3 className="font-semibold">
              {result.success} custos indiretos importados · {result.parcelas} parcelas geradas
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">Total orçado: <strong>{formatCurrency(result.total)}</strong></p>
          {result.errors.length > 0 && (
            <div className="mt-3 max-h-48 overflow-auto rounded-lg bg-red-500/5 p-2 text-xs">
              <p className="font-bold text-red-600 mb-1">{result.errors.length} erros:</p>
              {result.errors.map((e, i) => <p key={i} className="text-red-500">· {e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
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
          <table className="tbl-bf w-full text-xs">
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
const DIST_HEADERS = ['etapa_codigo', 'medicao_numero', 'data', 'casas'] as const

function DistribuicaoTab() {
  const { currentCompany } = useProject()
  const { data: etapas = [] } = useEtapas()
  const { data: distribuicoesData = [] } = useDistribuicao()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  const downloadDistAtual = () => {
    if (distribuicoesData.length === 0) {
      toast.info('Sem distribuições para exportar — use "Baixar template" para um modelo vazio.')
      return
    }
    const etapaById = new Map((etapas as any[]).map(e => [e.id, e]))
    const rows = (distribuicoesData as any[]).map(d => ({
      etapa_codigo: etapaById.get(d.etapa_id)?.codigo ?? '',
      medicao_numero: d.medicao_numero ?? '',
      data: d.data_inicio ?? '',
      casas: d.casas_planejadas ?? '',
    }))
    downloadFilledTemplate({
      filename: `distribuicao_atual_${dateSuffix()}`,
      sheetName: 'Template',
      headers: DIST_HEADERS,
      rows,
    })
    toast.success(`${rows.length} distribuição(ões) exportada(s)`)
  }

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
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadDistAtual}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            title="Baixa as distribuições atuais já preenchidas — edite no Excel e re-importe.">
            <Download className="h-3.5 w-3.5" />Baixar distribuição atual
          </button>
          <button onClick={() => downloadTemplate('distribuicao', [...DIST_HEADERS], ['7', '1', '2026-03-16', '16'])}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
            title="Template em branco com 1 linha de exemplo.">
            <Download className="h-3.5 w-3.5 text-primary" />Baixar template (vazio)
          </button>
        </div>
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
            <table className="tbl-bf w-full text-xs">
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
        <table className="tbl-bf w-full text-xs">
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

async function downloadWBSTemplate() {
  const wb = newWorkbook()

  // Aba 1: Etapas — mesmas colunas do exportador
  const etapaHeaders = [
    'Código', 'Nome', 'Status', 'Casas', 'Ordem',
    'Receita CEF', 'Preço Unitário (Serv)', 'Qtd/Casa (Serv)', 'Unidade (Serv)',
    'Data Início Plan', 'Data Fim Plan', 'Observações',
  ]
  const etapaEx1 = ['INFRA', 'Infraestrutura', 'futuro', 64, 1, 320000, 5000, 1, 'vb', '2026-01-15', '2026-06-30', '']
  const etapaEx2 = ['SUPER', 'Superestrutura', 'futuro', 64, 2, 480000, 7500, 1, 'vb', '2026-04-01', '2026-10-30', '']
  addAoaSheet(wb, 'Etapas', [etapaHeaders, etapaEx1, etapaEx2], { widths: [10, 30, 14, 8, 8, 16, 18, 14, 12, 16, 16, 30] })

  // Aba 2: Itens de Compra — mesmas colunas do exportador
  const itemHeaders = [
    'Etapa Cód', 'Etapa Nome', 'Item Cód', 'Descrição', 'Tipo',
    'Qtd/Casa', 'Unidade', 'Custo Unitário',
    'Fornecedor', 'Cond. Pagamento',
  ]
  const itemEx1 = ['INFRA', 'Infraestrutura', 'INFRA-001', 'Concreto Usinado FCK 25', 'MATERIAL', 2.5, 'm³', 450, 'Concreteira ABC', '30/60/90']
  const itemEx2 = ['INFRA', 'Infraestrutura', 'INFRA-002', 'Aço CA-50', 'MATERIAL', 120, 'kg', 8.5, 'Aço Brasil', '30 DDL']
  const itemEx3 = ['SUPER', 'Superestrutura', 'SUPER-001', 'Alvenaria Bloco 14', 'MATERIAL', 35, 'm²', 42, '', '28 DDL']
  addAoaSheet(wb, 'Itens de Compra', [itemHeaders, itemEx1, itemEx2, itemEx3], { widths: [10, 30, 14, 30, 12, 10, 8, 14, 20, 14] })

  // Aba 3: Distribuição — mesmas colunas do exportador
  const distHeaders = [
    'Etapa Cód', 'Etapa Nome', 'Medição', 'Casas Planejadas',
    'Data Início', 'Data Fim', 'Receita a Liberar',
  ]
  const distEx1 = ['INFRA', 'Infraestrutura', 1, 16, '2026-01-15', '2026-03-15', 80000]
  const distEx2 = ['INFRA', 'Infraestrutura', 2, 16, '2026-03-16', '2026-05-15', 80000]
  const distEx3 = ['INFRA', 'Infraestrutura', 3, 16, '2026-05-16', '2026-06-30', 80000]
  const distEx4 = ['INFRA', 'Infraestrutura', 4, 16, '', '', 80000]
  addAoaSheet(wb, 'Distribuição', [distHeaders, distEx1, distEx2, distEx3, distEx4], { widths: [10, 30, 10, 16, 14, 14, 16] })

  // Download
  const blob = await workbookToBlob(wb)
  const filename = 'template_wbs_completa.xlsx'

  if ('showSaveFilePicker' in window) {
    (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { [XLSX_MIME]: ['.xlsx'] } }],
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
  const { data: etapas = [] } = useEtapas()
  const { data: itens = [] } = useItensCompra()
  const { data: distribuicoes = [] } = useDistribuicao()
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [isWbsImporting, setIsWbsImporting] = useState(false)

  const downloadWBSAtual = () => {
    if (etapas.length === 0) {
      toast.info('Sem dados para exportar — cadastre etapas primeiro ou use "Baixar Template WBS (vazio)".')
      return
    }
    exportWBSToExcel(etapas as any, itens as any, distribuicoes as any)
    toast.success(`WBS atual exportada: ${etapas.length} etapas, ${itens.length} itens, ${distribuicoes.length} distribuições`)
  }

  const handleWbsImport = async (file: File) => {
    if (!file || !currentCompany) return
    try {
      setIsWbsImporting(true)
      const buffer = await file.arrayBuffer()
      const { etapaRows, itemRows, distRows } = await parseWBSImport(buffer)
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
          <button onClick={downloadWBSAtual}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            title="Baixa o WBS atual do projeto (Etapas + Itens + Distribuição) já preenchido — edite no Excel e re-importe.">
            <Download className="h-3.5 w-3.5" /> Baixar WBS com dados atuais
          </button>
          <button onClick={downloadWBSTemplate}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
            title="Template em branco com 2 linhas de exemplo.">
            <Download className="h-3.5 w-3.5 text-primary" /> Baixar Template WBS (vazio)
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
// Tab: Pacote Comercial (multi-aba: Pedidos+Parcelas+Custos+Fornecedores)
// ═══════════════════════════════════════════════════════════════
function ComercialTab() {
  const { currentCompany } = useProject()
  const queryClient = useQueryClient()
  const { data: etapasData = [] } = useEtapas()
  const { data: itensData = [] } = useItensCompra()
  const { data: pedidosData = [] } = usePedidos()
  const { data: parcelasData = [] } = useParcelas()
  const { despesas: despesasData = [] } = useDespesasIndiretas()
  const { data: fornecedoresData = [] } = useFornecedores()
  const { data: mutuosData = [] } = useMutuos()

  const [importPreview, setImportPreview] = useState<ComercialPreview | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleExport = () => {
    if (pedidosData.length === 0 && despesasData.length === 0 && parcelasData.length === 0) {
      toast.info('Sem dados comerciais para exportar.')
      return
    }
    const mutuoParcelasCount = mutuosData.reduce((acc, m) => acc + (m.parcelas?.length ?? 0), 0)
    exportComercialToExcel({
      etapas: etapasData as any,
      itensCompra: itensData as any,
      pedidos: pedidosData as any,
      parcelas: parcelasData as any,
      despesas: despesasData as any,
      fornecedores: fornecedoresData as any,
      mutuos: mutuosData as any,
    })
    toast.success(`Exportado: ${pedidosData.length} pedidos, ${parcelasData.length} parcelas, ${despesasData.length} custos, ${fornecedoresData.length} fornecedores, ${mutuoParcelasCount} parcelas de mútuos`)
  }

  const handleFile = async (file: File) => {
    if (!currentCompany) return
    setIsProcessing(true)
    try {
      const buffer = await file.arrayBuffer()
      const rows = await parseComercialImport(buffer)
      if (rows.pedidoRows.length === 0 && rows.parcelaRows.length === 0 && rows.despesaRows.length === 0 && rows.fornecedorRows.length === 0) {
        toast.error('Nenhuma das abas esperadas foi encontrada (Pedidos, Parcelas, Custos Indiretos, Fornecedores).')
        return
      }
      const prev = await buildComercialPreview(rows, currentCompany.id)
      setImportPreview(prev)
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + (err as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Pacote Comercial — pedidos, parcelas, custos e fornecedores</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Baixa <strong>tudo</strong> num único arquivo Excel com 4 abas (Pedidos, Parcelas, Custos Indiretos, Fornecedores).
          Cada linha tem um <strong>ID estável</strong> na primeira coluna — edite à vontade no Excel e re-importe sem perder
          identidade. Ideal para reprogramação pesada do projeto.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            title="Baixa o pacote comercial completo do projeto.">
            <Download className="h-3.5 w-3.5" /> Baixar Pacote Comercial
          </button>
        </div>
        <div className="mt-3 rounded-lg bg-blue-500/5 p-3 text-[10px] text-muted-foreground">
          <p className="font-medium text-blue-600 dark:text-blue-400">ℹ Como funciona</p>
          <ul className="mt-0.5 space-y-0.5 list-disc pl-4">
            <li>Linha com <code>*_id</code> preenchido → atualizar registro existente</li>
            <li>Linha com <code>*_id</code> vazio → criar novo registro</li>
            <li>Registro do banco que sumiu da planilha → preview pergunta linha-a-linha (ignorar / apagar)</li>
            <li>Σ parcelas ≠ valor_total_real do pedido → aparece warning amarelo (não bloqueia)</li>
            <li>Colunas com <code>[colchete]</code> são read-only (contexto humano, importador ignora)</li>
          </ul>
        </div>
      </div>

      <DropZone onFile={handleFile} />

      {isProcessing && <div className="mt-4 flex max-w-sm items-center gap-2 text-sm text-muted-foreground"><Spinner /> Processando arquivo e comparando com o banco...</div>}

      {importPreview && currentCompany && (
        <ComercialImportPreviewModal
          preview={importPreview}
          companyId={currentCompany.id}
          onClose={() => setImportPreview(null)}
          onDone={() => {
            setImportPreview(null)
            queryClient.invalidateQueries({ queryKey: ['pedidos'] })
            queryClient.invalidateQueries({ queryKey: ['parcelas'] })
            queryClient.invalidateQueries({ queryKey: ['despesas_indiretas'] })
            queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
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
      const wb = await safeRead(buf)

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

    // Pré-carregar parcelas pendentes para match com fornecedor+valor+data
    const { data: parcelasCandidatas } = await supabase
      .from('parcelas')
      .select('id, valor, data_vencimento, valor_pago, pedido_id, despesa_indireta_id, status, pedidos(fornecedor_id, fornecedores(nome)), despesas_indiretas(descricao, fornecedor_id, fornecedores(nome))')
      .eq('company_id', currentCompany.id)
      .is('deleted_at', null)
      .neq('status', 'paga')
    type Candidato = { id: string; valor: number; data_vencimento: string; valor_pago: number; pedido_id: string | null; despesa_indireta_id: string | null; fornNome: string }
    const parcelasPool: Candidato[] = ((parcelasCandidatas ?? []) as any[]).map(p => ({
      id: p.id, valor: Number(p.valor), data_vencimento: p.data_vencimento,
      valor_pago: Number(p.valor_pago || 0),
      pedido_id: p.pedido_id, despesa_indireta_id: p.despesa_indireta_id,
      fornNome: (p.pedidos?.fornecedores?.nome ?? p.despesas_indiretas?.fornecedores?.nome ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
    }))

    function normalizarNome(s: string): string {
      return (s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(LTDA|ME|EPP|S\.A\.?|SA|CIA\.?|LTDA\.?|SOLUCOES|INDUSTRIAIS|PARTICIPACOES|ADMINISTRATIVO|LOGISTICO|CENTRO|BRASIL|GESTAO)\b/g, '')
        .replace(/\b\d{9,14}\b/g, '')
        .replace(/[^A-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    function sharedPrefixLen(a: string, b: string): number {
      let i = 0
      while (i < a.length && i < b.length && a[i] === b[i]) i++
      return i
    }
    function fornCompatvel(forn1: string, forn2: string): boolean {
      const a = normalizarNome(forn1), b = normalizarNome(forn2)
      if (!a || !b) return false
      if (a === b) return true
      const tokensA = a.split(/\s+/).filter(t => t.length >= 3)
      const tokensB = b.split(/\s+/).filter(t => t.length >= 3)
      if (tokensA.length === 0 || tokensB.length === 0) return false
      for (const ta of tokensA) {
        for (const tb of tokensB) {
          if (ta === tb) return true
          const prefix = sharedPrefixLen(ta, tb)
          const minLen = Math.min(ta.length, tb.length)
          if (prefix >= 5 && Math.abs(ta.length - tb.length) <= 2 && prefix >= minLen - 2) return true
          if (prefix >= 4 && (ta.length <= 5 || tb.length <= 5) && Math.abs(ta.length - tb.length) <= 1) return true
          if (prefix >= 3 && ta.length <= 5 && tb.length <= 5 && Math.abs(ta.length - tb.length) <= 1) return true
        }
      }
      return false
    }
    /**
     * Match com SCORE BLEND (v2).
     * Pesos: fornecedor compatível > valor próximo > data próxima.
     *
     * Escala do score (menor = melhor):
     *   - Fornecedor incompatível: +10000 (fora salvo)
     *   - Match exato de valor (±1%): score base + data
     *   - Match parcial (saldo >= valor): score base + distância do valor + data
     *
     * Janela de data: 120 dias (antes 90) — cobre condições 30/60/90/120
     * Tolerância valor exato: 1% (antes 2%)
     */
    function findMatchParcela(forn: string, valor: number, dataPgto: string): { cand: Candidato; exato: boolean } | null {
      const tolExato = Math.max(valor * 0.01, 0.5)
      const dataPgtoDt = new Date(dataPgto + 'T12:00:00').getTime()
      const matches: { cand: Candidato; exato: boolean; score: number }[] = []

      for (const p of parcelasPool) {
        const saldo = p.valor - p.valor_pago
        if (saldo <= 0.005) continue

        const diffDias = Math.abs((new Date(p.data_vencimento + 'T12:00:00').getTime() - dataPgtoDt) / 86400000)
        if (diffDias > 120) continue

        const fornOK = fornCompatvel(forn, p.fornNome)
        const exato = Math.abs(p.valor - valor) <= tolExato
        const parcial = saldo + 0.01 >= valor

        if (!exato && !parcial) continue

        // Score blend (menor = melhor):
        //  - match exato: base 0, senão 500 (parcial)
        //  - + fornecedor incompatível: +2000 (penalidade grande, mas ainda candidato)
        //  - + distância relativa do valor (0-100)
        //  - + distância em dias (0-120)
        let score = exato ? 0 : 500
        if (!fornOK) score += 2000
        score += Math.abs(saldo - valor) / Math.max(valor, 1) * 50
        score += diffDias * 2

        matches.push({ cand: p, exato, score })
      }

      if (matches.length === 0) return null
      matches.sort((a, b) => a.score - b.score)

      // Só aceita se o melhor tem fornecedor compatível (score < 2000) OU é match exato (mesmo sem fornecedor)
      const best = matches[0]!
      const fornBestOK = fornCompatvel(forn, best.cand.fornNome)
      if (!fornBestOK && !best.exato) return null

      return { cand: best.cand, exato: best.exato }
    }
    let pedidosBaixados = 0
    let pedidosBaixadosParcial = 0

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
        const fornNomeNorm = normFornecedorNome(row.fornecedor)
        if (fornNomeNorm && fornNomeNorm !== 'Não informado' && fornNomeNorm !== 'N/D') {
          const { data: existingForn } = await supabase
            .from('fornecedores').select('id').eq('company_id', currentCompany.id)
            .ilike('nome', fornNomeNorm).limit(1)
          if (existingForn && existingForn.length > 0) fornecedorId = existingForn[0]!.id
          else {
            const { data: newForn } = await supabase.from('fornecedores').insert({ company_id: currentCompany.id, nome: fornNomeNorm }).select('id').single()
            if (newForn) fornecedorId = newForn.id
          }
        }

        let parcelaIdParaConciliar = null

        // 2A-pre: Tentar match com parcela existente antes de criar despesa nova
        if (row.importPath === 'despesa' && isSaida) {
          const match = findMatchParcela(row.fornecedor, absValor, dataPgto)
          if (match) {
            const { cand: candidato } = match
            const novoPago = candidato.valor_pago + absValor
            const total = candidato.valor
            const novoStatus = novoPago >= total - 0.01 ? 'paga' : 'parcialmente_paga'
            await supabase.from('parcelas').update({
              status: novoStatus, valor_pago: novoPago, data_pagamento_real: dataPgto,
            }).eq('id', candidato.id)
            parcelaIdParaConciliar = candidato.id
            candidato.valor_pago = novoPago
            if (novoStatus === 'paga') {
              const idx = parcelasPool.findIndex(p => p.id === candidato.id)
              if (idx >= 0) parcelasPool.splice(idx, 1)
              pedidosBaixados++
            } else {
              pedidosBaixadosParcial++
            }
            // Pula o fluxo de criar despesa nova — esta linha foi casada
            row.importPath = 'skip'
          }
        }

        // 2A. DESPESA (Saida) — fallback se não achou match
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
        pedidos_baixados: pedidosBaixados,
        pedidos_baixados_parcial: pedidosBaixadosParcial,
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
    const totalProcessado = despesasCriadas + pedidosBaixados + pedidosBaixadosParcial + pedidosFlex + parcelasAtreladas + creditosRegistrados + mutuosCriados
    toast.success(`✅ ${totalProcessado} ações: ${pedidosBaixados} parcelas quitadas · ${pedidosBaixadosParcial} parciais · ${despesasCriadas} Desp.Ind. · ${mutuosCriados} Mútuos`)
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
            <p className="mb-2 text-sm text-muted-foreground">
              Suba a planilha <strong>BD REALIZADO - CONSTRUTORA</strong> para registrar todos os pagamentos como despesas a nível de etapa. O sistema classifica automaticamente saídas (despesas), entradas (créditos) e empréstimos (mútuos).
            </p>
            <p className="mb-4 rounded-lg bg-blue-500/5 p-2 text-[11px] text-blue-700 dark:text-blue-400">
              ℹ️ Esta aba não tem "Baixar dados atuais" — o BD Realizado é uma planilha gerada pela <strong>construtora</strong> (sistema externo), não pelo Build Fleury. Use os relatórios de Pagamentos / Conciliação para ver o que já foi registrado.
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
              <table className="tbl-bf w-full text-xs">
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
