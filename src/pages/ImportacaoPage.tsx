import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useItensCompra } from '@/hooks/useCompras'
import { useEtapas } from '@/hooks/useEtapas'
import { supabase } from '@/lib/supabase'
import { useAuditLogs } from '@/hooks/useOperacional'
import { gerarParcelas, parsearCondicao, localDate } from '@/lib/parcelas'
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
type Tab = 'wbs' | 'dados' | 'pedidos' | 'medicoes' | 'distribuicao' | 'logs'

export default function ImportacaoPage() {
  const { restartTour } = useTour('importacao', pageTours.importacao)

  const [tab, setTab] = useState<Tab>('wbs')

  const tabs: { key: Tab; label: string; icon: typeof Upload }[] = [
    { key: 'wbs', label: 'WBS Completa (Excel)', icon: FileSpreadsheet },
    { key: 'dados', label: 'Dados Base', icon: FileSpreadsheet },
    { key: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
    { key: 'medicoes', label: 'Medições', icon: Calendar },
    { key: 'distribuicao', label: 'Distribuição Cronograma', icon: BarChart3 },
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
// Tab: Pedidos (NEW)
// ═══════════════════════════════════════════════════════════════
const PEDIDOS_HEADERS = ['item_codigo', 'numero_pedido', 'casas_lote', 'fornecedor_nome', 'cond_pagamento', 'data_entrega_prevista']

function PedidosTab() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; parcelas: number; errors: string[] } | null>(null)

  // Enrich preview rows with parcelas calculation + validation
  type EnrichedPedido = Record<string, any> & { itemExists: boolean; valorTotal: number; parcelasPrevistas: number; itemNome: string; unitarioAplicado: number }
  const enrichedRows = useMemo((): EnrichedPedido[] => {
    if (!preview) return []
    return preview.rows.map((row): EnrichedPedido => {
      const itemCodigo = row['item_codigo'] ?? ''
      const item = itens.find((i) => i.codigo === itemCodigo)
      const casas = parseInt(row['casas_lote'] ?? '0') || 0
      
      const sheetUnitario = row['valor_unitario_real'] ? parseFloat(String(row['valor_unitario_real']).replace(',', '.')) : 0
      const unitario = sheetUnitario > 0 ? sheetUnitario : (item?.custo_unitario_orcado ?? 0)
      
      const qtdPorCasa = item?.qtd_por_casa ?? 1
      const valorTotal = casas * qtdPorCasa * unitario
      const cond = row['cond_pagamento'] ?? ''
      const dias = parsearCondicao(cond)
      const itemExists = !!item
      return { ...row, itemExists, valorTotal, parcelasPrevistas: dias.length, itemNome: item?.descricao ?? '?', unitarioAplicado: unitario }
    })
  }, [preview, itens])

  const doImport = async () => {
    if (!preview || !currentCompany) return
    setImporting(true); setProgress(0)
    const errors: string[] = []
    let successPedidos = 0, totalParcelas = 0

    for (let i = 0; i < enrichedRows.length; i++) {
      setProgress(Math.round(((i + 1) / enrichedRows.length) * 100))
      const row = enrichedRows[i]!
      if (!row.itemExists) { errors.push(`Linha ${i + 2}: item_codigo "${row['item_codigo']}" não encontrado`); continue }
      const item = itens.find((it) => it.codigo === row['item_codigo'])
      if (!item) continue

      try {
        // Resolve fornecedor
        let fornecedorId: string | null = null
        if (row['fornecedor_nome']) {
          const { data: forn } = await supabase.from('fornecedores').select('id').eq('company_id', currentCompany.id).ilike('nome', row['fornecedor_nome']).limit(1).single()
          if (forn) fornecedorId = forn.id
          else {
            // Auto-create fornecedor
            const newFornData: any = { company_id: currentCompany.id, nome: row['fornecedor_nome'] }
            if (row['cond_pagamento']) newFornData.cond_pagamento_padrao = row['cond_pagamento']
            const { data: newForn } = await supabase.from('fornecedores').insert(newFornData).select('id').single()
            fornecedorId = newForn?.id ?? null
          }
        }

        // Create pedido
        const casas = parseInt(row['casas_lote'] ?? '0') || 0
        const unitario = row.unitarioAplicado
        const qtdPorCasa = item.qtd_por_casa ?? 1
        const qtdLote = casas * qtdPorCasa
        const valorTotal = row.valorTotal

        const { data: pedido, error: pedErr } = await supabase.from('pedidos').insert({
          company_id: currentCompany.id,
          item_compra_id: item.id,
          numero_pedido: row['numero_pedido'] ? parseInt(row['numero_pedido']) : null,
          casas_lote: casas,
          qtd_lote: qtdLote,
          valor_unitario_real: unitario,
          valor_total_real: valorTotal,
          fornecedor_id: fornecedorId,
          cond_pagamento: row['cond_pagamento'] || null,
          data_entrega_prevista: row['data_entrega_prevista'] || null,
          status: 'planejado',
        }).select('id').single()

        if (pedErr) throw pedErr
        if (!pedido) throw new Error('Pedido não criado')

        // Generate parcelas
        const dataEntrega = row['data_entrega_prevista'] ? localDate(row['data_entrega_prevista']) : new Date()
        const parcelasGeradas = gerarParcelas({
          pedidoId: pedido.id,
          companyId: currentCompany.id,
          valorTotal,
          condPagamento: row['cond_pagamento'] ?? '',
          dataEntrega,
        })

        if (parcelasGeradas.length > 0) {
          const { error: parcErr } = await supabase.from('parcelas').insert(parcelasGeradas)
          if (parcErr) throw parcErr
          totalParcelas += parcelasGeradas.length
        }

        successPedidos++
      } catch (err) { errors.push(`Linha ${i + 2}: ${formatError(err)}`) }
    }

    if (errors.length > 0) {
      await supabase.from('audit_logs').insert({
        company_id: currentCompany.id,
        tabela: 'pedidos',
        acao: 'INSERT',
        agente: 'sistema',
        dados_depois: { type: 'import_lote', success: successPedidos, total: enrichedRows.length, errors }
      })
    }

    setResult({ success: successPedidos, parcelas: totalParcelas, errors }); setImporting(false)
    if (successPedidos > 0) toast.success(`Importados ${successPedidos} pedidos, ${totalParcelas} parcelas geradas`)
    if (errors.length > 0) toast.error(`${errors.length} erro(s)`)
  }

  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Template de Pedidos</h3>
        <p className="mb-3 text-[10px] text-muted-foreground">Colunas: {PEDIDOS_HEADERS.join(' | ')} <br/><span className="text-blue-500">Nota: O valor unitário será puxado automaticamente do item de compra base se a coluna "valor_unitario_real" não for informada.</span></p>
        <button onClick={() => downloadTemplate('pedidos', PEDIDOS_HEADERS, ['EX-01', '1', '16', 'Fornecedor ABC', '30/60', '2026-05-01'])}
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
              <p className="text-xs text-muted-foreground">{preview.rows.length} pedidos • {enrichedRows.filter((r) => !r.itemExists).length > 0 && <span className="text-red-500">⚠ itens não encontrados</span>}</p>
            </div>
            <button onClick={() => setPreview(null)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Pedido</th>
                  <th className="px-3 py-2 text-right">Casas</th>
                  <th className="px-3 py-2 text-right">Unit.</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Cond.</th>
                  <th className="px-3 py-2 text-left">Entrega</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Parcelas</th>
                  <th className="px-3 py-2 text-center">✓</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enrichedRows.slice(0, 30).map((row, i) => (
                  <tr key={i} className={`hover:bg-muted/30 ${!row.itemExists ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row['item_codigo']}</td>
                    <td className="px-3 py-2">{row['numero_pedido'] ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{row['casas_lote']}</td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(row.unitarioAplicado)}
                      {row['valor_unitario_real'] ? <span className="block text-[9px] text-blue-500">Planilha</span> : <span className="block text-[9px] text-muted-foreground">Do Item</span>}
                    </td>
                    <td className="px-3 py-2">{row['fornecedor_nome'] ?? '—'}</td>
                    <td className="px-3 py-2">{row['cond_pagamento'] ?? '—'}</td>
                    <td className="px-3 py-2">{row['data_entrega_prevista'] ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.valorTotal)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">{row.parcelasPrevistas}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.itemExists
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
              {importing ? <><Spinner />Importando...</> : <><ArrowRight className="h-4 w-4" />Importar {enrichedRows.filter((r) => r.itemExists).length} pedidos</>}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">Resultado</h3>
          {result.success > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />Importados {result.success} pedidos, {result.parcelas} parcelas geradas
            </div>
          )}
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
// Tab: Logs de Importação (NEW)
// ═══════════════════════════════════════════════════════════════
function LogsImportacaoTab() {
  const { data: logs = [], isLoading } = useAuditLogs()
  const importLogs = logs.filter(l => {
    const type = (l.dados_depois as any)?.type
    return type === 'import_lote' || type === 'import_wbs'
  })
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const downloadErrorLog = (logId: string, errors: string[], warnings?: string[]) => {
    const lines = [
      "═══ ERROS DE IMPORTAÇÃO ═══",
      ...(errors.map(e => `[ERRO] ${e}`)),
      "",
      ...(warnings && warnings.length > 0 ? ["═══ AVISOS ═══", ...warnings.map(w => `[AVISO] ${w}`)] : []),
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

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Carregando logs...</div>
  if (importLogs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
      <AlertCircle className="mb-4 h-10 w-10 text-muted-foreground/50" />
      <h3 className="text-lg font-medium text-muted-foreground">Nenhum log de importação</h3>
      <p className="mt-1 text-sm text-muted-foreground/80">O sistema só registrará lotes importados daqui para frente.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="mb-4 rounded-xl border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold">Histórico de Importações Recentes</h3>
        <p className="text-[10px] text-muted-foreground">Registros de todas as importações (WBS completa e lotes individuais) com detalhamento de erros e avisos.</p>
      </div>

      <div className="flex flex-col gap-3">
        {importLogs.map((log) => {
          const dados = log.dados_depois as Record<string, any> | null
          const isWbs = dados?.type === 'import_wbs'
          const isExpanded = expandedLog === log.id

          // WBS import format
          if (isWbs) {
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
                        Importação Completa
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
                        Etapas: {etapas.atualizadas + etapas.criadas} · Itens: {itens.atualizados + itens.criados} · Dist: {dists.atualizadas + dists.criadas} · {totalLinhas} linhas lidas
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
                        <p className="mt-0.5">{etapas.criadas > 0 && <span className="text-emerald-600">{etapas.criadas} criadas</span>}{etapas.criadas > 0 && etapas.atualizadas > 0 && ' · '}{etapas.atualizadas > 0 && <span className="text-blue-600">{etapas.atualizadas} atualizadas</span>}{(etapas.criadas + etapas.atualizadas) === 0 && <span className="text-muted-foreground">—</span>}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Itens de Compra</p>
                        <p className="mt-0.5">{itens.criados > 0 && <span className="text-emerald-600">{itens.criados} criados</span>}{itens.criados > 0 && itens.atualizados > 0 && ' · '}{itens.atualizados > 0 && <span className="text-blue-600">{itens.atualizados} atualizados</span>}{(itens.criados + itens.atualizados) === 0 && <span className="text-muted-foreground">—</span>}</p>
                      </div>
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="font-semibold text-muted-foreground text-[10px] uppercase">Distribuições</p>
                        <p className="mt-0.5">{dists.criadas > 0 && <span className="text-emerald-600">{dists.criadas} criadas</span>}{dists.criadas > 0 && dists.atualizadas > 0 && ' · '}{dists.atualizadas > 0 && <span className="text-blue-600">{dists.atualizadas} atualizadas</span>}{(dists.criadas + dists.atualizadas) === 0 && <span className="text-muted-foreground">—</span>}</p>
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
                              <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-destructive font-bold shrink-0">✕</span> <span className="text-muted-foreground">{erro}</span></li>
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
                              <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-amber-600 font-bold shrink-0">⚠</span> <span className="text-muted-foreground">{aviso}</span></li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {!hasIssues && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> Importação concluída sem erros ou avisos.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          // Legacy import_lote format
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
                    <h4 className="text-sm font-medium">Tabela: <span className="text-primary">{log.tabela.toUpperCase()}</span></h4>
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
                      <Download className="h-3.5 w-3.5" /> Baixar para Correção
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-md border bg-background p-3 text-xs">
                    <ul className="space-y-1">
                      {errors.map((erro, idx) => (
                        <li key={idx} className="flex gap-2 border-b border-border/50 py-1 last:border-0"><span className="text-destructive font-bold">•</span> <span className="text-muted-foreground">{erro}</span></li>
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


