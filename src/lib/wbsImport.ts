import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────
interface EtapaChange {
  tipo: 'atualizar' | 'criar' | 'ignorar'
  codigo: string
  nome: string
  campos: { campo: string; antigo: string; novo: string }[]
  rowData: Record<string, unknown>
}

interface ItemChange {
  tipo: 'atualizar' | 'criar' | 'ignorar'
  etapaCod: string
  itemCod: string
  descricao: string
  campos: { campo: string; antigo: string; novo: string }[]
  rowData: Record<string, unknown>
}

interface DistChange {
  tipo: 'criar' | 'atualizar' | 'ignorar'
  etapaCod: string
  medicao: number
  campos: { campo: string; antigo: string; novo: string }[]
  rowData: Record<string, unknown>
}

export interface ImportPreview {
  etapas: EtapaChange[]
  itens: ItemChange[]
  distribuicoes: DistChange[]
  totalAlteracoes: number
  totalNovos: number
  totalIgnorados: number
}

// ─── Log entry for structured error tracking ──────────────
export interface ImportLogEntry {
  nivel: 'info' | 'warn' | 'error' | 'success'
  fase: 'etapa' | 'item' | 'distribuicao'
  acao: 'criar' | 'atualizar' | 'recalcular' | 'pular'
  referencia: string   // código da etapa/item + contexto
  mensagem: string
  detalhes?: Record<string, unknown>
}

export interface ImportResult {
  etapasAtualizadas: number
  etapasCriadas: number
  itensAtualizados: number
  itensCriados: number
  distsCriadas: number
  distsAtualizadas: number
  logs: ImportLogEntry[]
  erros: number
  avisos: number
}

// ─── Excel serial date → ISO string ───────────────────────
function toDateISO(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const str = String(value).trim()
  if (!str) return null

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)

  // Brazilian format: DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/')
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }

  // Excel serial number (days since 1899-12-30)
  const num = Number(str)
  if (!isNaN(num) && num > 1 && num < 200000) {
    const epoch = new Date(Date.UTC(1899, 11, 30)) // Dec 30, 1899
    const date = new Date(epoch.getTime() + num * 86400000)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return str // fallback: return as-is
}

// Date fields that need conversion
const DATE_FIELDS = new Set(['data_inicio_plan', 'data_fim_plan', 'data_inicio', 'data_fim'])

// Helper: strip accents + whitespace for fuzzy comparison
function stripForMatch(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\/_.-]/g, '').toLowerCase()
}

// Helper to find a column by fuzzy matching possible names
function findCol(row: Record<string, unknown>, possibilities: string[]) {
  const keys = Object.keys(row)
  const cleanKeys = keys.map(k => stripForMatch(k))
  const cleanPoss = possibilities.map(p => stripForMatch(p))

  // Pass 1: Exact matches
  for (let i = 0; i < cleanPoss.length; i++) {
    for (let j = 0; j < cleanKeys.length; j++) {
      if (cleanKeys[j] === cleanPoss[i]) return row[keys[j]!]
    }
  }
  // Pass 2: Starts with
  for (let i = 0; i < cleanPoss.length; i++) {
    for (let j = 0; j < cleanKeys.length; j++) {
      if (cleanKeys[j]!.startsWith(cleanPoss[i]!)) return row[keys[j]!]
    }
  }
  // Pass 3: Includes
  for (let i = 0; i < cleanPoss.length; i++) {
    for (let j = 0; j < cleanKeys.length; j++) {
      if (cleanKeys[j]!.includes(cleanPoss[i]!)) return row[keys[j]!]
    }
  }
  return undefined
}

// ─── Localized Number Parser ──────────────────────────────
function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  
  let str = String(value).replace(/R\$\s?/g, '').trim().replace(/\s/g, '').replace(/\u00A0/g, '')
  if (!str || str === '-') return 0
  
  // Handle Brazilian format (1.234,56) and US format (1,234.56)
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }
  
  const num = Number(str)
  return isNaN(num) ? 0 : num
}

// ─── Type Sanitizer ───────────────────────────────────────
export function sanitizeTipo(val: any): string {
  if (!val) return 'MATERIAL'
  const s = String(val).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_').replace(/-/g, '_')
  if (s.includes('MAO_DE_OBRA') || s.includes('SERVICO') || s.includes('M_O')) return 'MAO_DE_OBRA'
  if (s.includes('EQUIPA') || s.includes('MAQUINA')) return 'EQUIPAMENTO'
  return 'MATERIAL'
}

// ─── Parse ────────────────────────────────────────────────
export function parseWBSImport(buffer: ArrayBuffer): { etapaRows: Record<string, unknown>[]; itemRows: Record<string, unknown>[]; distRows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: 'array' })

  const etapaSheet = wb.Sheets['Etapas']
  const etapaRows = etapaSheet ? (XLSX.utils.sheet_to_json(etapaSheet) as Record<string, unknown>[]) : []

  const itemSheet = wb.Sheets['Itens de Compra']
  const itemRows = itemSheet ? (XLSX.utils.sheet_to_json(itemSheet) as Record<string, unknown>[]) : []

  const distSheet = wb.Sheets['Distribuição']
  const distRows = distSheet ? (XLSX.utils.sheet_to_json(distSheet) as Record<string, unknown>[]) : []

  return { etapaRows, itemRows, distRows }
}

