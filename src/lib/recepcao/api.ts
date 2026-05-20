// Wrappers das edge functions (recepcao-extrair, recepcao-embed) e da RPC search.
import { supabase } from '@/lib/supabase'

/** Bloco "pagamento" — preenchido pela IA quando o documento traz forma de pagamento
 * (boleto/PIX/TED) anexa ou embutida. Para NF-e XML "limpa" sem boleto vem tudo null.
 * Persiste em recepcao_docs.raw_extracao (jsonb), sem coluna dedicada — UI usa pra
 * pré-popular cond_pagamento / vencimento e exibir os dados ao operador. */
export interface PagamentoExtraido {
  forma: 'BOLETO' | 'PIX' | 'TED' | 'DINHEIRO' | 'CARTAO' | 'DESCONHECIDO' | null
  linha_digitavel: string | null
  codigo_barras: string | null
  chave_pix: string | null
  tipo_chave_pix: 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA' | null
  banco: string | null
  agencia: string | null
  conta: string | null
  beneficiario_nome: string | null
  beneficiario_cnpj_cpf: string | null
}

export interface ExtracaoResult {
  fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
  documento: {
    numero: string | null
    serie: string | null
    data_emissao: string | null
    data_vencimento: string | null
    valor_total: number | null
    /** NFE | NFSE | CTE | BOLETO | PIX | RECIBO | OUTRO (string aberta pra futuro) */
    tipo: string
  }
  /** Opcional — IA mais nova devolve, parsers antigos (XML NFe) não. */
  pagamento?: PagamentoExtraido | null
  itens: Array<{
    ordem: number
    descricao: string
    ncm: string | null
    unidade: string | null
    quantidade: number | null
    valor_unitario: number | null
    valor_total: number | null
  }>
  observacoes: string | null
  _meta: { modelo: string; custo_cents: number; usage: any }
}

export async function extrairDoc(input: {
  kind: 'imagem' | 'texto'
  content: string
  prompt_extra?: string
}): Promise<ExtracaoResult> {
  const { data, error } = await supabase.functions.invoke('recepcao-extrair', { body: input })
  if (error) throw error
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as ExtracaoResult
}

/** Extrai dados de UM documento composto por MÚLTIPLAS imagens (PDF multipágina,
 *  frente+verso de boleto, fotos de partes diferentes da mesma nota).
 *  IA recebe todas as imagens numa única chamada e devolve uma extração consolidada
 *  — evita N calls cegas que duplicavam fornecedor/itens. */
export async function extrairDocImagens(input: {
  images: Array<{ base64: string; mime?: string }>
  prompt_extra?: string
}): Promise<ExtracaoResult> {
  const { data, error } = await supabase.functions.invoke('recepcao-extrair', {
    body: { kind: 'imagens', images: input.images, prompt_extra: input.prompt_extra },
  })
  if (error) throw error
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as ExtracaoResult
}

/** Extrai PDF no servidor (Deno + unpdf) — bypass do bug pdfjs/Vite no client.
 * Retorna estrutura DANFE pronta se for nota fiscal, ou texto cru pra fallback IA. */
export interface PdfParseResult {
  kind: 'danfe' | 'texto' | 'erro'
  // quando kind='danfe'
  danfe?: {
    fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
    documento: { numero: string | null; serie: string | null; data_emissao: string | null; data_vencimento: string | null; valor_total: number | null; tipo: 'NFE' }
    itens: Array<{ ordem: number; codigo: string; descricao: string; ncm: string | null; unidade: string | null; quantidade: number | null; valor_unitario: number | null; valor_total: number | null }>
    observacoes: string | null
    notas_parser: string[]
    qualidade: number
  }
  // quando kind='texto'
  texto?: string
  // quando kind='erro'
  erro?: string
  paginas?: number
  paginas_com_erro?: number
  total_chars?: number
  custo_cents?: number
}
export async function parsearPdf(pdfBase64: string): Promise<PdfParseResult> {
  const { data, error } = await supabase.functions.invoke('recepcao-pdf-parse', { body: { pdf_base64: pdfBase64 } })
  if (error) throw error
  return data as PdfParseResult
}

export async function embedTexts(texts: string[]): Promise<{ embeddings: number[][]; modelo: string; custo_cents: number }> {
  const { data, error } = await supabase.functions.invoke('recepcao-embed', { body: { texts } })
  if (error) throw error
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as any
}

export interface ItemMatchSugerido {
  item_id: string
  codigo: string
  descricao: string
  categoria: string | null
  fornecedor_nome: string | null
  etapa_nome: string | null
  valor_unitario_orcado: number | null
  score_trgm: number
  score_cosine: number | null
  score_combined: number
  /** Flag aplicado client-side quando este item já foi vinculado a uma descrição parecida do mesmo fornecedor antes */
  match_historico?: boolean
  /** Score original antes do boost histórico — preservado para auditoria */
  score_original?: number
}

export async function searchItensCompra(args: {
  company_id: string
  query: string
  query_embedding?: number[]
  limit?: number
}): Promise<ItemMatchSugerido[]> {
  const { data, error } = await supabase.rpc('search_itens_compra', {
    p_company_id: args.company_id,
    p_query: args.query,
    p_query_embedding: args.query_embedding ?? null,
    p_limit: args.limit ?? 5,
  })
  if (error) throw error
  return (data ?? []) as ItemMatchSugerido[]
}

