# 03 — Snippets críticos de código (Build Fleury)

> Trechos do código-fonte que o assistente deve poder consultar sem precisar do repositório aberto. Cada bloco indica `arquivo:linha` para citação. Estado pós-correções P0/P1/P2 (commit-base `b0652db` + correções aplicadas em sessão).

---

## A. Parser de condição de pagamento — `src/lib/parcelas.ts`

```ts
// src/lib/parcelas.ts:30-61
export function parsearCondicao(cond: string | null | undefined): number[] {
  if (!cond || cond.trim() === '') return [0]

  const normalized = cond
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents: "à" → "a"

  if (normalized === 'a vista' || normalized === 'avista' || normalized === 'av') {
    return [0]
  }

  const parts = normalized
    .split(/[/,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return [0]

  const dias = parts.map((p) => {
    const n = parseInt(p, 10)
    return Number.isNaN(n) ? 0 : Math.max(n, 0)
  })

  if (dias.length === 0) return [0]
  return dias
}
```

```ts
// src/lib/parcelas.ts:127-164  — gerarParcelas (regra do centavo)
export function gerarParcelas(input: GerarParcelasInput): ParcelaGerada[] {
  const { pedidoId, companyId, valorTotal, condPagamento, dataEntrega } = input
  if (valorTotal <= 0) return []

  const dias = parsearCondicao(condPagamento)
  const n = dias.length

  const valorBase = Math.floor((valorTotal * 100) / n) / 100
  const somaBase = Math.round(valorBase * (n - 1) * 100) / 100
  const valorUltima = Math.round((valorTotal - somaBase) * 100) / 100

  const parcelas = dias.map((d, i) => {
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
```

```ts
// src/lib/parcelas.ts:74-87  — ajustarDiaUtil
export function ajustarDiaUtil(data: Date): Date {
  const d = new Date(data.getTime())
  const dow = d.getDay()
  if (dow === 6) {        // Saturday → Friday
    d.setDate(d.getDate() - 1)
  } else if (dow === 0) { // Sunday → Monday
    d.setDate(d.getDate() + 1)
  }
  return d
}
```

---

## B. Conversão de data Excel/BR/ISO — `src/lib/wbsImport.ts`

```ts
// src/lib/wbsImport.ts:62-92  — toDateISO (exportada)
export function toDateISO(value: unknown): string | null {
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
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(epoch.getTime() + num * 86400000)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return str // fallback: return as-is
}
```

---

## C. Match fuzzy de coluna — `src/lib/wbsImport.ts`

```ts
// src/lib/wbsImport.ts:99-127  — findCol (exportada)
function stripForMatch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s\/_.-]/g, '').toLowerCase()
}

export function findCol(row: Record<string, unknown>, possibilities: string[]) {
  const keys = Object.keys(row)
  const cleanKeys = keys.map(k => stripForMatch(k))
  const cleanPoss = possibilities.map(p => stripForMatch(p))

  // Pass 1: Exact, Pass 2: Starts with, Pass 3: Includes
  for (let i = 0; i < cleanPoss.length; i++)
    for (let j = 0; j < cleanKeys.length; j++)
      if (cleanKeys[j] === cleanPoss[i]) return row[keys[j]!]

  for (let i = 0; i < cleanPoss.length; i++)
    for (let j = 0; j < cleanKeys.length; j++)
      if (cleanKeys[j]!.startsWith(cleanPoss[i]!)) return row[keys[j]!]

  for (let i = 0; i < cleanPoss.length; i++)
    for (let j = 0; j < cleanKeys.length; j++)
      if (cleanKeys[j]!.includes(cleanPoss[i]!)) return row[keys[j]!]

  return undefined
}
```

---

## D. Sanitizadores — `src/lib/wbsImport.ts`

```ts
// src/lib/wbsImport.ts:149-155  — sanitizeTipo
export function sanitizeTipo(val: any): string {
  if (!val) return 'MATERIAL'
  const s = String(val).toUpperCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").trim()
    .replace(/\s+/g, '_').replace(/-/g, '_')
  if (s.includes('MAO_DE_OBRA') || s.includes('SERVICO') || s.includes('M_O')) return 'MAO_DE_OBRA'
  if (s.includes('EQUIPA') || s.includes('MAQUINA')) return 'EQUIPAMENTO'
  return 'MATERIAL'
}
```