// ─── Build preview (diff) ─────────────────────────────────
export async function buildImportPreview(
  etapaRows: Record<string, unknown>[],
  itemRows: Record<string, unknown>[],
  distRows: Record<string, unknown>[],
  companyId: string
): Promise<ImportPreview> {
  const { data: currentEtapas } = await supabase.from('etapas').select('*').eq('company_id', companyId)
  const { data: currentItems } = await supabase.from('itens_compra').select('*').eq('company_id', companyId).is('deleted_at', null)
  const { data: currentDists } = await supabase.from('cronograma_distribuicao').select('*').eq('company_id', companyId)

  const etapasByCod = new Map((currentEtapas ?? []).map(e => [e.codigo, e]))
  const itemsByCod = new Map((currentItems ?? []).map(i => [i.codigo, i]))

  const distLookup = new Map<string, any>()
  ;(currentDists ?? []).forEach(d => {
    const etapa = (currentEtapas ?? []).find(e => e.id === d.etapa_id)
    if (etapa) distLookup.set(`${etapa.codigo}::${d.medicao_numero}`, d)
  })

  // ─── Etapas preview ───
  const etapasChanges: EtapaChange[] = etapaRows.map(row => {
    const codigo = String(row['Código'] ?? '')
    const existing = etapasByCod.get(codigo)

    if (!existing) {
      return { tipo: 'criar', codigo, nome: String(row['Nome'] ?? ''), campos: [], rowData: row }
    }

    const campos: { campo: string; antigo: string; novo: string }[] = []
    const checks: [string, string, unknown][] = [
      ['Nome', 'nome', row['Nome']],
      ['Status', 'status', row['Status']],
      ['Casas', 'casas_total', parseNumber(row['Casas']) || 64],
      ['Receita CEF', 'faturamento_valor_total', parseNumber(row['Receita CEF'])],
      ['Preço Unitário (Serv)', 'faturamento_preco_unitario', parseNumber(row['Preço Unitário (Serv)'])],
      ['Qtd/Casa (Serv)', 'faturamento_quantidade_unitaria', parseNumber(row['Qtd/Casa (Serv)'])],
      ['Unidade (Serv)', 'faturamento_unidade', row['Unidade (Serv)']],
      ['Data Início Plan', 'data_inicio_plan', toDateISO(row['Data Início Plan'])],
      ['Data Fim Plan', 'data_fim_plan', toDateISO(row['Data Fim Plan'])],
      ['Observações', 'observacoes', row['Observações']],
    ]

    checks.forEach(([label, dbKey, newVal]) => {
      const oldVal = existing[dbKey]
      const nv = newVal ?? ''
      const ov = oldVal ?? ''
      if (String(nv) !== String(ov) && String(nv) !== '') {
        campos.push({ campo: label, antigo: String(ov), novo: String(nv) })
      }
    })

    if (campos.length === 0) return { tipo: 'ignorar', codigo, nome: existing.nome, campos: [], rowData: row }
    return { tipo: 'atualizar', codigo, nome: existing.nome, campos, rowData: row }
  })

  // Use the same global findCol with NFD normalization (no local override needed)

  // ─── Items preview ───
  const itensChanges: ItemChange[] = itemRows.map(row => {
    const itemCod = String(findCol(row, ['Item Cód', 'Código do Item', 'Código Item', 'Item Codigo', 'Cod Item']) ?? '').trim()
    const etapaCod = String(findCol(row, ['Etapa Cód', 'Código da Etapa', 'Etapa Codigo', 'Cod Etapa']) ?? '').trim()
    const existing = itemsByCod.get(itemCod)

    const descricao = String(findCol(row, ['Descrição', 'Nome', 'Descricao Item']) ?? '')
    if (!existing) {
      return { tipo: 'criar', etapaCod, itemCod, descricao, campos: [], rowData: row }
    }

    const campos: { campo: string; antigo: string; novo: string }[] = []
    
    // Evaluate synonymous columns with fuzzy matching
    let qtdCasa = findCol(row, ['Qtd/Casa', 'Qtd Casa', 'Quantidade por Casa', 'Qtd. Casa', 'Qtd. por Casa', 'Qtd/Casa (Mat)'])
    let qtdTotal = findCol(row, ['Qtd Total', 'Quantidade Total', 'Qtd. Total', 'Total Qtd'])
    let custoUnit = findCol(row, ['Custo Unitário', 'Custo Unitario', 'R$/un', 'Preço Unitário', 'Preço Unit.', 'Preco Unitario', 'Custo Unit'])
    let total = findCol(row, ['Valor Total Orçado', 'R$ Total', 'Total', 'Valor Total', 'Vlr. Total'])
    let fornecedor = findCol(row, ['Fornecedor', 'Fornecedores', 'Nome do Fornecedor'])
    let condPag = findCol(row, ['Cond. Pagamento', 'Condição de Pagamento', 'Cond Pagamento', 'Pagamento', 'Cond. Pgto'])
    let tipo = findCol(row, ['Tipo', 'Categoria'])
    let unidadeTag = findCol(row, ['Unidade', 'Unid.', 'Unid', 'UN'])
    
    // In many templates, "Qtd/Casa" only indicates one quantity column
    // We should parse aggressively
    
    // Auto-calculate derived values from sheet data
    const parsedQtdCasa = parseNumber(qtdCasa)
    const parsedCustoUnit = parseNumber(custoUnit)
    const parsedQtdTotal = parseNumber(qtdTotal)
    const parsedTotal = parseNumber(total)
    
    // Fetch casas from the etapa to calculate totals when missing
    const etapaData = etapasByCod.get(etapaCod)
    const casasEtapa = etapaData?.casas_total ?? 64
    
    // Compute derived values when sheet doesn't provide them
    const effectiveQtdTotal = parsedQtdTotal > 0 ? parsedQtdTotal : (parsedQtdCasa > 0 ? parsedQtdCasa * casasEtapa : 0)
    const effectiveTotal = parsedTotal > 0 ? parsedTotal : (effectiveQtdTotal > 0 && parsedCustoUnit > 0 ? effectiveQtdTotal * parsedCustoUnit : 0)
    
    const checks: [string, string, unknown][] = [
      ['Descrição', 'descricao', descricao],
      ['Tipo', 'tipo', tipo],
      ['Qtd/Casa', 'qtd_por_casa', parsedQtdCasa],
      ['Qtd Total', 'qtd_total', effectiveQtdTotal],
      ['Unidade', 'unidade', unidadeTag],
      ['Custo Unitário', 'custo_unitario_orcado', parsedCustoUnit],
      ['Valor Total Orçado', 'valor_total_orcado', effectiveTotal],
      ['Fornecedor', 'fornecedor_nome', fornecedor],
      ['Cond. Pagamento', 'cond_pagamento', condPag],
    ]

    checks.forEach(([label, dbKey, newVal]) => {
      const isNumericField = dbKey.includes('qtd') || dbKey.includes('valor') || dbKey.includes('custo')
      const oldVal = dbKey === 'fornecedor_nome' ? existing.fornecedor_nome : existing[dbKey as keyof typeof existing]
      const nv = isNumericField ? (newVal || 0) : (newVal ?? '')
      const ov = oldVal ?? ''
      
      // For numeric fields: compare as numbers to avoid string format issues (0 vs '0.00' vs '0')
      if (isNumericField) {
        const numNew = Number(nv) || 0
        const numOld = Number(ov) || 0
        // Only skip if both are genuinely zero; if sheet has a real value and DB is zero, mark as update
        if (numNew !== numOld && numNew > 0) {
          campos.push({ campo: label, antigo: String(numOld), novo: String(numNew) })
        }
      } else {
        if (String(nv) !== String(ov) && String(nv) !== '') {
          campos.push({ campo: label, antigo: String(ov), novo: String(nv) })
        }
      }
    })

    if (campos.length === 0) return { tipo: 'ignorar', etapaCod, itemCod, descricao: existing.descricao, campos: [], rowData: row }
    return { tipo: 'atualizar', etapaCod, itemCod, descricao: existing.descricao, campos, rowData: row }
  })

  // ─── Distribuição preview ───
  const distChanges: DistChange[] = distRows.map(row => {
    const etapaCod = String(row['Etapa Cód'] ?? '')
    const medicao = Number(row['Medição']) || 0
    const key = `${etapaCod}::${medicao}`
    const existing = distLookup.get(key)

    if (!existing) {
      return { tipo: 'criar', etapaCod, medicao, campos: [], rowData: row }
    }

    const campos: { campo: string; antigo: string; novo: string }[] = []
    const checks: [string, string, unknown][] = [
      ['Casas Planejadas', 'casas_planejadas', parseNumber(findCol(row, ['Casas Planejadas', 'Casas', 'Qtd Casas']))],
      ['Data Início', 'data_inicio', toDateISO(findCol(row, ['Data Início', 'Data Inicio']))],
      ['Data Fim', 'data_fim', toDateISO(findCol(row, ['Data Fim']))],
      ['Receita a Liberar', 'valor_liberado_faturamento', parseNumber(findCol(row, ['Receita a Liberar', 'Receita a Liberar (R$)', 'Receita']))],
    ]

    checks.forEach(([label, dbKey, newVal]) => {
      const oldVal = existing[dbKey]
      const nv = newVal ?? ''
      const ov = oldVal ?? ''
      if (String(nv) !== String(ov) && String(nv) !== '') {
        campos.push({ campo: label, antigo: String(ov), novo: String(nv) })
      }
    })

    if (campos.length === 0) return { tipo: 'ignorar', etapaCod, medicao, campos: [], rowData: row }
    return { tipo: 'atualizar', etapaCod, medicao, campos, rowData: row }
  })

  const totalAlteracoes = etapasChanges.filter(c => c.tipo === 'atualizar').length + itensChanges.filter(c => c.tipo === 'atualizar').length + distChanges.filter(c => c.tipo === 'atualizar').length
  const totalNovos = etapasChanges.filter(c => c.tipo === 'criar').length + itensChanges.filter(c => c.tipo === 'criar').length + distChanges.filter(c => c.tipo === 'criar').length
  const totalIgnorados = etapasChanges.filter(c => c.tipo === 'ignorar').length + itensChanges.filter(c => c.tipo === 'ignorar').length + distChanges.filter(c => c.tipo === 'ignorar').length

  return { etapas: etapasChanges, itens: itensChanges, distribuicoes: distChanges, totalAlteracoes, totalNovos, totalIgnorados }
}

