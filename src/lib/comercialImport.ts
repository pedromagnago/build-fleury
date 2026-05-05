/**
 * Pacote Comercial — Import com identidade preservada (UUID).
 *
 * Estratégia:
 *  - Linha com *_id preenchido → UPDATE (com diff vs banco)
 *  - Linha sem *_id → INSERT
 *  - Registro do banco SUMIDO da planilha → "missing" (pergunta linha-a-linha
 *    no preview: ignorar / soft-delete)
 *  - Σ parcelas vs valor_total_real do pedido: warning > R$ 0,01 (não bloqueia)
 *  - cond_pagamento mudou e parcelas NÃO foram editadas → flag "regenerar?"
 */
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { toDateISO, findCol } from '@/lib/wbsImport'

// CHECK constraint do banco: pedidos.status IN ('planejado','pedido_enviado','entregue','parcialmente_pago','pago','cancelado')
// (ver supabase/migrations/20260425130000_consolidate_pedido_status.sql)
// NÃO usar sanitizeStatus do wbsImport — aquele é para etapas (futuro|em_andamento|concluido|atrasado).
const PEDIDO_STATUS_VALIDOS = new Set([
  'planejado', 'pedido_enviado', 'entregue', 'parcialmente_pago', 'pago', 'cancelado',
])
function sanitizePedidoStatus(val: unknown): string {
  if (!val) return 'planejado'
  const s = String(val).toLowerCase().trim().replace(/\s+/g, '_').replace(/-/g, '_')
  if (PEDIDO_STATUS_VALIDOS.has(s)) return s
  // sinônimos comuns
  if (s === 'pedido' || s === 'enviado' || s === 'pedido_enviado') return 'pedido_enviado'
  if (s === 'parcial' || s === 'parcialmente_pago' || s === 'parcialmente') return 'parcialmente_pago'
  if (s === 'cancelado' || s === 'cancelada') return 'cancelado'
  return 'planejado'
}

// ─── Types ──────────────────────────────────────────────────

export type RowAction = 'create' | 'update' | 'unchanged' | 'missing'
export type MissingResolution = 'ignore' | 'soft_delete'

export interface FieldChange {
  campo: string
  antigo: string
  novo: string
}

export interface PedidoChange {
  action: RowAction
  pedido_id: string | null            // null em CREATE
  numero_pedido: number | null
  etapa_codigo: string
  item_codigo: string
  fornecedor_nome: string
  campos: FieldChange[]                // campos que mudaram (UPDATE)
  rowData: Record<string, unknown>    // linha bruta (CREATE/UPDATE)
  // Validação cruzada:
  parcelas_soma: number
  valor_total: number
  diff_centavos: number
  warning_soma?: string                // texto amarelo se diff > 0.01
  cond_changed_but_parcelas_same?: boolean // flag p/ "regenerar parcelas?"
  resolution?: MissingResolution       // só faz sentido se action='missing'
}

export interface ParcelaChange {
  action: RowAction
  parcela_id: string | null
  pedido_id: string | null
  despesa_indireta_id: string | null
  numero_parcela: number
  valor: number
  data_vencimento: string
  campos: FieldChange[]
  rowData: Record<string, unknown>
  resolution?: MissingResolution
  warning?: string
}

export interface DespesaChange {
  action: RowAction
  despesa_id: string | null
  descricao: string
  campos: FieldChange[]
  rowData: Record<string, unknown>
  resolution?: MissingResolution
}

export interface FornecedorChange {
  action: RowAction
  fornecedor_id: string | null
  nome: string
  campos: FieldChange[]
  rowData: Record<string, unknown>
  resolution?: MissingResolution
}

export interface ComercialPreview {
  pedidos: PedidoChange[]
  parcelas: ParcelaChange[]
  despesas: DespesaChange[]
  fornecedores: FornecedorChange[]
  resumo: {
    pedidos_create: number; pedidos_update: number; pedidos_missing: number
    parcelas_create: number; parcelas_update: number; parcelas_missing: number
    despesas_create: number; despesas_update: number; despesas_missing: number
    forn_create: number; forn_update: number; forn_missing: number
    warnings: number
  }
}

export interface ApplyResult {
  pedidos: { created: number; updated: number; deleted: number }
  parcelas: { created: number; updated: number; deleted: number; regenerated: number }
  despesas: { created: number; updated: number; deleted: number }
  fornecedores: { created: number; updated: number; deleted: number }
  errors: string[]
}