```ts
// src/lib/wbsImport.ts:367-374  — sanitizeStatus
export function sanitizeStatus(val: any): string {
  if (!val) return 'futuro'
  const s = String(val).toLowerCase().trim()
  if (['concluido', 'concluída', 'concluído', 'finalizado'].includes(s)) return 'concluido'
  if (['em andamento', 'em_andamento', 'ativo', 'ativa', 'iniciado', 'iniciada', 'executando'].includes(s)) return 'em_andamento'
  if (['atrasado', 'atrasada'].includes(s)) return 'atrasado'
  return 'futuro'
}
```

---

## E. Parser de número (BR/US) — duas versões

### E.1 `wbsImport.ts:126-146`

```ts
function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value

  let str = String(value).replace(/R\$\s?/g, '').trim()
    .replace(/\s/g, '').replace(/ /g, '')
  if (!str || str === '-') return 0

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
```

### E.2 `ImportacaoPage.tsx:40-66` — versão endurecida (P2.7)

```ts
function parseNumberCell(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const original = String(v).trim()
  if (!original) return 0
  let s = original.replace(/[R$\s ]/gi, '')
  if (s === '-' || s === '' || s === 'N/D' || /^[a-zA-Z]/.test(s)) {
    console.warn(`[parseNumberCell] valor não-numérico ignorado: "${original}"`)
    return 0
  }
  // ... BR/US auto-detect ...
}
```

### E.3 `bdRealizadoImport.ts:106-128` — suporta parênteses contábeis

```ts
function parseNumber(v: any): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  let s = String(v).trim()
  if (!s) return 0
  const isNegative = /^\(.+\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[R$\s ()]/gi, '').replace(/^-/, '')
  // ... BR/US auto-detect ...
  return isNegative ? -Math.abs(n) : n
}
```

---

## F. Detecção de aba e header no BD Realizado — `src/lib/bdRealizadoImport.ts`

```ts
// src/lib/bdRealizadoImport.ts:163-194
function extractRows(workbook: XLSX.WorkBook): Record<string, any>[] {
  const preferred = workbook.SheetNames.find(n => {
    const ln = n.toLowerCase()
    return ln.includes('bd_realiz') || ln.includes('bd realiz') || ln.includes('realizado')
  })
  const sheetName = preferred ?? workbook.SheetNames[0] ?? 'BD REALIZADO'
  const ws = workbook.Sheets[sheetName]!
  const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })
  if (arr.length === 0) return []

  const KEYWORDS = ['data', 'fornecedor', 'valor', 'categoria', 'tipo', 'conta', 'pagto', 'emissao', 'emissão']
  let headerIdx = 0
  for (let i = 0; i < Math.min(arr.length, 20); i++) {
    const cells = (arr[i] ?? []).map(c => (c == null ? '' : String(c).trim())).filter(Boolean)
    if (cells.length < 3) continue
    const lowered = cells.join(' ').toLowerCase()
    const hits = KEYWORDS.filter(k => lowered.includes(k)).length
    if (hits >= 3) { headerIdx = i; break }
  }
  // ... constrói rows com headers reais ...
}
```

---

## G. Classificação por SINAL no BD Realizado — `src/lib/bdRealizadoImport.ts`

```ts
// src/lib/bdRealizadoImport.ts:264-321 (pós-P2.8)
const normCat = norm(cat)
const absValor = Math.abs(pagoRecebido)

if (absValor < 0.01) {
  row.importPath = 'skip'
  row.importLabel = '⏭️ Valor zero'
  row.autoSkipReason = 'Valor = 0'
  skipCount++
}
else if (pagoRecebido > 0) {
  // ENTRADA
  valorEntradas += pagoRecebido
  if (CATS_MUTUO_ENTRADA.has(normCat)) {
    const dup = mutuos.find(m =>
      Math.abs(m.valor_captado - absValor) < 1 && m.data_captacao === row.dataPagamento
    )
    if (dup) { row.importPath = 'skip'; row.autoSkipReason = `Mútuo já existe: "${dup.nome}"` }
    else { row.importPath = 'mutuo'; row.importLabel = '🤝 Cadastrar Mútuo' }
  } else {
    row.importPath = 'credito'
    row.importLabel = `💳 Crédito · ${cat || 'Entrada'}`
  }
}
else {
  // SAÍDA
  valorSaidas += absValor
  if (!CLASSIFICAR_FINANCEIRO_COMO_DESPESA && CATS_FINANCEIRO_SAIDA.has(normCat)) {
    row.importPath = 'skip'
    row.importLabel = `🏦 Mov. financeira · ${cat}`
    row.autoSkipReason = `Categoria "${cat}" é movimentação financeira (não vira despesa)`
  } else {
    row.importPath = 'despesa'
    row.importLabel = `📋 Despesa · ${depto || cat || 'Geral'}`
  }
}
```