// ─── Helper: format Supabase error for humans ─────────────
function formatDbError(error: { code?: string; message?: string; details?: string; hint?: string }): string {
  if (error.code === '23505') {
    const match = typeof error.details === 'string' ? error.details.match(/Key \((.+)\)=\((.+)\) already exists/) : null
    if (match) return `Duplicado: "${match[2]}" já existe no campo ${match[1]}`
    return 'Registro duplicado — já existe com esta chave'
  }
  if (error.code === '23503') return `Referência inválida: ${error.details || 'campo vinculado não existe no BD'}`
  if (error.code === '23502') return `Campo obrigatório vazio: ${error.details || 'coluna NOT NULL sem valor'}`
  if (error.code === '23514') return `Violação de restrição: ${error.details || 'valor fora da regra'}`
  if (error.code === '22P02') return `Tipo inválido: ${error.details || 'ex: texto em campo numérico'}`
  if (error.code === '22001') return 'Texto excede o tamanho máximo do campo'
  return error.message || 'Erro desconhecido no banco de dados'
}

function sanitizeStatus(val: any): string {
  if (!val) return 'futuro'
  const s = String(val).toLowerCase().trim()
  if (['concluido', 'concluída', 'concluído', 'finalizado'].includes(s)) return 'concluido'
  if (['em andamento', 'em_andamento', 'ativo', 'ativa', 'iniciado', 'iniciada', 'executando'].includes(s)) return 'em_andamento'
  if (['atrasado', 'atrasada'].includes(s)) return 'atrasado'
  return 'futuro'
}

