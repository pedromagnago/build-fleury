// Recepção de Documentos — wizard de entrada de NF/PDF/imagem/texto
// Fluxo: Upload → Extração (XML deterministico OU OpenAI) → Revisão linha-a-linha → Comitar
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useFornecedores, usePedidos, useCreatePedidoLote } from '@/hooks/useCompras'
import { useItensCompra } from '@/hooks/useCompras'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { parseNfeXml } from '@/lib/recepcao/xmlNfeParser'
import { extrairDoc, searchItensCompra, fileToBase64, type ItemMatchSugerido } from '@/lib/recepcao/api'
import { indexarEmbeddingsPendentes, embedQuery } from '@/lib/recepcao/indexador'
import { Inbox, FileText, Image as ImageIcon, Sparkles, Check, X, Trash2, AlertTriangle, Loader2, Database, Plus } from 'lucide-react'
import { useEtapas } from '@/hooks/useEtapas'

type Acao = 'substituir_pedido' | 'criar_pedido' | 'criar_item' | 'ignorar'

interface LinhaExtraida {
  ordem: number
  descricao: string
  ncm: string | null
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
  // Decisão
  acao?: Acao
  item_compra_id?: string | null
  pedido_substituido_id?: string | null
  observacao?: string
  // Sugestões
  sugestoesItens?: ItemMatchSugerido[]
  carregandoSugestoes?: boolean
}

interface Extracao {
  fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
  documento: { numero: string | null; serie: string | null; data_emissao: string | null; data_vencimento: string | null; valor_total: number | null; tipo: string }
  itens: LinhaExtraida[]
  observacoes?: string | null
  origem: 'xml_nfe' | 'imagem' | 'texto'
  modelo?: string
  custo_cents?: number
}