```ts
// src/lib/bdRealizadoImport.ts:130-152
const CATS_MUTUO_ENTRADA = new Set([
  'EMPRESTIMOS BANCARIOS',
  'ENTRADA DE TRANSFERENCIA',
])

const CATS_FINANCEIRO_SAIDA = new Set([
  'PAGAMENTO DE EMPRESTIMOS',
  'EMPRESTIMOS BANCARIOS',
  'DISTRIBUICAO DE LUCROS',
  'SAIDA DE TRANSFERENCIA',
])

const CLASSIFICAR_FINANCEIRO_COMO_DESPESA = false
```

---

## H. Match de parcela existente (BD Realizado → despesa) — `src/pages/ImportacaoPage.tsx`

```ts
// src/pages/ImportacaoPage.tsx:2181-2221
function findMatchParcela(forn: string, valor: number, dataPgto: string) {
  const tolExato = Math.max(valor * 0.01, 0.5)   // 1% ou R$ 0,50
  const dataPgtoDt = new Date(dataPgto + 'T12:00:00').getTime()
  const matches = []

  for (const p of parcelasPool) {
    const saldo = p.valor - p.valor_pago
    if (saldo <= 0.005) continue

    const diffDias = Math.abs((new Date(p.data_vencimento + 'T12:00:00').getTime() - dataPgtoDt) / 86400000)
    if (diffDias > 120) continue                  // janela ±120 dias

    const fornOK = fornCompatvel(forn, p.fornNome)
    const exato = Math.abs(p.valor - valor) <= tolExato
    const parcial = saldo + 0.01 >= valor

    if (!exato && !parcial) continue

    let score = exato ? 0 : 500
    if (!fornOK) score += 2000
    score += Math.abs(saldo - valor) / Math.max(valor, 1) * 50
    score += diffDias * 2

    matches.push({ cand: p, exato, score })
  }

  if (matches.length === 0) return null
  matches.sort((a, b) => a.score - b.score)
  const best = matches[0]!
  const fornBestOK = fornCompatvel(forn, best.cand.fornNome)
  if (!fornBestOK && !best.exato) return null
  return { cand: best.cand, exato: best.exato }
}
```

---

## I. Geração de eventos de fluxo de caixa — `src/hooks/useCashFlowEvents.ts`

```ts
// src/hooks/useCashFlowEvents.ts:79-114
export function useCashFlowEvents(viewMode: FinancialViewMode = 'pedidos'): CashFlowResult {
  const { currentCompany } = useProject()
  const { data: parcelas = [] } = useParcelas()
  const { data: medicoes = [] } = useMedicoes()
  const { data: itens = [] } = useItensCompra()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()
  const { data: mutuos = [] } = useMutuos()
  const { data: distribuicoes = [] } = useDistribuicao()
  const { data: movs = [] } = useMovimentacoes()
  const { data: contasBancarias = [] } = useContasBancarias()
  // ... links de conciliação para deduplicar mov vs parcela ...

  const saldoInicial = useMemo(() => {
    const ativas = (contasBancarias as any[]).filter(c => c.ativa)
    if (ativas.length === 0) return currentCompany?.saldo_inicial_caixa ?? 0
    return ativas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)
  }, [contasBancarias, currentCompany?.saldo_inicial_caixa])

  const prazoRecebimento = currentCompany?.prazo_recebimento_dias ?? 30
  // ... constrói events[] a partir de parcelas, medições, mútuos, movs ...
}
```

**Status do evento** (campo `type`):
- `bruto` — pedido/parcela ainda em status `planejado`/`futura`
- `firme` — parcela `a_vencer`/`vencida` (já houve pedido confirmado)
- `entrada` — receita CEF prevista ou mútuo

---