// ─── Apply Import (with structured logging) ───────────────
export async function applyImport(preview: ImportPreview, companyId: string): Promise<ImportResult> {
  const logs: ImportLogEntry[] = []
  let etapasAtualizadas = 0, etapasCriadas = 0
  let itensAtualizados = 0, itensCriados = 0
  let distsCriadas = 0, distsAtualizadas = 0
  let erros = 0, avisos = 0

  const addLog = (entry: Omit<ImportLogEntry, 'nivel'> & { nivel?: ImportLogEntry['nivel'] }) => {
    const nivel = entry.nivel ?? 'info'
    logs.push({ ...entry, nivel })
    if (nivel === 'error') erros++
    if (nivel === 'warn') avisos++
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 1: ETAPAS
  // ═══════════════════════════════════════════════════════
  const { data: currentEtapas } = await supabase.from('etapas').select('id, codigo').eq('company_id', companyId)
  const etapasByCod = new Map((currentEtapas ?? []).map(e => [e.codigo, e.id]))

  for (const change of preview.etapas) {
    if (change.tipo === 'ignorar') continue

    const ref = `[Etapa ${change.codigo}] ${change.nome}`
    const row = change.rowData

    if (change.tipo === 'atualizar') {
      const id = etapasByCod.get(change.codigo)
      if (!id) {
        addLog({ nivel: 'error', fase: 'etapa', acao: 'atualizar', referencia: ref, mensagem: `ID não encontrado no BD para código "${change.codigo}"` })
        continue
      }

      const updates: Record<string, unknown> = {}
      change.campos.forEach(c => {
        const keyMap: Record<string, string> = {
          'Nome': 'nome', 'Status': 'status', 'Casas': 'casas_total',
          'Receita CEF': 'faturamento_valor_total', 'Preço Unitário (Serv)': 'faturamento_preco_unitario',
          'Qtd/Casa (Serv)': 'faturamento_quantidade_unitaria', 'Unidade (Serv)': 'faturamento_unidade',
          'Data Início Plan': 'data_inicio_plan', 'Data Fim Plan': 'data_fim_plan', 'Observações': 'observacoes',
        }
        const dbKey = keyMap[c.campo]
        if (dbKey) {
          let val: any = c.novo
          if (DATE_FIELDS.has(dbKey)) val = toDateISO(val)
          if (dbKey === 'status') val = sanitizeStatus(val)
          updates[dbKey] = val
        }
      })

      const { error } = await supabase.from('etapas').update(updates).eq('id', id)
      if (error) {
        addLog({ nivel: 'error', fase: 'etapa', acao: 'atualizar', referencia: ref, mensagem: formatDbError(error), detalhes: { campos: Object.keys(updates), dbCode: error.code, raw: error.message } })
        continue
      }

      addLog({ nivel: 'success', fase: 'etapa', acao: 'atualizar', referencia: ref, mensagem: `${change.campos.length} campo(s) atualizado(s): ${change.campos.map(c => c.campo).join(', ')}` })
      etapasAtualizadas++

      // Auto-recalculate items if casas_total changed
      if (updates.casas_total !== undefined) {
        const newCasas = Number(updates.casas_total)
        const { data: etapaItems, error: itemsErr } = await supabase.from('itens_compra').select('id, codigo, qtd_por_casa, custo_unitario_orcado').eq('etapa_id', id)
        if (itemsErr) {
          addLog({ nivel: 'warn', fase: 'etapa', acao: 'recalcular', referencia: ref, mensagem: `Falha ao buscar itens para recálculo: ${formatDbError(itemsErr)}` })
        } else if (etapaItems && etapaItems.length > 0) {
          let recalcOk = 0, recalcFail = 0
          for (const it of etapaItems) {
            if ((it.qtd_por_casa || 0) > 0) {
              const { error: recalcErr } = await supabase.from('itens_compra').update({
                qtd_total: it.qtd_por_casa * newCasas,
                valor_total_orcado: it.qtd_por_casa * newCasas * (it.custo_unitario_orcado || 0)
              }).eq('id', it.id)
              if (recalcErr) {
                addLog({ nivel: 'warn', fase: 'etapa', acao: 'recalcular', referencia: `${ref} → item ${it.codigo}`, mensagem: `Recálculo falhou: ${formatDbError(recalcErr)}` })
                recalcFail++
              } else {
                recalcOk++
              }
            }
          }
          if (recalcOk > 0) addLog({ nivel: 'info', fase: 'etapa', acao: 'recalcular', referencia: ref, mensagem: `${recalcOk} item(ns) recalculado(s) com ${newCasas} casas${recalcFail > 0 ? ` (${recalcFail} com falha)` : ''}` })
        }
      }
    } else if (change.tipo === 'criar') {
      const maxOrder = (currentEtapas ?? []).length + etapasCriadas + 1
      const insertData = {
        company_id: companyId,
        codigo: String(row['Código'] ?? `NEW-${Date.now()}`),
        nome: String(row['Nome'] ?? 'Nova Etapa'),
        status: sanitizeStatus(row['Status']),
        casas_total: Number(row['Casas']) || 64,
        ordem: maxOrder,
        faturamento_valor_total: Number(row['Receita CEF']) || null,
        faturamento_preco_unitario: Number(row['Preço Unitário (Serv)']) || null,
        faturamento_quantidade_unitaria: Number(row['Qtd/Casa (Serv)']) || null,
        faturamento_unidade: String(row['Unidade (Serv)'] ?? '') || null,
        data_inicio_plan: toDateISO(row['Data Início Plan']),
        data_fim_plan: toDateISO(row['Data Fim Plan']),
        observacoes: String(row['Observações'] ?? '') || null,
        valor_total_orcado: 0,
      }

      const { error } = await supabase.from('etapas').insert(insertData)
      if (error) {
        addLog({ nivel: 'error', fase: 'etapa', acao: 'criar', referencia: ref, mensagem: formatDbError(error), detalhes: { dbCode: error.code, raw: error.message, insertData } })
        continue
      }

      addLog({ nivel: 'success', fase: 'etapa', acao: 'criar', referencia: ref, mensagem: `Etapa criada com sucesso (código: ${insertData.codigo}, casas: ${insertData.casas_total})` })
      etapasCriadas++
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2: ITENS DE COMPRA
  // ═══════════════════════════════════════════════════════
  const { data: refreshedEtapas } = await supabase.from('etapas').select('id, codigo, casas_total').eq('company_id', companyId)
  const refreshedMap = new Map((refreshedEtapas ?? []).map(e => [e.codigo, e]))

  const { data: currentItems } = await supabase.from('itens_compra').select('id, codigo').eq('company_id', companyId).is('deleted_at', null)
  const itemsByCod = new Map((currentItems ?? []).map(i => [i.codigo, i.id]))
  
  // Fornecedor mapping
  const { data: currentFornecedores } = await supabase.from('fornecedores').select('id, nome').eq('company_id', companyId)
  const fornecedoresMap = new Map((currentFornecedores ?? []).map(f => [f.nome.trim().toUpperCase(), f.id]))

  for (const change of preview.itens) {
    if (change.tipo === 'ignorar') continue

    const ref = `[Item ${change.itemCod}] (Etapa ${change.etapaCod}) ${change.descricao}`
    const row = change.rowData
    
    // Auto-create Fornecedor if not exists
    let fornecedorId: string | null = null
    const fornecedorStr = String(row['Fornecedor'] ?? '').trim()
    if (fornecedorStr) {
      const existingFid = fornecedoresMap.get(fornecedorStr.toUpperCase())
      if (existingFid) {
        fornecedorId = existingFid
      } else if (fornecedorStr.length >= 2) {
        const { data: novoF, error: fErr } = await supabase.from('fornecedores').insert({
          company_id: companyId,
          nome: fornecedorStr,
        }).select('id').single()
        if (!fErr && novoF) {
          fornecedorId = novoF.id
          fornecedoresMap.set(fornecedorStr.toUpperCase(), novoF.id)
          addLog({ nivel: 'info', fase: 'item', acao: 'criar', referencia: ref, mensagem: `Fornecedor criado automaticamente: "${fornecedorStr}"` })
        }
      }
    }

    if (change.tipo === 'atualizar') {
      const id = itemsByCod.get(change.itemCod)
      if (!id) {
        addLog({ nivel: 'error', fase: 'item', acao: 'atualizar', referencia: ref, mensagem: `ID não encontrado no BD para item "${change.itemCod}"` })
        continue
      }

      const updates: Record<string, unknown> = {}
      change.campos.forEach(c => {
        const keyMap: Record<string, string> = {
          'Descrição': 'descricao', 'Tipo': 'tipo', 
          'Qtd/Casa': 'qtd_por_casa', 'Qtd Total': 'qtd_total', 'Quantidade Total': 'qtd_total',
          'Unidade': 'unidade', 
          'Custo Unitário': 'custo_unitario_orcado', 'R$/un': 'custo_unitario_orcado', 'Preço Unitário': 'custo_unitario_orcado',
          'Valor Total Orçado': 'valor_total_orcado', 'R$ Total': 'valor_total_orcado', 'Total': 'valor_total_orcado',
          'Cond. Pagamento': 'cond_pagamento',
        }
        
        if (c.campo === 'Fornecedor') {
           updates['fornecedor_id'] = fornecedorId
           return
        }

        const dbKey = keyMap[c.campo]
        if (dbKey) {
          const numFields = ['qtd_por_casa', 'qtd_total', 'custo_unitario_orcado', 'valor_total_orcado']
          let val: any = c.novo
          if (numFields.includes(dbKey)) {
             val = parseNumber(val)
          } else if (dbKey === 'tipo') {
             val = sanitizeTipo(val)
          }
          updates[dbKey] = val
        }
      })

      // Always recalculate derived values from sheet data
      const etapaInfo = refreshedMap.get(change.etapaCod)
      if (etapaInfo) {
        const rowQtdCasa = parseNumber(findCol(row, ['Qtd/Casa', 'Qtd Casa', 'Quantidade por Casa', 'Qtd. Casa', 'Qtd. por Casa', 'Qtd/Casa (Mat)']))
        const rowCustoUnit = parseNumber(findCol(row, ['Custo Unitário', 'Custo Unitario', 'R$/un', 'Preço Unitário', 'Preço Unit.', 'Preco Unitario', 'Custo Unit']))
        const rowQtdTotal = parseNumber(findCol(row, ['Qtd Total', 'Quantidade Total', 'Qtd. Total', 'Total Qtd']))
        
        const qtdCasa = updates.qtd_por_casa !== undefined ? Number(updates.qtd_por_casa) : rowQtdCasa
        const custoUnit = updates.custo_unitario_orcado !== undefined ? Number(updates.custo_unitario_orcado) : rowCustoUnit
        const casasEtapa = etapaInfo.casas_total || 64
        const qtdTotal = updates.qtd_total !== undefined 
          ? Number(updates.qtd_total) 
          : (rowQtdTotal > 0 ? rowQtdTotal : (qtdCasa > 0 ? qtdCasa * casasEtapa : 0))
        
        // Always set calculated fields
        updates.qtd_total = qtdTotal
        const calculatedTotal = qtdTotal > 0 && custoUnit > 0 ? qtdTotal * custoUnit : 0
        const sheetTotal = parseNumber(findCol(row, ['Valor Total Orçado', 'R$ Total', 'Valor Total', 'Vlr. Total']))
        updates.valor_total_orcado = sheetTotal > 0 ? sheetTotal : calculatedTotal
        // valor_saldo is GENERATED ALWAYS AS (valor_total_orcado - valor_consumido) — auto-calculated by PostgreSQL
      }

      const { error } = await supabase.from('itens_compra').update(updates).eq('id', id)
      if (error) {
        addLog({ nivel: 'error', fase: 'item', acao: 'atualizar', referencia: ref, mensagem: formatDbError(error), detalhes: { campos: Object.keys(updates), dbCode: error.code, raw: error.message } })
        continue
      }

      addLog({ nivel: 'success', fase: 'item', acao: 'atualizar', referencia: ref, mensagem: `${change.campos.length} campo(s) atualizado(s): ${change.campos.map(c => c.campo).join(', ')}`,
        detalhes: itensAtualizados < 3 ? {
          updates_sent: updates,
          change_campos: change.campos,
          row_keys: Object.keys(row),
        } : undefined
      })
      itensAtualizados++
    } else if (change.tipo === 'criar') {
      const etapaInfo = refreshedMap.get(change.etapaCod)
      if (!etapaInfo) {
        addLog({ nivel: 'error', fase: 'item', acao: 'criar', referencia: ref, mensagem: `Etapa "${change.etapaCod}" não encontrada no BD — item não pode ser vinculado. Verifique se a aba Etapas contém o código "${change.etapaCod}".` })
        continue
      }

      const casasEtapa = etapaInfo.casas_total ?? 64
      
      const qtdCasa = parseNumber(findCol(row, ['Qtd/Casa', 'Qtd Casa', 'Quantidade por Casa', 'Qtd. Casa', 'Qtd. por Casa', 'Qtd/Casa (Mat)']))
      const qtdTotalFromSheet = parseNumber(findCol(row, ['Qtd Total', 'Quantidade Total', 'Qtd. Total', 'Total Qtd']))
      const qtdTotal = qtdTotalFromSheet > 0 ? qtdTotalFromSheet : (qtdCasa > 0 ? qtdCasa * casasEtapa : 0)
      
      const custoUnit = parseNumber(findCol(row, ['Custo Unitário', 'Custo Unitario', 'R$/un', 'Preço Unitário', 'Preço Unit.', 'Preco Unitario', 'Custo Unit']))
      const autoTotal = qtdTotal > 0 && custoUnit > 0 ? qtdTotal * custoUnit : 0
      const totalFromSheet = parseNumber(findCol(row, ['Valor Total Orçado', 'R$ Total', 'Valor Total', 'Vlr. Total']))
      const total = totalFromSheet > 0 ? totalFromSheet : autoTotal

      const insertData = {
        company_id: companyId,
        etapa_id: etapaInfo.id,
        codigo: String(findCol(row, ['Item Cód', 'Código do Item', 'Código Item', 'Item Codigo', 'Cod Item']) ?? `ITEM-${Date.now().toString(36).toUpperCase()}`).trim(),
        descricao: String(findCol(row, ['Descrição', 'Nome', 'Descricao Item']) ?? 'Novo Item'),
        tipo: sanitizeTipo(findCol(row, ['Tipo', 'Categoria'])),
        qtd_por_casa: qtdCasa || null,
        unidade: String(findCol(row, ['Unidade', 'Unid.', 'Unid', 'UN']) ?? '') || null,
        qtd_total: qtdTotal > 0 ? qtdTotal : null,
        custo_unitario_orcado: custoUnit,
        valor_total_orcado: total,
        // valor_saldo: GENERATED ALWAYS — auto-calculated by PostgreSQL
        fornecedor_id: fornecedorId,
        valor_consumido: 0,
        cond_pagamento: String(findCol(row, ['Cond. Pagamento', 'Condição de Pagamento', 'Cond Pagamento', 'Pagamento', 'Cond. Pgto']) ?? '') || null,
      }

      const { error } = await supabase.from('itens_compra').insert(insertData)
      if (error) {
        addLog({ nivel: 'error', fase: 'item', acao: 'criar', referencia: ref, mensagem: formatDbError(error), detalhes: { dbCode: error.code, raw: error.message, insertData } })
        continue
      }

      addLog({ nivel: 'success', fase: 'item', acao: 'criar', referencia: ref, mensagem: `Item criado (tipo: ${insertData.tipo}, total orçado: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
        detalhes: itensCriados < 3 ? {
          raw_custoUnit: findCol(row, ['Custo Unitário', 'Custo Unitario', 'R$/un', 'Preço Unitário', 'Preço Unit.', 'Preco Unitario', 'Custo Unit']),
          raw_qtdTotal: findCol(row, ['Qtd Total', 'Quantidade Total', 'Qtd. Total', 'Total Qtd']),
          raw_valorTotal: findCol(row, ['Valor Total Orçado', 'R$ Total', 'Valor Total', 'Vlr. Total']),
          raw_qtdCasa: findCol(row, ['Qtd/Casa', 'Qtd Casa', 'Quantidade por Casa', 'Qtd. Casa', 'Qtd. por Casa', 'Qtd/Casa (Mat)']),
          parsed_custoUnit: custoUnit,
          parsed_qtdTotal: qtdTotal,
          parsed_total: total,
          parsed_casas: casasEtapa,
          row_keys: Object.keys(row),
          row_values_sample: Object.entries(row).reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, unknown>),
        } : undefined
      })
      itensCriados++
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 3: DISTRIBUIÇÃO
  // ═══════════════════════════════════════════════════════
  const { data: currentDists } = await supabase.from('cronograma_distribuicao').select('*').eq('company_id', companyId)
  const distLookup = new Map<string, string>()
  ;(currentDists ?? []).forEach(d => {
    const etapa = (refreshedEtapas ?? []).find(e => e.id === d.etapa_id)
    if (etapa) distLookup.set(`${etapa.codigo}::${d.medicao_numero}`, d.id)
  })

  for (const change of preview.distribuicoes) {
    if (change.tipo === 'ignorar') continue

    const ref = `[Dist ${change.etapaCod} → Med. ${change.medicao}]`
    const row = change.rowData

    if (change.tipo === 'atualizar') {
      const key = `${change.etapaCod}::${change.medicao}`
      const distId = distLookup.get(key)
      if (!distId) {
        addLog({ nivel: 'error', fase: 'distribuicao', acao: 'atualizar', referencia: ref, mensagem: `Distribuição não encontrada no BD para chave "${key}"` })
        continue
      }

      const updates: Record<string, unknown> = {}
      change.campos.forEach(c => {
        const keyMap: Record<string, string> = {
          'Casas Planejadas': 'casas_planejadas',
          'Data Início': 'data_inicio', 'Data Fim': 'data_fim',
          'Receita a Liberar': 'valor_liberado_faturamento',
        }
        const dbKey = keyMap[c.campo]
        if (dbKey) {
          const numFields = ['casas_planejadas', 'valor_liberado_faturamento']
          if (DATE_FIELDS.has(dbKey)) {
            updates[dbKey] = toDateISO(c.novo)
          } else {
            updates[dbKey] = numFields.includes(dbKey) ? Number(c.novo) || 0 : c.novo
          }
        }
      })

      const { error } = await supabase.from('cronograma_distribuicao').update(updates).eq('id', distId)
      if (error) {
        addLog({ nivel: 'error', fase: 'distribuicao', acao: 'atualizar', referencia: ref, mensagem: formatDbError(error), detalhes: { campos: Object.keys(updates), dbCode: error.code, raw: error.message } })
        continue
      }

      addLog({ nivel: 'success', fase: 'distribuicao', acao: 'atualizar', referencia: ref, mensagem: `${change.campos.length} campo(s) atualizado(s): ${change.campos.map(c => c.campo).join(', ')}` })
      distsAtualizadas++
    } else if (change.tipo === 'criar') {
      const etapaInfo = refreshedMap.get(change.etapaCod)
      if (!etapaInfo) {
        addLog({ nivel: 'error', fase: 'distribuicao', acao: 'criar', referencia: ref, mensagem: `Etapa "${change.etapaCod}" não encontrada — distribuição órfã. Certifique-se de que a aba Etapas contém este código.` })
        continue
      }

      const insertData = {
        company_id: companyId,
        etapa_id: etapaInfo.id,
        medicao_numero: Number(row['Medição']) || change.medicao,
        casas_planejadas: parseNumber(findCol(row, ['Casas Planejadas', 'Casas', 'Qtd Casas'])),
        casas_realizadas: parseNumber(findCol(row, ['Casas Realizadas'])),
        data_inicio: toDateISO(findCol(row, ['Data Início', 'Data Inicio'])),
        data_fim: toDateISO(findCol(row, ['Data Fim'])),
        valor_liberado_faturamento: parseNumber(findCol(row, ['Receita a Liberar', 'Receita a Liberar (R$)', 'Receita'])),
      }

      const { error } = await supabase.from('cronograma_distribuicao').insert(insertData)
      if (error) {
        addLog({ nivel: 'error', fase: 'distribuicao', acao: 'criar', referencia: ref, mensagem: formatDbError(error), detalhes: { dbCode: error.code, raw: error.message, insertData } })
        continue
      }

      addLog({ nivel: 'success', fase: 'distribuicao', acao: 'criar', referencia: ref, mensagem: `Distribuição criada (casas: ${insertData.casas_planejadas}, receita: R$ ${(insertData.valor_liberado_faturamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` })
      distsCriadas++
    }
  }

  // ═══════════════════════════════════════════════════════
  // AUDIT LOG — persist to DB
  // ═══════════════════════════════════════════════════════
  try {
    await supabase.from('audit_logs').insert({
      company_id: companyId,
      tabela: 'wbs_import',
      acao: 'INSERT',
      agente: 'sistema',
      dados_depois: {
        type: 'import_wbs',
        etapas: { atualizadas: etapasAtualizadas, criadas: etapasCriadas },
        itens: { atualizados: itensAtualizados, criados: itensCriados },
        distribuicoes: { atualizadas: distsAtualizadas, criadas: distsCriadas },
        erros,
        avisos,
        total_linhas: preview.etapas.length + preview.itens.length + preview.distribuicoes.length,
        errors: logs.filter(l => l.nivel === 'error').map(l => `${l.referencia}: ${l.mensagem}`),
        warnings: logs.filter(l => l.nivel === 'warn').map(l => `${l.referencia}: ${l.mensagem}`),
        diagnostics: logs.filter(l => l.detalhes).slice(0, 3).map(l => ({ ref: l.referencia, ...l.detalhes })),
      }
    })
  } catch {
    // Non-blocking — audit log failure shouldn't break the import
    console.error('[WBS Import] Falha ao gravar audit_log')
  }

  return { etapasAtualizadas, etapasCriadas, itensAtualizados, itensCriados, distsCriadas, distsAtualizadas, logs, erros, avisos }
}
