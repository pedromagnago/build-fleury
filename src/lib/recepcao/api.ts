// Wrappers das edge functions (recepcao-extrair, recepcao-embed) e da RPC search.
import { supabase } from '@/lib/supabase'

export interface ExtracaoResult {
  fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
  documento: {
    numero: string | null
    serie: string | null
    data_emissao: string | null
    data_vencimento: string | null
    valor_total: number | null
    tipo: string
  }
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

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}