## J. Cabeçalhos canônicos exportados pelos templates — `src/pages/ImportacaoPage.tsx`

```ts
// src/pages/ImportacaoPage.tsx (pós-correções)
const PEDIDOS_HEADERS = ['item_codigo', 'numero_pedido', 'casas_lote',
  'fornecedor_nome', 'cond_pagamento', 'data_entrega_prevista',
  'valor_unitario_real'] as const

const INDIRETOS_HEADERS = ['descricao', 'categoria', 'fornecedor_nome',
  'cond_pagamento', 'data_inicio', 'valor_orcado']

const DIST_HEADERS = ['etapa_codigo', 'medicao_numero', 'data', 'casas'] as const
```

```ts
// src/pages/ImportacaoPage.tsx:261-277  — TABLE_MAPPINGS (Dados Base)
const TABLE_MAPPINGS = {
  etapas: {
    label: 'Etapas do Cronograma',
    required: ['codigo', 'nome'],
    optional: ['ordem', 'data_inicio_plan', 'data_fim_plan', 'casas_total',
      'valor_total_orcado', 'status', 'observacoes',
      'receita_cef', 'preco_unitario_serv', 'qtd_casa_serv', 'unidade_serv'],
  },
  itens_compra: {
    label: 'Itens de Compra',
    required: ['codigo', 'descricao', 'tipo', 'etapa_codigo'],
    optional: ['categoria', 'unidade', 'qtd_por_casa', 'qtd_total',
      'custo_unitario_orcado', 'valor_total_orcado',
      'fornecedor_nome', 'cond_pagamento'],
  },
  fornecedores: {
    label: 'Fornecedores',
    required: ['nome'],
    optional: ['cnpj', 'contato', 'cond_pagamento_padrao', 'observacoes'],
  },
}
```

```ts
// src/pages/ImportacaoPage.tsx — gera template do WBS multi-aba
const etapaHeaders = [
  'Código', 'Nome', 'Status', 'Casas', 'Ordem',
  'Receita CEF', 'Preço Unitário (Serv)', 'Qtd/Casa (Serv)', 'Unidade (Serv)',
  'Data Início Plan', 'Data Fim Plan', 'Observações',
]

const itemHeaders = [
  'Etapa Cód', 'Etapa Nome', 'Item Cód', 'Descrição', 'Tipo',
  'Qtd/Casa', 'Unidade', 'Custo Unitário',
  'Fornecedor', 'Cond. Pagamento',
]

const distHeaders = [
  'Etapa Cód', 'Etapa Nome', 'Medição', 'Casas Planejadas',
  'Data Início', 'Data Fim', 'Receita a Liberar',
]
```

---

## K. Erros Postgres traduzidos — `formatDbError` / `formatError`

```ts
// src/lib/wbsImport.ts:349-361 e src/pages/ImportacaoPage.tsx:185-194
// (mesma tabela em dois lugares — manter sincronizado)
'23505' → 'Duplicado: "{val}" já existe no campo {col}' / 'Registro duplicado'
'23503' → 'Referência inválida: ...'
'23502' → 'Campo obrigatório vazio: ...'
'23514' → 'Violação de restrição: ...'
'22P02' → 'Tipo inválido: ...'
'22001' → 'Texto excede o tamanho máximo do campo'
```

---

## L. Constantes globais

```ts
// src/lib/wbsImport.ts
export const DEFAULT_CASAS = 64   // suposição do projeto Fleury (P4 centralizado)

// src/contexts/ProjectContext.tsx
interface Company {
  saldo_inicial_caixa: number      // fallback do saldo inicial do fluxo
  prazo_recebimento_dias: number   // default 30 — desloca data de cada medição
}
```

---

## M. Status válidos por tabela (de migrations)

```sql
-- supabase/migrations/20260425130000_consolidate_pedido_status.sql
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('planejado','pedido_enviado','entregue','parcialmente_pago','pago','cancelado'));

-- supabase/migrations/20260425100000_add_tipo_to_parcelas.sql
ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'contratual';
ALTER TABLE parcelas ADD CONSTRAINT parcelas_tipo_check CHECK (tipo IN ('contratual', 'adiantamento'));
```

**`parcelas.status`**: usado no código como `'futura' | 'paga' | 'parcialmente_paga'`.
CHECK não foi encontrada nas migrations versionadas.
