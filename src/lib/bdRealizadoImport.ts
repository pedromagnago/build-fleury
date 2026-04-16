/**
 * Build Fleury — BD Realizado Import Engine v3
 *
 * Classificação baseada no SINAL DO VALOR (mais confiável que o campo "Tipo"):
 *   valor < 0  → SAÍDA  → despesa ou skip (se financeira)
 *   valor > 0  → ENTRADA → mútuo, crédito ou skip
 *   valor == 0 → skip
 *
 * Custos registrados a nível de ETAPA (departamento), não de item WBS.
 */
import * as XLSX from 'xlsx'

// ─── Types ──────────────────────────────────────────────────

export type ImportPath = 'despesa' | 'credito' | 'mutuo' | 'skip'

export interface BdRealizadoRow {
  seq: number
  dataPagamento: string
  dataEmissao: string
  fornecedor: string
  tipo: string
  categoria: string
  valorConta: number
  pagoOuRecebido: number
  aPagarOuReceber: number
  contaCorrente: string
  departamento: string
  item: string
  medicao: string
  observacao: string
  origem: string
  nfCf: string
  contaPai: string
  importPath: ImportPath
  importLabel: string
  autoSkipReason: string | null
}

export interface BdRealizadoResult {
  rows: BdRealizadoRow[]
  stats: {
    total: number
    despesas: number
    creditos: number
    mutuos: number
    skipped: number
    valorSaidas: number
    valorEntradas: number
  }
}

export interface DbMutuo {
  id: string
  nome: string
  valor_captado: number
  data_captacao: string
  status: string
}

// ─── Helpers ────────────────────────────────────────────────

function norm(s: string): string {
  return (s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function parseDate(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().split('T')[0]!
  const s = String(v).trim()
  if (/^\d{5}$/.test(s)) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]!
  }
  
  // Tenta formato ISO (YYYY-MM-DD) ou com erros tipo "202-04-30"
  const isoMatch = s.match(/^(\d{3,4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  if (isoMatch) {
    let y = isoMatch[1]!
    if (y.length === 3 && y.startsWith('202')) y = '2024' // Corrige erro de digitação comum
    const m = isoMatch[2]!.padStart(2, '0')
    const d = isoMatch[3]!.padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Tenta formato BR (DD/MM/YYYY) com possíveis erros
  const brMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})/)
  if (brMatch) {
    const d = brMatch[1]!.padStart(2, '0')
    const m = brMatch[2]!.padStart(2, '0')
    let y = brMatch[3]!
    if (y.length === 3 && y.startsWith('202')) y = '2024'
    return `${y}-${m}-${d}`
  }

  return s.slice(0, 10)
}

function parseNumber(v: any): number {
  if (typeof v === 'number') return v
  const s = String(v || '0').replace(/[^\d.,-]/g, '').replace(',', '.')
  return parseFloat(s) || 0
}

// ─── Category Sets ──────────────────────────────────────────

/** Categorias que indicam mútuo/empréstimo (entradas) */
const CATS_MUTUO_ENTRADA = new Set([
  'EMPRESTIMOS BANCARIOS',
  'ENTRADA DE TRANSFERENCIA',
])

/** (Desativado) Categorias que são movimentações financeiras (saídas) — agora importadas como despesa 
// const CATS_FINANCEIRO_SAIDA = new Set([
//   'PAGAMENTO DE EMPRESTIMOS',
//   'EMPRESTIMOS BANCARIOS',
//   'DISTRIBUICAO DE LUCROS',
//   'SAIDA DE TRANSFERENCIA',
// ])
*/

// ─── Column Detection ───────────────────────────────────────

function findColumn(headers: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    const normC = norm(c)
    const found = headers.find(h => norm(h).includes(normC) || normC.includes(norm(h)))
    if (found) return found
  }
  return null
}

// ─── Main Parse ─────────────────────────────────────────────