// ─── Parse ──────────────────────────────────────────────────

export function parseComercialImport(buffer: ArrayBuffer): {
  pedidoRows: Record<string, unknown>[]
  parcelaRows: Record<string, unknown>[]
  despesaRows: Record<string, unknown>[]
  fornecedorRows: Record<string, unknown>[]
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const read = (name: string): Record<string, unknown>[] => {
    const sheet = wb.Sheets[name]
    return sheet ? (XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]) : []
  }
  return {
    pedidoRows: read('Pedidos'),
    parcelaRows: read('Parcelas'),
    despesaRows: read('Custos Indiretos'),
    fornecedorRows: read('Fornecedores'),
  }
}

// ─── Helpers ────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[R$\s ]/gi, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let cleaned = s
  if (lastComma >= 0 && lastDot >= 0) {
    cleaned = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    cleaned = s.replace(',', '.')
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function normFornNome(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function diffField(label: string, oldVal: unknown, newVal: unknown, isNumeric = false): FieldChange | null {
  if (isNumeric) {
    const o = Number(oldVal ?? 0) || 0
    const n = Number(newVal ?? 0) || 0
    if (Math.abs(o - n) < 0.005) return null
    return { campo: label, antigo: String(o), novo: String(n) }
  }
  const o = oldVal === null || oldVal === undefined ? '' : String(oldVal)
  const n = newVal === null || newVal === undefined ? '' : String(newVal)
  if (o === n) return null
  return { campo: label, antigo: o, novo: n }
}

// ─── Build Preview ──────────────────────────────────────────

export async function buildComercialPreview(
  rows: ReturnType<typeof parseComercialImport>,
  companyId: string,
): Promise<ComercialPreview> {
  // Carrega estado atual
  const [pedRes, parcRes, despRes, fornRes, etapaRes, itemRes] = await Promise.all([
    supabase.from('pedidos').select('*').eq('company_id', companyId),
    supabase.from('parcelas').select('*').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('despesas_indiretas').select('*').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('fornecedores').select('*').eq('company_id', companyId),
    supabase.from('etapas').select('id, codigo').eq('company_id', companyId),
    supabase.from('itens_compra').select('id, codigo, etapa_id').eq('company_id', companyId).is('deleted_at', null),
  ])

  const dbPedidos = (pedRes.data ?? []) as any[]
  const dbParcelas = (parcRes.data ?? []) as any[]
  const dbDespesas = (despRes.data ?? []) as any[]
  const dbForn = (fornRes.data ?? []) as any[]
  const dbEtapas = (etapaRes.data ?? []) as any[]
  const dbItens = (itemRes.data ?? []) as any[]

  const dbPedidosById = new Map(dbPedidos.map(p => [p.id, p]))
  const dbParcelasById = new Map(dbParcelas.map(p => [p.id, p]))
  const dbDespById = new Map(dbDespesas.map(d => [d.id, d]))
  const dbFornById = new Map(dbForn.map(f => [f.id, f]))
  const dbFornByNome = new Map(dbForn.map(f => [normFornNome(f.nome).toUpperCase(), f]))
  // etapaByCod não é usado no preview (apenas no apply); mantido implícito via item.etapa_id
  void dbEtapas
  const itemByCod = new Map(dbItens.map(i => [i.codigo, i]))

  // ── Pedidos ──
  const pedidoChanges: PedidoChange[] = []
  const sheetPedidoIds = new Set<string>()

  for (const row of rows.pedidoRows) {
    const idRaw = toStr(findCol(row, ['pedido_id']))
    const id = isUUID(idRaw) ? idRaw : null
    const etapaCod = toStr(findCol(row, ['etapa_codigo']))
    const itemCod = toStr(findCol(row, ['item_codigo']))
    const fornNome = normFornNome(toStr(findCol(row, ['fornecedor_nome'])))
    const numeroPed = findCol(row, ['numero_pedido'])
    const valorTotal = toNum(findCol(row, ['valor_total_real']))
    const condPag = toStr(findCol(row, ['cond_pagamento']))

    if (id) sheetPedidoIds.add(id)

    if (!id) {
      // CREATE
      pedidoChanges.push({
        action: 'create',
        pedido_id: null,
        numero_pedido: numeroPed ? Number(numeroPed) : null,
        etapa_codigo: etapaCod,
        item_codigo: itemCod,
        fornecedor_nome: fornNome,
        campos: [],
        rowData: row,
        parcelas_soma: 0,
        valor_total: valorTotal,
        diff_centavos: 0,
      })
      continue
    }

    const existing = dbPedidosById.get(id)
    if (!existing) {
      // ID na planilha mas não no banco. ANTES: criava com ID inventado (gerava fantasmas
      // quando o usuário baixava o pacote da Original e tentava subir na Cópia).
      // AGORA: sinaliza erro e NÃO cria — força usuário a confirmar a operação.
      pedidoChanges.push({
        action: 'create',
        pedido_id: null, // descarta o ID — se confirmar create, gera novo
        numero_pedido: numeroPed ? Number(numeroPed) : null,
        etapa_codigo: etapaCod,
        item_codigo: itemCod,
        fornecedor_nome: fornNome,
        campos: [],
        rowData: row,
        parcelas_soma: 0,
        valor_total: valorTotal,
        diff_centavos: 0,
        warning_soma: `⚠ pedido_id "${id.slice(0, 8)}…" da planilha não existe no banco. Provável que a planilha foi baixada de OUTRO projeto. Se confirmar, criará um pedido novo (ID será gerado pelo banco).`,
      })
      continue
    }

    // UPDATE — diff campo a campo
    const item = itemCod ? itemByCod.get(itemCod) : undefined
    const forn = fornNome ? dbFornByNome.get(fornNome.toUpperCase()) : undefined

    const checks: (FieldChange | null)[] = [
      diffField('numero_pedido', existing.numero_pedido, numeroPed ? Number(numeroPed) : null, true),
      diffField('item_compra_id', existing.item_compra_id, item?.id ?? existing.item_compra_id),
      diffField('fornecedor_id', existing.fornecedor_id, forn?.id ?? existing.fornecedor_id),
      diffField('casas_lote', existing.casas_lote, toNum(findCol(row, ['casas_lote'])), true),
      diffField('qtd_lote', existing.qtd_lote, toNum(findCol(row, ['qtd_lote'])), true),
      diffField('valor_unitario_real', existing.valor_unitario_real, toNum(findCol(row, ['valor_unitario_real'])), true),
      diffField('valor_total_real', existing.valor_total_real, valorTotal, true),
      diffField('cond_pagamento', existing.cond_pagamento, condPag),
      diffField('data_entrega_prevista', existing.data_entrega_prevista, toDateISO(findCol(row, ['data_entrega_prevista']))),
      diffField('data_entrega_real', existing.data_entrega_real, toDateISO(findCol(row, ['data_entrega_real']))),
      diffField('status', existing.status, toStr(findCol(row, ['status'])) || existing.status),
      diffField('observacoes', existing.observacoes, toStr(findCol(row, ['observacoes']))),
    ]
    const campos = checks.filter((c): c is FieldChange => c !== null)

    // Soma das parcelas CONTRATUAIS (do banco) vs valor_total nova.
    // Adiantamentos (tipo='adiantamento') não entram porque são desembolsos extras
    // que não fazem parte do cond_pagamento original do pedido.
    const parcsAtuais = dbParcelas.filter(p => p.pedido_id === id)
    const parcsContratuais = parcsAtuais.filter(p => (p.tipo ?? 'contratual') === 'contratual')
    const somaContratuais = parcsContratuais.reduce((s, p) => s + Number(p.valor || 0), 0)
    const diffCent = Math.round((valorTotal - somaContratuais) * 100)
    const condChanged = campos.some(c => c.campo === 'cond_pagamento')

    pedidoChanges.push({
      action: campos.length === 0 ? 'unchanged' : 'update',
      pedido_id: id,
      numero_pedido: existing.numero_pedido,
      etapa_codigo: etapaCod,
      item_codigo: itemCod,
      fornecedor_nome: fornNome,
      campos,
      rowData: row,
      parcelas_soma: somaContratuais,
      valor_total: valorTotal,
      diff_centavos: diffCent,
      warning_soma: Math.abs(diffCent) > 1
        ? `Σ parcelas contratuais (R$ ${somaContratuais.toFixed(2)}) ≠ valor_total_real (R$ ${valorTotal.toFixed(2)}). Diff R$ ${(diffCent / 100).toFixed(2)}. (Adiantamentos não contam aqui.)`
        : undefined,
      cond_changed_but_parcelas_same: condChanged,
    })
  }

  // Pedidos do banco que NÃO estão na planilha → missing
  for (const dbP of dbPedidos) {
    if (!sheetPedidoIds.has(dbP.id)) {
      pedidoChanges.push({
        action: 'missing',
        pedido_id: dbP.id,
        numero_pedido: dbP.numero_pedido,
        etapa_codigo: '',
        item_codigo: '',
        fornecedor_nome: '',
        campos: [],
        rowData: {},
        parcelas_soma: 0,
        valor_total: dbP.valor_total_real ?? 0,
        diff_centavos: 0,
      })
    }
  }

  // ── Parcelas ──
  const parcelaChanges: ParcelaChange[] = []
  const sheetParcIds = new Set<string>()

  for (const row of rows.parcelaRows) {
    const idRaw = toStr(findCol(row, ['parcela_id']))
    const id = isUUID(idRaw) ? idRaw : null
    const pedidoId = (() => { const s = toStr(findCol(row, ['pedido_id'])); return isUUID(s) ? s : null })()
    const despId = (() => { const s = toStr(findCol(row, ['despesa_indireta_id'])); return isUUID(s) ? s : null })()
    const numero = Number(findCol(row, ['numero_parcela'])) || 0
    const valor = toNum(findCol(row, ['valor']))
    const dataVenc = toDateISO(findCol(row, ['data_vencimento'])) ?? ''
    const dataPrevista = toDateISO(findCol(row, ['data_prevista_pagamento'])) ?? null
    const valorPago = toNum(findCol(row, ['valor_pago']))
    const dataPgto = toDateISO(findCol(row, ['data_pagamento_real']))
    const status = toStr(findCol(row, ['status'])) || 'futura'
    const tipo = toStr(findCol(row, ['tipo'])) || 'contratual'

    if (id) sheetParcIds.add(id)

    let warning: string | undefined
    if (pedidoId && despId) warning = 'Parcela com pedido_id E despesa_indireta_id (XOR esperado)'
    if (!pedidoId && !despId) warning = 'Parcela sem pedido_id nem despesa_indireta_id'

    if (!id) {
      parcelaChanges.push({
        action: 'create', parcela_id: null,
        pedido_id: pedidoId, despesa_indireta_id: despId,
        numero_parcela: numero, valor, data_vencimento: dataVenc,
        campos: [], rowData: row, warning,
      })
      continue
    }

    const existing = dbParcelasById.get(id)
    if (!existing) {
      // ID na planilha mas não no banco. ANTES criava com ID inventado (gerava as 51
      // parcelas-fantasma de 03/05/2026 quando a planilha veio de outro projeto).
      // AGORA: sem ID — se o usuário confirmar create, banco gera ID novo.
      parcelaChanges.push({
        action: 'create', parcela_id: null,
        pedido_id: pedidoId, despesa_indireta_id: despId,
        numero_parcela: numero, valor, data_vencimento: dataVenc,
        campos: [], rowData: row,
        warning: `⚠ parcela_id "${id.slice(0, 8)}…" da planilha não existe no banco. Provável que a planilha foi baixada de OUTRO projeto. Se confirmar, criará uma parcela nova.`,
      })
      continue
    }

    const checks: (FieldChange | null)[] = [
      diffField('numero_parcela', existing.numero_parcela, numero, true),
      diffField('valor', existing.valor, valor, true),
      diffField('data_vencimento', existing.data_vencimento, dataVenc),
      diffField('data_prevista_pagamento', (existing as any).data_prevista_pagamento, dataPrevista),
      diffField('valor_pago', existing.valor_pago, valorPago, true),
      diffField('data_pagamento_real', existing.data_pagamento_real, dataPgto),
      diffField('status', existing.status, status),
      diffField('tipo', existing.tipo, tipo),
      diffField('descricao', existing.descricao, toStr(findCol(row, ['descricao']))),
      diffField('observacoes', existing.observacoes, toStr(findCol(row, ['observacoes']))),
    ]
    const campos = checks.filter((c): c is FieldChange => c !== null)

    parcelaChanges.push({
      action: campos.length === 0 ? 'unchanged' : 'update',
      parcela_id: id,
      pedido_id: pedidoId ?? existing.pedido_id,
      despesa_indireta_id: despId ?? existing.despesa_indireta_id,
      numero_parcela: numero,
      valor,
      data_vencimento: dataVenc,
      campos,
      rowData: row,
      warning,
    })
  }

  for (const dbP of dbParcelas) {
    if (!sheetParcIds.has(dbP.id)) {
      parcelaChanges.push({
        action: 'missing',
        parcela_id: dbP.id,
        pedido_id: dbP.pedido_id,
        despesa_indireta_id: dbP.despesa_indireta_id,
        numero_parcela: dbP.numero_parcela,
        valor: dbP.valor,
        data_vencimento: dbP.data_vencimento,
        campos: [],
        rowData: {},
      })
    }
  }

  // ── Despesas ──
  const despChanges: DespesaChange[] = []
  const sheetDespIds = new Set<string>()

  for (const row of rows.despesaRows) {
    const idRaw = toStr(findCol(row, ['despesa_id']))
    const id = isUUID(idRaw) ? idRaw : null
    const descricao = toStr(findCol(row, ['descricao']))

    if (id) sheetDespIds.add(id)

    if (!id) {
      despChanges.push({ action: 'create', despesa_id: null, descricao, campos: [], rowData: row })
      continue
    }
    const existing = dbDespById.get(id)
    if (!existing) {
      despChanges.push({ action: 'create', despesa_id: id, descricao, campos: [], rowData: row })
      continue
    }

    const recorrenteSheet = toStr(findCol(row, ['recorrente'])).toLowerCase() === 'sim'
    const ativoSheet = toStr(findCol(row, ['ativo'])).toLowerCase() === 'sim'

    const checks: (FieldChange | null)[] = [
      diffField('descricao', existing.descricao, descricao),
      diffField('categoria', existing.categoria, toStr(findCol(row, ['categoria']))),
      diffField('valor_orcado', existing.valor_orcado, toNum(findCol(row, ['valor_orcado'])), true),
      diffField('cond_pagamento', existing.cond_pagamento, toStr(findCol(row, ['cond_pagamento']))),
      diffField('data_inicio', existing.data_inicio, toDateISO(findCol(row, ['data_inicio']))),
      diffField('data_fim', existing.data_fim, toDateISO(findCol(row, ['data_fim']))),
      diffField('recorrente', existing.recorrente, recorrenteSheet),
      diffField('frequencia', existing.frequencia, toStr(findCol(row, ['frequencia']))),
      diffField('ativo', existing.ativo, ativoSheet),
      diffField('observacoes', existing.observacoes, toStr(findCol(row, ['observacoes']))),
    ]
    const campos = checks.filter((c): c is FieldChange => c !== null)

    despChanges.push({
      action: campos.length === 0 ? 'unchanged' : 'update',
      despesa_id: id, descricao, campos, rowData: row,
    })
  }
  for (const dbD of dbDespesas) {
    if (!sheetDespIds.has(dbD.id)) {
      despChanges.push({
        action: 'missing', despesa_id: dbD.id, descricao: dbD.descricao,
        campos: [], rowData: {},
      })
    }
  }

  // ── Fornecedores ──
  const fornChanges: FornecedorChange[] = []
  const sheetFornIds = new Set<string>()

  for (const row of rows.fornecedorRows) {
    const idRaw = toStr(findCol(row, ['fornecedor_id']))
    const id = isUUID(idRaw) ? idRaw : null
    const nome = normFornNome(toStr(findCol(row, ['nome'])))

    if (id) sheetFornIds.add(id)

    if (!id) {
      fornChanges.push({ action: 'create', fornecedor_id: null, nome, campos: [], rowData: row })
      continue
    }
    const existing = dbFornById.get(id)
    if (!existing) {
      fornChanges.push({ action: 'create', fornecedor_id: id, nome, campos: [], rowData: row })
      continue
    }
    const checks: (FieldChange | null)[] = [
      diffField('nome', existing.nome, nome),
      diffField('cnpj', existing.cnpj, toStr(findCol(row, ['cnpj']))),
      diffField('contato', existing.contato, toStr(findCol(row, ['contato']))),
      diffField('cond_pagamento_padrao', existing.cond_pagamento_padrao, toStr(findCol(row, ['cond_pagamento_padrao']))),
      diffField('tipo', existing.tipo, toStr(findCol(row, ['tipo']))),
      diffField('observacoes', existing.observacoes, toStr(findCol(row, ['observacoes']))),
    ]
    const campos = checks.filter((c): c is FieldChange => c !== null)
    fornChanges.push({
      action: campos.length === 0 ? 'unchanged' : 'update',
      fornecedor_id: id, nome, campos, rowData: row,
    })
  }
  for (const dbF of dbForn) {
    if (!sheetFornIds.has(dbF.id)) {
      fornChanges.push({ action: 'missing', fornecedor_id: dbF.id, nome: dbF.nome, campos: [], rowData: {} })
    }
  }

  const count = (arr: { action: RowAction }[], a: RowAction) => arr.filter(x => x.action === a).length
  const warnCount = pedidoChanges.filter(p => p.warning_soma).length
    + parcelaChanges.filter(p => p.warning).length

  return {
    pedidos: pedidoChanges,
    parcelas: parcelaChanges,
    despesas: despChanges,
    fornecedores: fornChanges,
    resumo: {
      pedidos_create: count(pedidoChanges, 'create'),
      pedidos_update: count(pedidoChanges, 'update'),
      pedidos_missing: count(pedidoChanges, 'missing'),
      parcelas_create: count(parcelaChanges, 'create'),
      parcelas_update: count(parcelaChanges, 'update'),
      parcelas_missing: count(parcelaChanges, 'missing'),
      despesas_create: count(despChanges, 'create'),
      despesas_update: count(despChanges, 'update'),
      despesas_missing: count(despChanges, 'missing'),
      forn_create: count(fornChanges, 'create'),
      forn_update: count(fornChanges, 'update'),
      forn_missing: count(fornChanges, 'missing'),
      warnings: warnCount,
    },
  }
}

// ─── Apply ──────────────────────────────────────────────────

export async function applyComercialImport(
  preview: ComercialPreview,
  companyId: string,
): Promise<ApplyResult> {
  const errors: string[] = []
  const result: ApplyResult = {
    pedidos: { created: 0, updated: 0, deleted: 0 },
    parcelas: { created: 0, updated: 0, deleted: 0, regenerated: 0 },
    despesas: { created: 0, updated: 0, deleted: 0 },
    fornecedores: { created: 0, updated: 0, deleted: 0 },
    errors,
  }

  // Fornecedores primeiro (FKs dos outros)
  for (const fc of preview.fornecedores) {
    if (fc.action === 'unchanged') continue
    if (fc.action === 'missing') {
      if (fc.resolution === 'soft_delete' && fc.fornecedor_id) {
        // fornecedores não tem deleted_at em algumas instalações — fazemos hard delete
        const { error } = await supabase.from('fornecedores').delete().eq('id', fc.fornecedor_id)
        if (error) errors.push(`Fornecedor ${fc.nome}: ${error.message}`)
        else result.fornecedores.deleted++
      }
      continue
    }
    const payload = {
      nome: fc.nome,
      cnpj: toStr(findCol(fc.rowData, ['cnpj'])) || null,
      contato: toStr(findCol(fc.rowData, ['contato'])) || null,
      cond_pagamento_padrao: toStr(findCol(fc.rowData, ['cond_pagamento_padrao'])) || null,
      tipo: toStr(findCol(fc.rowData, ['tipo'])) || 'fornecedor',
      observacoes: toStr(findCol(fc.rowData, ['observacoes'])) || null,
    }
    if (fc.action === 'create') {
      const { error } = await supabase.from('fornecedores').insert({ ...payload, company_id: companyId, ...(fc.fornecedor_id ? { id: fc.fornecedor_id } : {}) })
      if (error) errors.push(`Fornecedor ${fc.nome}: ${error.message}`)
      else result.fornecedores.created++
    } else if (fc.action === 'update' && fc.fornecedor_id) {
      const { error } = await supabase.from('fornecedores').update(payload).eq('id', fc.fornecedor_id)
      if (error) errors.push(`Fornecedor ${fc.nome}: ${error.message}`)
      else result.fornecedores.updated++
    }
  }

  // Pedidos
  // Re-fetch lookups (fornecedores podem ter ganhado IDs novos)
  const [itemRes, fornRes] = await Promise.all([
    supabase.from('itens_compra').select('id, codigo').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('fornecedores').select('id, nome').eq('company_id', companyId),
  ])
  const itemByCod = new Map((itemRes.data ?? []).map((i: any) => [i.codigo, i.id]))
  const fornByNome = new Map((fornRes.data ?? []).map((f: any) => [normFornNome(f.nome).toUpperCase(), f.id]))

  // Linhas com mesmo (fornecedor, numero_pedido) compartilham pedido_grupo_id —
  // sinaliza que são itens de uma mesma PO. Sem numero, cai pra grupo
  // por-fornecedor desta sessão de import.
  const grupoByKey = new Map<string, string>()
  for (const pc of preview.pedidos) {
    if (pc.action === 'unchanged') continue
    if (pc.action === 'missing') {
      if (pc.resolution === 'soft_delete' && pc.pedido_id) {
        const { error } = await supabase.from('pedidos').delete().eq('id', pc.pedido_id)
        if (error) errors.push(`Pedido ${pc.numero_pedido}: ${error.message}`)
        else result.pedidos.deleted++
      }
      continue
    }
    const itemId = itemByCod.get(pc.item_codigo)
    if (!itemId && pc.action === 'create') {
      errors.push(`Pedido ${pc.numero_pedido ?? '(sem numero)'}: item_codigo "${pc.item_codigo}" não encontrado.`)
      continue
    }
    const fornNomeUpper = pc.fornecedor_nome.toUpperCase()
    let fornId = fornByNome.get(fornNomeUpper) ?? null
    if (!fornId && pc.fornecedor_nome) {
      const { data: novoF } = await supabase.from('fornecedores').insert({ company_id: companyId, nome: pc.fornecedor_nome }).select('id').single()
      if (novoF) { fornId = novoF.id; fornByNome.set(fornNomeUpper, novoF.id) }
    }

    const grupoKey = pc.numero_pedido != null && fornId
      ? `n:${fornId}:${pc.numero_pedido}`
      : (fornId ? `f:${fornId}` : null)
    let pedidoGrupoId: string | null = null
    if (grupoKey) {
      let g = grupoByKey.get(grupoKey)
      if (!g) { g = (globalThis.crypto?.randomUUID?.()) ?? null; if (g) grupoByKey.set(grupoKey, g) }
      pedidoGrupoId = g
    }

    const payload: Record<string, unknown> = {
      item_compra_id: itemId,
      fornecedor_id: fornId,
      numero_pedido: pc.numero_pedido,
      casas_lote: toNum(findCol(pc.rowData, ['casas_lote'])) || null,
      qtd_lote: toNum(findCol(pc.rowData, ['qtd_lote'])) || null,
      valor_unitario_real: toNum(findCol(pc.rowData, ['valor_unitario_real'])) || null,
      valor_total_real: pc.valor_total,
      cond_pagamento: toStr(findCol(pc.rowData, ['cond_pagamento'])) || null,
      data_entrega_prevista: toDateISO(findCol(pc.rowData, ['data_entrega_prevista'])),
      data_entrega_real: toDateISO(findCol(pc.rowData, ['data_entrega_real'])),
      status: sanitizePedidoStatus(findCol(pc.rowData, ['status'])),
      observacoes: toStr(findCol(pc.rowData, ['observacoes'])) || null,
      pedido_grupo_id: pedidoGrupoId,
    }
    if (pc.action === 'create') {
      const insertData = { ...payload, company_id: companyId, ...(pc.pedido_id ? { id: pc.pedido_id } : {}) }
      const { error } = await supabase.from('pedidos').insert(insertData)
      if (error) errors.push(`Pedido ${pc.numero_pedido ?? '?'}: ${error.message}`)
      else result.pedidos.created++
    } else if (pc.action === 'update' && pc.pedido_id) {
      const { error } = await supabase.from('pedidos').update(payload).eq('id', pc.pedido_id)
      if (error) errors.push(`Pedido ${pc.numero_pedido ?? '?'}: ${error.message}`)
      else result.pedidos.updated++
    }
  }

  // Despesas
  for (const dc of preview.despesas) {
    if (dc.action === 'unchanged') continue
    if (dc.action === 'missing') {
      if (dc.resolution === 'soft_delete' && dc.despesa_id) {
        const { error } = await supabase.from('despesas_indiretas')
          .update({ deleted_at: new Date().toISOString() }).eq('id', dc.despesa_id)
        if (error) errors.push(`Despesa ${dc.descricao}: ${error.message}`)
        else result.despesas.deleted++
      }
      continue
    }
    const fornNomeUpper = normFornNome(toStr(findCol(dc.rowData, ['fornecedor_nome']))).toUpperCase()
    const fornId = fornByNome.get(fornNomeUpper) ?? null
    const recorrente = toStr(findCol(dc.rowData, ['recorrente'])).toLowerCase() === 'sim'
    const ativo = toStr(findCol(dc.rowData, ['ativo'])).toLowerCase() !== 'nao'
    const payload: Record<string, unknown> = {
      descricao: dc.descricao,
      categoria: toStr(findCol(dc.rowData, ['categoria'])) || 'Indireto',
      valor_orcado: toNum(findCol(dc.rowData, ['valor_orcado'])),
      cond_pagamento: toStr(findCol(dc.rowData, ['cond_pagamento'])) || null,
      data_inicio: toDateISO(findCol(dc.rowData, ['data_inicio'])),
      data_fim: toDateISO(findCol(dc.rowData, ['data_fim'])),
      recorrente, ativo,
      frequencia: toStr(findCol(dc.rowData, ['frequencia'])) || null,
      fornecedor_id: fornId,
      observacoes: toStr(findCol(dc.rowData, ['observacoes'])) || null,
    }
    if (dc.action === 'create') {
      const insertData = { ...payload, company_id: companyId, ...(dc.despesa_id ? { id: dc.despesa_id } : {}) }
      const { error } = await supabase.from('despesas_indiretas').insert(insertData)
      if (error) errors.push(`Despesa ${dc.descricao}: ${error.message}`)
      else result.despesas.created++
    } else if (dc.action === 'update' && dc.despesa_id) {
      const { error } = await supabase.from('despesas_indiretas').update(payload).eq('id', dc.despesa_id)
      if (error) errors.push(`Despesa ${dc.descricao}: ${error.message}`)
      else result.despesas.updated++
    }
  }

  // Parcelas (depois de pedidos/despesas existirem)
  for (const pc of preview.parcelas) {
    if (pc.action === 'unchanged') continue
    if (pc.action === 'missing') {
      if (pc.resolution === 'soft_delete' && pc.parcela_id) {
        const { error } = await supabase.from('parcelas')
          .update({ deleted_at: new Date().toISOString() }).eq('id', pc.parcela_id)
        if (error) errors.push(`Parcela ${pc.numero_parcela}: ${error.message}`)
        else result.parcelas.deleted++
      }
      continue
    }
    const payload: Record<string, unknown> = {
      pedido_id: pc.pedido_id,
      despesa_indireta_id: pc.despesa_indireta_id,
      numero_parcela: pc.numero_parcela,
      valor: pc.valor,
      data_vencimento: pc.data_vencimento,
      data_prevista_pagamento: toDateISO(findCol(pc.rowData, ['data_prevista_pagamento'])) ?? pc.data_vencimento,
      valor_pago: toNum(findCol(pc.rowData, ['valor_pago'])),
      data_pagamento_real: toDateISO(findCol(pc.rowData, ['data_pagamento_real'])),
      status: toStr(findCol(pc.rowData, ['status'])) || 'futura',
      tipo: toStr(findCol(pc.rowData, ['tipo'])) || 'contratual',
      descricao: toStr(findCol(pc.rowData, ['descricao'])) || null,
      observacoes: toStr(findCol(pc.rowData, ['observacoes'])) || null,
    }
    if (pc.action === 'create') {
      const insertData = { ...payload, company_id: companyId, ...(pc.parcela_id ? { id: pc.parcela_id } : {}) }
      const { error } = await supabase.from('parcelas').insert(insertData)
      if (error) errors.push(`Parcela ${pc.numero_parcela}: ${error.message}`)
      else result.parcelas.created++
    } else if (pc.action === 'update' && pc.parcela_id) {
      const { error } = await supabase.from('parcelas').update(payload).eq('id', pc.parcela_id)
      if (error) errors.push(`Parcela ${pc.numero_parcela}: ${error.message}`)
      else result.parcelas.updated++
    }
  }

  // Audit log
  try {
    await supabase.from('audit_logs').insert({
      company_id: companyId,
      tabela: 'comercial_import',
      acao: 'INSERT',
      agente: 'sistema',
      dados_depois: {
        type: 'import_comercial_v1',
        ...result,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 30),
      },
    })
  } catch {
    /* non-blocking */
  }

  return result
}