// ============================================================================
// Boost histórico (F1.2 + F2.2): re-ranking client-side
// ============================================================================
// Estratégia: a RPC search_itens_compra retorna candidatos por similaridade
// textual/semântica. Aqui adicionamos uma camada de "memória" — quando o mesmo
// fornecedor já entregou um item parecido antes (registro em recepcao_matches),
// elevamos o score desse item-candidato. Isso é o aprendizado da F2.2: cada
// match que o operador confirma vira sinal pro próximo.

/** Normaliza descrição pra comparação: lowercase, sem acentos, sem espaços extras */
export function normalizarDescricao(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-z0-9\s/.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface AliasHistorico {
  itemId: string
  ocorrencias: number
}
/** Mapa: descrição_normalizada → item mais frequente entregue por esse fornecedor */
export type AliasMap = Map<string, AliasHistorico>

/**
 * Carrega aliases (descrição da NF → item_compra) deste fornecedor a partir
 * de recepcao_matches confirmadas. Funciona como uma "view materializada client-side".
 * Se fornecedorId for null, retorna mapa vazio (sem boost).
 */
export async function carregarAliasesFornecedor(companyId: string, fornecedorId: string | null): Promise<AliasMap> {
  const mapa: AliasMap = new Map()
  if (!fornecedorId) return mapa
  // Carrega matches confirmados (criar_pedido/substituir_pedido) de docs deste fornecedor
  const { data, error } = await supabase
    .from('recepcao_matches')
    .select('descricao_original, item_compra_id, acao, recepcao_docs!inner(fornecedor_id, company_id)')
    .eq('recepcao_docs.company_id', companyId)
    .eq('recepcao_docs.fornecedor_id', fornecedorId)
    .in('acao', ['criar_pedido', 'substituir_pedido'])
    .not('item_compra_id', 'is', null)
    .limit(1000)
  if (error) {
    console.warn('Falha ao carregar aliases de fornecedor:', error)
    return mapa
  }
  for (const row of (data ?? []) as any[]) {
    const key = normalizarDescricao(row.descricao_original)
    if (!key || !row.item_compra_id) continue
    const existente = mapa.get(key)
    if (existente && existente.itemId === row.item_compra_id) {
      existente.ocorrencias += 1
    } else if (existente) {
      // Conflito: descrição já mapeia pra outro item. Mantém o de maior contagem.
      // (não decrementa o atual — ele venceu por estar primeiro)
    } else {
      mapa.set(key, { itemId: row.item_compra_id, ocorrencias: 1 })
    }
  }
  return mapa
}

/**
 * Re-ranqueia sugestões aplicando boost histórico.
 * - Match exato no histórico (mesma descrição normalizada → mesmo item): score → 0.95 (entra zona alta)
 * - Item presente no histórico do fornecedor (qualquer descrição): score += 0.10 (cap 0.92)
 * - Sem histórico: mantém score original
 * Marca `match_historico=true` nos que receberam boost. Reordena por novo score_combined.
 */
export function aplicarBoostHistorico(
  sugestoes: ItemMatchSugerido[],
  descricaoQuery: string,
  aliases: AliasMap,
): ItemMatchSugerido[] {
  if (aliases.size === 0) return sugestoes
  const keyQuery = normalizarDescricao(descricaoQuery)
  const aliasExato = keyQuery ? aliases.get(keyQuery) : undefined
  // Conjunto de itemIds que esse fornecedor já entregou (qualquer descrição)
  const itemsConhecidos = new Set<string>()
  for (const v of aliases.values()) itemsConhecidos.add(v.itemId)

  const ajustadas = sugestoes.map(s => {
    const scoreOriginal = s.score_combined
    let novoScore = scoreOriginal
    let historico = false
    if (aliasExato && aliasExato.itemId === s.item_id) {
      // Match perfeito de descrição + item — forte sinal
      novoScore = Math.max(scoreOriginal, 0.95)
      historico = true
    } else if (itemsConhecidos.has(s.item_id)) {
      // Fornecedor já entregou esse item antes (com outra descrição) — sinal médio
      novoScore = Math.min(0.92, scoreOriginal + 0.10)
      historico = true
    }
    return { ...s, score_original: scoreOriginal, score_combined: novoScore, match_historico: historico }
  })
  // Reordena por novo score
  ajustadas.sort((a, b) => b.score_combined - a.score_combined)
  return ajustadas
}

/** Resolve fornecedor por CNPJ (preferencial) ou nome, a partir de uma lista carregada no client. */
export function resolverFornecedorLocal(
  fornecedores: Array<{ id: string; nome: string; cnpj: string | null }>,
  nome: string | null | undefined,
  cnpj: string | null | undefined,
): string | null {
  const cnpjLimpo = cnpj?.replace(/\D/g, '') ?? ''
  if (cnpjLimpo) {
    const f = fornecedores.find(x => x.cnpj && x.cnpj.replace(/\D/g, '') === cnpjLimpo)
    if (f) return f.id
  }
  if (nome) {
    const nomeKey = nome.trim().toLowerCase()
    const f = fornecedores.find(x => x.nome.trim().toLowerCase() === nomeKey)
    if (f) return f.id
  }
  return null
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}