export default function RecepcaoPage() {
  const { currentCompany } = useProject()
  const { data: itens = [] } = useItensCompra()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()
  const createPedidoLote = useCreatePedidoLote()

  const [extracao, setExtracao] = useState<Extracao | null>(null)
  const [extraindo, setExtraindo] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [textoColado, setTextoColado] = useState('')
  const [indexando, setIndexando] = useState(false)
  const [criandoItemIdx, setCriandoItemIdx] = useState<number | null>(null)
  const [criandoFornecedor, setCriandoFornecedor] = useState(false)
  const [novoItemForm, setNovoItemForm] = useState({ descricao: '', etapa_id: '', categoria: 'MATERIAL', valor_orcado: '' })
  const [novoFornForm, setNovoFornForm] = useState({ nome: '', cnpj: '' })

  const handleIndexar = async () => {
    if (!currentCompany) return
    setIndexando(true)
    try {
      const r = await indexarEmbeddingsPendentes(currentCompany.id)
      if (r.indexados === 0) toast.success(`Já indexado: ${r.total} itens.`)
      else toast.success(`Indexados ${r.indexados} de ${r.total} itens · custo R$ ${(r.custoCents / 100).toFixed(4)}`)
    } catch (err) {
      toast.error('Erro ao indexar: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIndexando(false)
    }
  }

  const onDrop = async (files: File[]) => {
    const file = files[0]
    if (!file || !currentCompany) return
    setExtraindo(true)
    try {
      const ext = file.name.toLowerCase().split('.').pop() ?? ''
      if (ext === 'xml') {
        const text = await file.text()
        const parsed = parseNfeXml(text)
        await iniciarRevisao({
          fornecedor: parsed.fornecedor,
          documento: { ...parsed.documento, tipo: 'NFE' },
          itens: parsed.itens,
          origem: 'xml_nfe',
        })
      } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        const b64 = await fileToBase64(file)
        const r = await extrairDoc({ kind: 'imagem', content: b64 })
        await iniciarRevisao({
          fornecedor: r.fornecedor,
          documento: r.documento,
          itens: r.itens,
          observacoes: r.observacoes,
          origem: 'imagem',
          modelo: r._meta?.modelo,
          custo_cents: r._meta?.custo_cents,
        })
      } else {
        toast.error(`Formato nao suportado (${ext}). Use XML, JPG, PNG ou WEBP. PDF: tire foto/screenshot.`)
      }
    } catch (err) {
      toast.error('Erro ao extrair: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtraindo(false)
    }
  }

  const extrairTexto = async () => {
    if (!textoColado.trim() || !currentCompany) return
    setExtraindo(true)
    try {
      const r = await extrairDoc({ kind: 'texto', content: textoColado.trim() })
      await iniciarRevisao({
        fornecedor: r.fornecedor,
        documento: r.documento,
        itens: r.itens,
        observacoes: r.observacoes,
        origem: 'texto',
        modelo: r._meta?.modelo,
        custo_cents: r._meta?.custo_cents,
      })
    } catch (err) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtraindo(false)
    }
  }

  // Após extrair: dispara busca de sugestões para cada linha em paralelo
  const iniciarRevisao = async (e: Omit<Extracao, 'itens'> & { itens: any[] }) => {
    const linhas: LinhaExtraida[] = e.itens.map((i: any) => ({ ...i, carregandoSugestoes: true }))
    setExtracao({ ...e, itens: linhas } as Extracao)
    if (!currentCompany) return
    // Carrega sugestões em paralelo (com embedding do query — match semantico)
    Promise.all(linhas.map(async (l, idx) => {
      try {
        // Tenta gerar embedding do query (se falhar, cai pra so trigram)
        let queryEmb: number[] | undefined
        try { queryEmb = await embedQuery(l.descricao) } catch { /* ignora */ }
        const sugs = await searchItensCompra({ company_id: currentCompany.id, query: l.descricao, query_embedding: queryEmb, limit: 3 })
        setExtracao(prev => {
          if (!prev) return prev
          const novas = [...prev.itens]
          novas[idx] = { ...novas[idx]!, sugestoesItens: sugs, carregandoSugestoes: false }
          // Pré-seleciona top match se score >= 0.5
          if (sugs.length > 0 && sugs[0]!.score_combined >= 0.5) {
            novas[idx]!.item_compra_id = sugs[0]!.item_id
            // Verifica se item tem pedido em previsão (planejado, sem nota) → sugere substituir
            const pedidoExistente = pedidos.find(p => p.item_compra_id === sugs[0]!.item_id && p.status === 'planejado')
            novas[idx]!.acao = pedidoExistente ? 'substituir_pedido' : 'criar_pedido'
            if (pedidoExistente) novas[idx]!.pedido_substituido_id = pedidoExistente.id
          } else {
            novas[idx]!.acao = 'criar_item'
          }
          return { ...prev, itens: novas }
        })
      } catch (err) {
        console.error('Erro buscar sugestões:', err)
      }
    }))
  }

  const totalLinhas = extracao?.itens.reduce((s, l) => s + (l.valor_total ?? 0), 0) ?? 0
  const diferenca = (extracao?.documento.valor_total ?? 0) - totalLinhas
  const linhasOk = extracao?.itens.filter(l => l.acao && l.acao !== 'ignorar').length ?? 0

  const aplicar = async () => {
    if (!extracao || !currentCompany) return
    setAplicando(true)
    try {
      // 1) Resolve fornecedor (acha por CNPJ ou nome, ou cria)
      let fornId: string | null = null
      if (extracao.fornecedor.cnpj) {
        const cnpjClean = extracao.fornecedor.cnpj.replace(/\D/g, '')
        const f = (fornecedores as any[]).find(x => x.cnpj && x.cnpj.replace(/\D/g, '') === cnpjClean)
        fornId = f?.id ?? null
      }
      if (!fornId && extracao.fornecedor.nome) {
        const f = (fornecedores as any[]).find(x => x.nome.toLowerCase() === extracao.fornecedor.nome!.toLowerCase())
        fornId = f?.id ?? null
      }
      if (!fornId && extracao.fornecedor.nome) {
        const { data: novoForn } = await supabase.from('fornecedores').insert({
          company_id: currentCompany.id,
          nome: extracao.fornecedor.nome,
          cnpj: extracao.fornecedor.cnpj?.replace(/\D/g, '') ?? null,
        }).select('id').single()
        fornId = novoForn?.id ?? null
      }

      // 2) Cria registro recepcao_docs
      const { data: docRow, error: docErr } = await supabase.from('recepcao_docs').insert({
        company_id: currentCompany.id,
        origem: extracao.origem,
        fornecedor_nome: extracao.fornecedor.nome,
        fornecedor_cnpj: extracao.fornecedor.cnpj?.replace(/\D/g, '') ?? null,
        numero_doc: extracao.documento.numero,
        serie: extracao.documento.serie,
        data_emissao: extracao.documento.data_emissao,
        valor_total: extracao.documento.valor_total,
        raw_extracao: extracao as any,
        modelo_ia: extracao.modelo ?? null,
        custo_ia_cents: extracao.custo_cents ?? 0,
        fornecedor_id: fornId,
        status: 'aplicado',
        applied_at: new Date().toISOString(),
      }).select('id').single()
      if (docErr) throw docErr

      // 3) Para cada linha "criar_pedido" / "substituir_pedido" → cria pedido novo (com item_compra_id resolvido)
      const pedidosParaCriar = extracao.itens
        .filter(l => l.acao && l.acao !== 'ignorar' && l.acao !== 'criar_item' && l.item_compra_id)
        .map(l => ({
          item_compra_id: l.item_compra_id!,
          fornecedor_id: fornId,
          casas_lote: null,
          qtd_lote: l.quantidade ?? null,
          valor_unitario_real: l.valor_unitario ?? null,
          valor_total_real: l.valor_total ?? null,
          cond_pagamento: null,
          data_entrega_prevista: extracao.documento.data_emissao ?? null,
          status: 'confirmado' as const,
          observacoes: `Recebido via NF ${extracao.documento.numero ?? ''} — ${l.descricao}`,
        }))

      let pedidosCriados: any[] = []
      if (pedidosParaCriar.length > 0) {
        pedidosCriados = await createPedidoLote.mutateAsync(pedidosParaCriar as any)
      }

      // 4) Substituir previsões (cancelar pedido antigo)
      const substituicoes = extracao.itens.filter(l => l.acao === 'substituir_pedido' && l.pedido_substituido_id)
      for (const sub of substituicoes) {
        await supabase.from('pedidos').update({ status: 'cancelado', observacoes: `Substituido por NF ${extracao.documento.numero ?? ''}` }).eq('id', sub.pedido_substituido_id!)
      }

      // 5) Linhas para criar item novo (Fase 2 implementacao completa) — por enquanto só registra na tabela
      const linhasMatch = extracao.itens.map((l, idx) => ({
        doc_id: docRow!.id,
        ordem: l.ordem ?? idx,
        descricao_original: l.descricao,
        ncm: l.ncm,
        unidade: l.unidade,
        quantidade: l.quantidade,
        valor_unitario: l.valor_unitario,
        valor_total: l.valor_total,
        sugestoes: l.sugestoesItens ?? null,
        acao: l.acao ?? 'ignorar',
        item_compra_id: l.item_compra_id ?? null,
        pedido_substituido_id: l.pedido_substituido_id ?? null,
        pedido_criado_id: pedidosCriados.find(pc => pc.item_compra_id === l.item_compra_id)?.id ?? null,
        observacao: l.observacao ?? null,
      }))
      if (linhasMatch.length > 0) {
        await supabase.from('recepcao_matches').insert(linhasMatch)
      }

      const totalSubstituidos = substituicoes.length
      const totalCriados = pedidosCriados.length
      const totalIgnoradosOuItem = extracao.itens.length - totalSubstituidos - totalCriados
      toast.success(`Documento aplicado: ${totalCriados} pedido(s) criado(s), ${totalSubstituidos} previsão(ões) substituída(s)${totalIgnoradosOuItem > 0 ? `, ${totalIgnoradosOuItem} pendente(s)` : ''}`)
      setExtracao(null)
      setTextoColado('')
    } catch (err) {
      toast.error('Erro ao aplicar: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setAplicando(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
    },
    maxFiles: 1,
  })

  return (
    <div className="space-y-4">
      <PageHeader title="Recepção de Documentos" description="Importe NF-e (XML), foto da nota, ou cole texto. A IA extrai e cruza com o orçamento." icon={Inbox} />

      {!extracao && (
        <>
          {/* Acoes globais */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleIndexar}
              disabled={indexando}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              title="Gera embeddings dos itens pra match semantico (1x, ~R$0,001 por 100 itens)"
            >
              {indexando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              {indexando ? 'Indexando…' : 'Indexar embeddings'}
            </button>
          </div>
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
          >
            <input {...getInputProps()} />
            {extraindo ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Extraindo dados…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-3 mb-2">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">Arraste o XML da NF-e ou foto da nota</p>
                <p className="text-xs text-muted-foreground">Formatos: .xml (deterministico) · .jpg/.png/.webp (IA Vision)</p>
                <p className="text-[10px] text-muted-foreground">PDF não suportado — tire screenshot ou converta. Em breve.</p>
              </div>
            )}
          </div>

          {/* Texto colado */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Ou cole o texto da nota / e-mail</h3>
            <textarea
              value={textoColado}
              onChange={e => setTextoColado(e.target.value)}
              rows={6}
              placeholder="Cole aqui o texto da NF, e-mail do fornecedor, descrição do que foi entregue..."
              className="w-full rounded-md border bg-background p-2 text-sm font-mono"
            />
            <button
              onClick={extrairTexto}
              disabled={!textoColado.trim() || extraindo}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Extrair com IA
            </button>
          </div>
        </>
      )}

      {/* Modal: Criar item rapido */}
      {criandoItemIdx !== null && extracao && currentCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCriandoItemIdx(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2">Criar item de orcamento rapido</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Cria um novo item_compra para vincular a esta linha da nota. Voce pode ajustar depois em Compras &gt; Itens.</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Descricao</label>
                <input value={novoItemForm.descricao} onChange={e => setNovoItemForm({ ...novoItemForm, descricao: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Etapa</label>
                  <select value={novoItemForm.etapa_id} onChange={e => setNovoItemForm({ ...novoItemForm, etapa_id: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm">
                    <option value="">— escolher —</option>
                    {(etapas as any[]).map(et => <option key={et.id} value={et.id}>{et.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Tipo</label>
                  <select value={novoItemForm.categoria} onChange={e => setNovoItemForm({ ...novoItemForm, categoria: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm">
                    <option value="MATERIAL">Material</option>
                    <option value="MAO_DE_OBRA">Mão de Obra</option>
                    <option value="EQUIPAMENTO">Equipamento</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Valor unitario orcado (R$)</label>
                <input type="number" step="0.01" value={novoItemForm.valor_orcado} onChange={e => setNovoItemForm({ ...novoItemForm, valor_orcado: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono text-right" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCriandoItemIdx(null)} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
              <button
                onClick={async () => {
                  if (!novoItemForm.descricao.trim() || !novoItemForm.etapa_id) {
                    toast.error('Preencha descricao e etapa')
                    return
                  }
                  try {
                    const valorNum = parseFloat(novoItemForm.valor_orcado.replace(',', '.')) || 0
                    const { data: novo, error: errIns } = await supabase.from('itens_compra').insert({
                      company_id: currentCompany.id,
                      etapa_id: novoItemForm.etapa_id,
                      descricao: novoItemForm.descricao.trim(),
                      tipo: novoItemForm.categoria,
                      categoria: novoItemForm.categoria,
                      custo_unitario_orcado: valorNum,
                      valor_total_orcado: valorNum,
                    }).select('id').single()
                    if (errIns) throw errIns
                    if (novo) {
                      const idxLocal = criandoItemIdx
                      setExtracao(prev => prev ? {
                        ...prev,
                        itens: prev.itens.map((l, i) => i === idxLocal ? { ...l, item_compra_id: novo.id, acao: 'criar_pedido' } : l)
                      } : prev)
                      toast.success('Item criado e vinculado a esta linha')
                    }
                    setCriandoItemIdx(null)
                  } catch (err) {
                    toast.error('Erro ao criar item: ' + (err instanceof Error ? err.message : String(err)))
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Criar item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar fornecedor rapido */}
      {criandoFornecedor && currentCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCriandoFornecedor(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2">Criar fornecedor rapido</h3>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Nome</label>
                <input value={novoFornForm.nome} onChange={e => setNovoFornForm({ ...novoFornForm, nome: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">CNPJ (opcional)</label>
                <input value={novoFornForm.cnpj} onChange={e => setNovoFornForm({ ...novoFornForm, cnpj: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCriandoFornecedor(false)} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
              <button
                onClick={async () => {
                  if (!novoFornForm.nome.trim()) { toast.error('Informe o nome'); return }
                  try {
                    const { data: novo, error: errIns } = await supabase.from('fornecedores').insert({
                      company_id: currentCompany.id,
                      nome: novoFornForm.nome.trim(),
                      cnpj: novoFornForm.cnpj?.replace(/\D/g, '') || null,
                    }).select('id').single()
                    if (errIns) throw errIns
                    if (novo && extracao) {
                      // Atualiza header da extracao com novo fornecedor
                      setExtracao({ ...extracao, fornecedor: { ...extracao.fornecedor, nome: novoFornForm.nome.trim(), cnpj: novoFornForm.cnpj || extracao.fornecedor.cnpj } })
                    }
                    toast.success('Fornecedor criado')
                    setCriandoFornecedor(false)
                  } catch (err) {
                    toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)))
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TELA DE REVISÃO */}
      {extracao && (
        <div className="space-y-3">
          {/* Header */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">{extracao.fornecedor.nome ?? 'Fornecedor desconhecido'}</h3>
                  {(() => {
                    const cnpjClean = extracao.fornecedor.cnpj?.replace(/\D/g, '')
                    const fornExiste = (fornecedores as any[]).some(f =>
                      (cnpjClean && f.cnpj?.replace(/\D/g, '') === cnpjClean) ||
                      (extracao.fornecedor.nome && f.nome.toLowerCase() === extracao.fornecedor.nome.toLowerCase())
                    )
                    if (fornExiste) return <span className="text-[10px] rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5">cadastrado</span>
                    return (
                      <button
                        onClick={() => {
                          setNovoFornForm({ nome: extracao.fornecedor.nome ?? '', cnpj: extracao.fornecedor.cnpj ?? '' })
                          setCriandoFornecedor(true)
                        }}
                        className="text-[10px] rounded border border-blue-500/40 text-blue-700 hover:bg-blue-500/10 px-1.5 py-0.5 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Cadastrar fornecedor
                      </button>
                    )
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {extracao.fornecedor.cnpj ? `CNPJ ${extracao.fornecedor.cnpj} · ` : ''}
                  NF {extracao.documento.numero ?? '—'} {extracao.documento.serie ? `Série ${extracao.documento.serie}` : ''}
                  {extracao.documento.data_emissao ? ` · ${extracao.documento.data_emissao}` : ''}
                </p>
              </div>
              <button onClick={() => { setExtracao(null); setTextoColado('') }} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
                <X className="h-3.5 w-3.5 inline mr-1" /> Cancelar
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Valor da NF</p>
                <p className="font-bold text-sm">{formatCurrency(extracao.documento.valor_total ?? 0)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Soma das linhas</p>
                <p className={`font-bold text-sm ${Math.abs(diferenca) > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(totalLinhas)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Diferença</p>
                <p className={`font-bold text-sm ${Math.abs(diferenca) > 0.01 ? 'text-amber-600' : 'text-muted-foreground'}`}>{formatCurrency(diferenca)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Itens / Decididos</p>
                <p className="font-bold text-sm">{linhasOk} / {extracao.itens.length}</p>
              </div>
            </div>
            {extracao.modelo && (
              <p className="mt-2 text-[10px] text-muted-foreground">Extraído por {extracao.modelo} · custo R$ {((extracao.custo_cents ?? 0) / 100).toFixed(4)}</p>
            )}
            {Math.abs(diferenca) > 0.01 && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Soma das linhas ({formatCurrency(totalLinhas)}) difere do total da NF ({formatCurrency(extracao.documento.valor_total ?? 0)}). Confira os valores.
              </div>
            )}
          </div>

          {/* Linhas */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Item da Nota</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">Valor</th>
                  <th className="px-3 py-2 text-left font-semibold w-72">Match no orçamento</th>
                  <th className="px-3 py-2 text-left font-semibold w-44">Ação</th>
                  <th className="px-3 py-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody>
                {extracao.itens.map((linha, idx) => {
                  const sugTop = linha.sugestoesItens?.[0]
                  const itemSelecionado = linha.item_compra_id ? itens.find(i => i.id === linha.item_compra_id) : null
                  const pedidoSel = linha.pedido_substituido_id ? pedidos.find(p => p.id === linha.pedido_substituido_id) : null
                  return (
                    <tr key={idx} className="border-t hover:bg-muted/10">
                      <td className="px-3 py-2 text-center text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{linha.descricao}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {linha.quantidade ? `${linha.quantidade} ${linha.unidade ?? 'un'}` : ''}
                          {linha.valor_unitario ? ` × ${formatCurrency(linha.valor_unitario)}` : ''}
                          {linha.ncm ? ` · NCM ${linha.ncm}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{formatCurrency(linha.valor_total ?? 0)}</td>
                      <td className="px-3 py-2">
                        {linha.carregandoSugestoes ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> buscando…
                          </span>
                        ) : itemSelecionado ? (
                          <div>
                            <div className="font-medium text-[11px]">{itemSelecionado.descricao}</div>
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                              <span>{itemSelecionado.codigo}</span>
                              {sugTop && (
                                <span className={`rounded px-1 ${sugTop.score_combined > 0.7 ? 'bg-emerald-500/15 text-emerald-700' : sugTop.score_combined > 0.4 ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                                  {Math.round(sugTop.score_combined * 100)}%
                                </span>
                              )}
                              {pedidoSel && <span className="rounded bg-blue-500/15 text-blue-700 px-1">→ #{pedidoSel.numero_pedido} (subst.)</span>}
                            </div>
                            <select
                              value={linha.item_compra_id ?? ''}
                              onChange={e => {
                                setExtracao(prev => prev ? {
                                  ...prev,
                                  itens: prev.itens.map((l, i) => i === idx ? { ...l, item_compra_id: e.target.value || null } : l)
                                } : prev)
                              }}
                              className="mt-1 w-full rounded border bg-background px-1 py-0.5 text-[10px]"
                            >
                              {linha.sugestoesItens?.map(s => (
                                <option key={s.item_id} value={s.item_id}>{s.descricao} ({Math.round(s.score_combined * 100)}%)</option>
                              ))}
                            </select>
                          </div>
                        ) : linha.sugestoesItens && linha.sugestoesItens.length > 0 ? (
                          <select
                            value={''}
                            onChange={e => {
                              setExtracao(prev => prev ? {
                                ...prev,
                                itens: prev.itens.map((l, i) => i === idx ? { ...l, item_compra_id: e.target.value, acao: 'criar_pedido' } : l)
                              } : prev)
                            }}
                            className="w-full rounded border bg-background px-1 py-0.5 text-[10px]"
                          >
                            <option value="">— escolher —</option>
                            {linha.sugestoesItens.map(s => (
                              <option key={s.item_id} value={s.item_id}>{s.descricao} ({Math.round(s.score_combined * 100)}%)</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground italic">Sem match no orcamento</span>
                            <button
                              onClick={() => {
                                setCriandoItemIdx(idx)
                                const valor = linha.valor_unitario ?? linha.valor_total ?? 0
                                setNovoItemForm({ descricao: linha.descricao, etapa_id: '', categoria: 'MATERIAL', valor_orcado: String(valor) })
                              }}
                              className="text-[9px] inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-blue-700 hover:bg-blue-500/10 self-start"
                            >
                              <Plus className="h-3 w-3" /> Criar item rapido
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={linha.acao ?? ''}
                          onChange={e => {
                            const acao = e.target.value as Acao
                            setExtracao(prev => prev ? {
                              ...prev,
                              itens: prev.itens.map((l, i) => i === idx ? { ...l, acao } : l)
                            } : prev)
                          }}
                          className="w-full rounded border bg-background px-1.5 py-1 text-[11px]"
                        >
                          <option value="">— escolher —</option>
                          <option value="criar_pedido">Criar pedido firme</option>
                          <option value="substituir_pedido" disabled={!pedidoSel}>Substituir previsão</option>
                          <option value="criar_item">Criar item novo (manual)</option>
                          <option value="ignorar">Ignorar</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => {
                            setExtracao(prev => prev ? { ...prev, itens: prev.itens.filter((_, i) => i !== idx) } : prev)
                          }}
                          className="rounded p-1 text-red-500 hover:bg-red-500/10"
                          title="Remover linha"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setExtracao(null); setTextoColado('') }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
            <button
              onClick={aplicar}
              disabled={aplicando || linhasOk === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {aplicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aplicar {linhasOk > 0 ? `(${linhasOk} linha${linhasOk > 1 ? 's' : ''})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