export function parseBdRealizado(
  workbook: XLSX.WorkBook,
  mutuos: DbMutuo[],
): BdRealizadoResult {
  const sheetName = workbook.SheetNames[0] ?? 'BD REALIZADO'
  const ws = workbook.Sheets[sheetName]!
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

  if (raw.length === 0) {
    return { rows: [], stats: { total: 0, despesas: 0, creditos: 0, mutuos: 0, skipped: 0, valorSaidas: 0, valorEntradas: 0 } }
  }

  // Auto-detect columns from first row keys
  const headers = Object.keys(raw[0]!)
  const colTipo = findColumn(headers, 'Tipo') || 'Tipo'
  const colCat = findColumn(headers, 'Categoria') || 'Categoria'
  const colDepto = findColumn(headers, 'Departamento') || 'Departamento'
  const colPago = findColumn(headers, 'Pago ou Recebido', 'Pago', 'Recebido') || 'Pago ou Recebido'
  const colValorConta = findColumn(headers, 'Valor da Conta') || 'Valor da Conta'
  const colAPagar = findColumn(headers, 'A Pagar ou Receber') || 'A Pagar ou Receber'
  const colData = findColumn(headers, 'Data de Pagto', 'Data de Crédito', 'Data Pagto') || 'Data de Pagto ou Recbto (completa)'
  const colDataEmissao = findColumn(headers, 'Data de Emissão', 'Emissão') || 'Data de Emissão (completa)'
  const colFornecedor = findColumn(headers, 'Cliente ou Fornecedor', 'Fornecedor', 'Nome Fantasia') || 'Cliente ou Fornecedor (Nome Fantasia)'
  const colConta = findColumn(headers, 'Conta Corrente') || 'Conta Corrente'
  const colItem = findColumn(headers, 'ITEM') || 'ITEM'
  const colMedicao = findColumn(headers, 'MEDIÇÃO', 'MEDICAO') || 'MEDIÇÃO'
  const colObs = findColumn(headers, 'Observação', 'Observacao') || 'Observação da Conta'
  const colOrigem = findColumn(headers, 'Origem') || 'Origem'
  const colNF = findColumn(headers, 'NF/CF', 'NF') || 'NF/CF'
  const colContaPai = findColumn(headers, 'Conta Pai') || 'Conta Pai'

  console.log('[BD Realizado] Colunas detectadas:', {
    colTipo, colCat, colDepto, colPago, colData, colFornecedor,
    totalHeaders: headers.length, sampleHeaders: headers.slice(0, 5)
  })

  const rows: BdRealizadoRow[] = []
  let despCount = 0, credCount = 0, mutCount = 0, skipCount = 0
  let valorSaidas = 0, valorEntradas = 0

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]!
    const tipo = String(r[colTipo] || '')
    const cat = String(r[colCat] || '')
    const depto = String(r[colDepto] || '')
    const pagoRecebido = parseNumber(r[colPago])

    const row: BdRealizadoRow = {
      seq: i + 1,
      dataPagamento: parseDate(r[colData]),
      dataEmissao: parseDate(r[colDataEmissao]),
      fornecedor: String(r[colFornecedor] || '').trim(),
      tipo,
      categoria: cat,
      valorConta: parseNumber(r[colValorConta]),
      pagoOuRecebido: pagoRecebido,
      aPagarOuReceber: parseNumber(r[colAPagar]),
      contaCorrente: String(r[colConta] || ''),
      departamento: depto,
      item: String(r[colItem] || '').trim(),
      medicao: String(r[colMedicao] || ''),
      observacao: String(r[colObs] || ''),
      origem: String(r[colOrigem] || ''),
      nfCf: String(r[colNF] || ''),
      contaPai: String(r[colContaPai] || ''),
      importPath: 'skip',
      importLabel: '',
      autoSkipReason: null,
    }

    // ─── CLASSIFICAÇÃO PELO SINAL DO VALOR ──────────────
    const normCat = norm(cat)
    const absValor = Math.abs(pagoRecebido)

    if (absValor < 0.01) {
      // Valor zero → pular
      row.importPath = 'skip'
      row.importLabel = '⏭️ Valor zero'
      row.autoSkipReason = 'Valor = 0'
      skipCount++
    }
    else if (pagoRecebido > 0) {
      // ═══ ENTRADA (valor positivo) ═══
      valorEntradas += pagoRecebido

      if (CATS_MUTUO_ENTRADA.has(normCat)) {
        // Verificar duplicata com mútuos existentes
        const dup = mutuos.find(m =>
          Math.abs(m.valor_captado - absValor) < 1 &&
          m.data_captacao === row.dataPagamento
        )
        if (dup) {
          row.importPath = 'skip'
          row.autoSkipReason = `Mútuo já existe: "${dup.nome}"`
          row.importLabel = '⏭️ Mútuo duplicado'
          skipCount++
        } else {
          row.importPath = 'mutuo'
          row.importLabel = '🤝 Cadastrar Mútuo'
          mutCount++
        }
      } else {
        // Qualquer outra entrada → crédito
        row.importPath = 'credito'
        row.importLabel = `💳 Crédito · ${cat || 'Entrada'}`
        credCount++
      }
    }
    else {
      // ═══ SAÍDA (valor negativo) ═══
      valorSaidas += absValor

      // Por pedido do usuário, movimentações financeiras também sobem como Custo Indireto ("despesa") para depois serem deletadas se necessário
      row.importPath = 'despesa'
      row.importLabel = `📋 Despesa · ${depto || cat || 'Geral'}`
      despCount++
    }

    rows.push(row)
  }

  console.log('[BD Realizado] Classificação:', {
    total: rows.length, despesas: despCount, creditos: credCount,
    mutuos: mutCount, skipped: skipCount,
    valorSaidas: valorSaidas.toFixed(2), valorEntradas: valorEntradas.toFixed(2),
  })

  return {
    rows,
    stats: {
      total: rows.length,
      despesas: despCount,
      creditos: credCount,
      mutuos: mutCount,
      skipped: skipCount,
      valorSaidas,
      valorEntradas,
    },
  }
}
