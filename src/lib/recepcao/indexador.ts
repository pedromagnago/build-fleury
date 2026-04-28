// Indexador de embeddings para itens_compra.
// Estrategia: pega itens da company que NAO estao em itens_compra_embeddings
// (ou cujo texto_indexado mudou) e gera embedding em batches.
import { supabase } from '@/lib/supabase'
import { embedTexts } from './api'

interface ItemBasico { id: string; descricao: string; categoria: string | null; etapa_nome: string | null; fornecedor_nome: string | null }

function textoIndexavel(it: ItemBasico): string {
  return [it.descricao, it.categoria, it.etapa_nome, it.fornecedor_nome]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 1000)
}

export async function indexarEmbeddingsPendentes(companyId: string): Promise<{ indexados: number; custoCents: number; total: number }> {
  // 1) Carrega itens da company (com etapa/fornecedor para enriquecer texto)
  const { data: itensRaw, error } = await supabase
    .from('itens_compra')
    .select('id, descricao, categoria, etapas(nome), fornecedores(nome)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (error) throw error
  const itens: ItemBasico[] = (itensRaw ?? []).map((i: any) => ({
    id: i.id,
    descricao: i.descricao,
    categoria: i.categoria,
    etapa_nome: i.etapas?.nome ?? null,
    fornecedor_nome: i.fornecedores?.nome ?? null,
  }))
  if (itens.length === 0) return { indexados: 0, custoCents: 0, total: 0 }

  // 2) Carrega quem ja tem embedding e o texto indexado anteriormente
  const { data: existentes } = await supabase
    .from('itens_compra_embeddings')
    .select('item_id, texto_indexado')
    .in('item_id', itens.map(i => i.id))
  const cacheTexto = new Map<string, string>()
  for (const r of (existentes ?? [])) cacheTexto.set(r.item_id as string, r.texto_indexado as string)

  // 3) Filtra itens que precisam (re)indexar (sem cache OU texto mudou)
  const aIndexar = itens
    .map(it => ({ it, texto: textoIndexavel(it) }))
    .filter(({ it, texto }) => cacheTexto.get(it.id) !== texto)

  if (aIndexar.length === 0) return { indexados: 0, custoCents: 0, total: itens.length }

  // 4) Em batches de 200, gera embedding e faz upsert
  const BATCH = 200
  let custoTotal = 0
  let indexados = 0
  for (let i = 0; i < aIndexar.length; i += BATCH) {
    const batch = aIndexar.slice(i, i + BATCH)
    const textos = batch.map(b => b.texto)
    const { embeddings, custo_cents } = await embedTexts(textos)
    custoTotal += custo_cents
    const rows = batch.map((b, idx) => ({
      item_id: b.it.id,
      texto_indexado: b.texto,
      embedding: embeddings[idx],
      modelo: 'text-embedding-3-small',
      updated_at: new Date().toISOString(),
    }))
    const { error: upErr } = await supabase.from('itens_compra_embeddings').upsert(rows, { onConflict: 'item_id' })
    if (upErr) throw upErr
    indexados += rows.length
  }
  return { indexados, custoCents: custoTotal, total: itens.length }
}

// Embed 1 string (query). Reaproveita a mesma edge function.
export async function embedQuery(texto: string): Promise<number[]> {
  const { embeddings } = await embedTexts([texto])
  return embeddings[0]!
}
