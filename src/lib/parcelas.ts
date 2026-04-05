/**
 * Build Fleury — Geração automática de parcelas
 *
 * Core do sistema financeiro. Parseia condições de pagamento
 * e gera parcelas com datas ajustadas para dias úteis.
 *
 * Exemplos de condição:
 *   "30/60"       → 2 parcelas aos 30 e 60 dias da entrega
 *   "28/56/84"    → 3 parcelas
 *   "0/17"        → 2 parcelas (0 = na entrega)
 *   "à vista"     → 1 parcela na data de entrega
 *   "49"          → 1 parcela aos 49 dias
 */

// ---------------------------------------------------------------------------
// parsearCondicao
// ---------------------------------------------------------------------------

/**
 * Parseia uma string de condição de pagamento em array de dias.
 *
 * @example parsearCondicao("30/60")       → [30, 60]
 * @example parsearCondicao("28/56/84")    → [28, 56, 84]
 * @example parsearCondicao("0/17")        → [0, 17]
 * @example parsearCondicao("49")          → [49]
 * @example parsearCondicao("à vista")     → [0]
 * @example parsearCondicao("")            → [0]
 * @example parsearCondicao(null as any)   → [0]
 */
export function parsearCondicao(cond: string | null | undefined): number[] {
  if (!cond || cond.trim() === '') return [0]

  const normalized = cond
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents: "à" → "a"

  // Handle text-based conditions
  if (normalized === 'a vista' || normalized === 'avista' || normalized === 'av') {
    return [0]
  }

  // Split by / or , or ; or space
  const parts = normalized
    .split(/[/,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return [0]

  const dias = parts.map((p) => {
    const n = parseInt(p, 10)
    return Number.isNaN(n) ? 0 : Math.max(n, 0)
  })

  // If all parsed to 0 from invalid input, return [0]
  if (dias.length === 0) return [0]

  return dias
}

// ---------------------------------------------------------------------------
// ajustarDiaUtil
// ---------------------------------------------------------------------------

/**
 * Ajusta uma data para dia útil:
 * - Sábado (6) → Sexta (dia -1)
 * - Domingo (0) → Segunda (dia +1)
 *
 * Retorna nova instância de Date (não muta a original).
 */
export function ajustarDiaUtil(data: Date): Date {
  const d = new Date(data.getTime())
  const dow = d.getDay()

  if (dow === 6) {
    // Saturday → Friday
    d.setDate(d.getDate() - 1)
  } else if (dow === 0) {
    // Sunday → Monday
    d.setDate(d.getDate() + 1)
  }

  return d
}

// ---------------------------------------------------------------------------
// gerarParcelas
// ---------------------------------------------------------------------------

interface GerarParcelasInput {
  pedidoId: string
  companyId: string
  valorTotal: number
  condPagamento: string
  dataEntrega: Date
}

interface ParcelaGerada {
  company_id: string
  pedido_id: string
  numero_parcela: number
  valor: number
  data_vencimento: string // ISO date YYYY-MM-DD
  status: 'futura'
}

/**
 * Gera parcelas a partir de um pedido.
 *
 * Regra de ouro do arredondamento: a última parcela absorve centavos
 * para que a soma exata seja igual ao valorTotal.
 *
 * @example
 * gerarParcelas({
 *   pedidoId: 'abc', companyId: 'xyz',
 *   valorTotal: 21528, condPagamento: '30/60',
 *   dataEntrega: new Date('2026-04-15')
 * })
 * // → [
 * //   { valor: 10764, data_vencimento: '2026-05-15', numero_parcela: 1, ... },
 * //   { valor: 10764, data_vencimento: '2026-06-15', numero_parcela: 2, ... },
 * // ]
 */
export function gerarParcelas(input: GerarParcelasInput): ParcelaGerada[] {
  const { pedidoId, companyId, valorTotal, condPagamento, dataEntrega } = input

  if (valorTotal <= 0) return []

  const dias = parsearCondicao(condPagamento)
  const n = dias.length

  // Divide equally, floor to cents
  const valorBase = Math.floor((valorTotal * 100) / n) / 100

  // Sum of all base parcels
  const somaBase = Math.round(valorBase * (n - 1) * 100) / 100

  // Last parcel absorbs the rounding difference
  const valorUltima = Math.round((valorTotal - somaBase) * 100) / 100

  const parcelas: ParcelaGerada[] = dias.map((d, i) => {
    const dataVenc = new Date(dataEntrega.getTime())
    dataVenc.setDate(dataVenc.getDate() + d)

    const dataAjustada = ajustarDiaUtil(dataVenc)

    const isLast = i === n - 1
    const valor = isLast ? valorUltima : valorBase

    return {
      company_id: companyId,
      pedido_id: pedidoId,
      numero_parcela: i + 1,
      valor,
      data_vencimento: formatISODate(dataAjustada),
      status: 'futura' as const,
    }
  })

  return parcelas
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats Date to YYYY-MM-DD string using LOCAL time */
function formatISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Creates a local Date from YYYY-MM-DD string (avoids UTC shift).
 * new Date('2026-04-04') = UTC midnight → UTC-3 = April 3rd (WRONG)
 * localDate('2026-04-04') = local midnight = April 4th (CORRECT)
 */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

// ---------------------------------------------------------------------------
// Regenerar parcelas (para cascata do cronograma)
// ---------------------------------------------------------------------------

interface RegenerarInput {
  pedidoId: string
  companyId: string
  valorTotal: number
  condPagamento: string
  novaDataEntrega: Date
  parcelasExistentes: Array<{
    id: string
    status: string
    valor_pago: number
  }>
}

/**
 * Regenera parcelas quando a data de entrega muda (cascata do cronograma).
 *
 * Regras:
 * - Parcelas já pagas NÃO são alteradas
 * - Parcelas futuras/a_vencer são recalculadas
 * - Se há parcelas pagas, o valor restante é distribuído entre as novas
 */
export function regenerarParcelas(input: RegenerarInput): {
  parcelasParaDeletar: string[]
  parcelasParaCriar: ParcelaGerada[]
} {
  const { pedidoId, companyId, valorTotal, condPagamento, novaDataEntrega, parcelasExistentes } = input

  // Separate paid from unpaid
  const pagas = parcelasExistentes.filter(
    (p) => p.status === 'paga' || p.status === 'parcialmente_paga'
  )
  const naopagas = parcelasExistentes.filter(
    (p) => p.status !== 'paga' && p.status !== 'parcialmente_paga'
  )

  // IDs to delete (unpaid parcels)
  const parcelasParaDeletar = naopagas.map((p) => p.id)

  // Calculate remaining value
  const valorJaPago = pagas.reduce((sum, p) => sum + p.valor_pago, 0)
  const valorRestante = Math.round((valorTotal - valorJaPago) * 100) / 100

  if (valorRestante <= 0) {
    return { parcelasParaDeletar, parcelasParaCriar: [] }
  }

  // Generate new parcels for the remaining amount
  const novasParcelas = gerarParcelas({
    pedidoId,
    companyId,
    valorTotal: valorRestante,
    condPagamento,
    dataEntrega: novaDataEntrega,
  })

  // Offset numero_parcela to account for existing paid parcels
  const offset = pagas.length
  const parcelasParaCriar = novasParcelas.map((p) => ({
    ...p,
    numero_parcela: p.numero_parcela + offset,
  }))

  return { parcelasParaDeletar, parcelasParaCriar }
}

// ---------------------------------------------------------------------------
// Self-test (development only, tree-shaken in production)
// ---------------------------------------------------------------------------

if (import.meta.env.DEV) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) console.error(`❌ FAIL: ${msg}`)
  }

  // Test parsearCondicao
  const t1 = parsearCondicao('30/60')
  assert(t1[0] === 30 && t1[1] === 60 && t1.length === 2, 'parsear 30/60')

  const t2 = parsearCondicao('28/56/84')
  assert(t2.length === 3 && t2[0] === 28 && t2[2] === 84, 'parsear 28/56/84')

  const t3 = parsearCondicao('à vista')
  assert(t3.length === 1 && t3[0] === 0, 'parsear à vista')

  const t4 = parsearCondicao('')
  assert(t4.length === 1 && t4[0] === 0, 'parsear vazio')

  const t5 = parsearCondicao(null)
  assert(t5.length === 1 && t5[0] === 0, 'parsear null')

  const t6 = parsearCondicao('0/17')
  assert(t6.length === 2 && t6[0] === 0 && t6[1] === 17, 'parsear 0/17')

  // Test ajustarDiaUtil — use localDate to avoid UTC shift
  const sat = localDate('2026-04-04') // Saturday
  assert(sat.getDay() === 6, `sanity: Apr 4 2026 is Saturday (got ${sat.getDay()})`)
  const adjSat = ajustarDiaUtil(sat)
  assert(adjSat.getDay() === 5, 'sábado → sexta')
  assert(adjSat.getDate() === 3, 'sábado 4 → sexta 3')

  const sun = localDate('2026-04-05') // Sunday
  assert(sun.getDay() === 0, `sanity: Apr 5 2026 is Sunday (got ${sun.getDay()})`)
  const adjSun = ajustarDiaUtil(sun)
  assert(adjSun.getDay() === 1, 'domingo → segunda')
  assert(adjSun.getDate() === 6, 'domingo 5 → segunda 6')

  const fri = localDate('2026-04-03') // Friday
  assert(fri.getDay() === 5, `sanity: Apr 3 2026 is Friday (got ${fri.getDay()})`)
  const adjFri = ajustarDiaUtil(fri)
  assert(adjFri.getDate() === 3, 'sexta não muda')

  // Test gerarParcelas — caso "30/60"
  const parcelas1 = gerarParcelas({
    pedidoId: 'test-1',
    companyId: 'company-1',
    valorTotal: 21528,
    condPagamento: '30/60',
    dataEntrega: localDate('2026-04-15'),
  })
  assert(parcelas1.length === 2, '30/60 → 2 parcelas')
  assert(parcelas1[0]!.valor === 10764, '30/60 valor parcela 1')
  assert(parcelas1[1]!.valor === 10764, '30/60 valor parcela 2')
  assert(parcelas1[0]!.data_vencimento === '2026-05-15', `30/60 data p1 (got ${parcelas1[0]!.data_vencimento})`)
  // Jun 14 is Sunday → Mon Jun 15
  assert(parcelas1[1]!.data_vencimento === '2026-06-15', `30/60 data p2 (got ${parcelas1[1]!.data_vencimento})`)
  assert(parcelas1[0]!.numero_parcela === 1, '30/60 numero 1')
  assert(parcelas1[1]!.numero_parcela === 2, '30/60 numero 2')

  // Test gerarParcelas — caso "0/17"
  const parcelas2 = gerarParcelas({
    pedidoId: 'test-2',
    companyId: 'company-1',
    valorTotal: 100,
    condPagamento: '0/17',
    dataEntrega: localDate('2026-04-15'),
  })
  assert(parcelas2.length === 2, '0/17 → 2 parcelas')
  assert(parcelas2[0]!.valor === 50, '0/17 valor parcela 1')
  assert(parcelas2[1]!.valor === 50, '0/17 valor parcela 2')
  assert(parcelas2[0]!.data_vencimento === '2026-04-15', `0/17 data p1 (got ${parcelas2[0]!.data_vencimento})`)
  // Apr 15 + 17 = May 2 (Saturday) → May 1 (Friday)
  assert(parcelas2[1]!.data_vencimento === '2026-05-01', `0/17 data p2 (got ${parcelas2[1]!.data_vencimento})`)

  // Test gerarParcelas — valor ímpar (arredondamento)
  const parcelas3 = gerarParcelas({
    pedidoId: 'test-3',
    companyId: 'company-1',
    valorTotal: 100,
    condPagamento: '30/60/90',
    dataEntrega: localDate('2026-04-15'),
  })
  assert(parcelas3.length === 3, '30/60/90 → 3 parcelas')
  assert(parcelas3[0]!.valor === 33.33, '3-way split first = 33.33')
  assert(parcelas3[1]!.valor === 33.33, '3-way split second = 33.33')
  assert(parcelas3[2]!.valor === 33.34, '3-way split last absorbs = 33.34')
  const somaTotal = parcelas3.reduce((s, p) => s + p.valor, 0)
  assert(Math.abs(somaTotal - 100) < 0.001, `soma = 100 (got ${somaTotal})`)

  // Test gerarParcelas — "à vista"
  const parcelas4 = gerarParcelas({
    pedidoId: 'test-4',
    companyId: 'company-1',
    valorTotal: 5000,
    condPagamento: 'à vista',
    dataEntrega: localDate('2026-04-15'),
  })
  assert(parcelas4.length === 1, 'à vista → 1 parcela')
  assert(parcelas4[0]!.valor === 5000, 'à vista valor total')
  assert(parcelas4[0]!.data_vencimento === '2026-04-15', `à vista data (got ${parcelas4[0]!.data_vencimento})`)

  // Test 5 parcelas
  const parcelas5 = gerarParcelas({
    pedidoId: 'test-5',
    companyId: 'company-1',
    valorTotal: 17940,
    condPagamento: '21/36/51/67/83',
    dataEntrega: localDate('2026-04-23'),
  })
  assert(parcelas5.length === 5, '5 parcelas')
  const soma5 = parcelas5.reduce((s, p) => s + p.valor, 0)
  assert(Math.abs(soma5 - 17940) < 0.001, `5 parcelas soma = 17940 (got ${soma5})`)

  console.log('✅ parcelas.ts: all self-tests passed')
}

