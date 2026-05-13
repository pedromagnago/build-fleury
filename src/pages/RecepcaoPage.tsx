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
import { extrairDoc, searchItensCompra, fileToBase64, carregarAliasesFornecedor, aplicarBoostHistorico, resolverFornecedorLocal, type ItemMatchSugerido, type AliasMap } from '@/lib/recepcao/api'
import { indexarEmbeddingsPendentes, embedQuery } from '@/lib/recepcao/indexador'
import { pdfFileToImages } from '@/lib/recepcao/pdfToImages'
import { pdfFileToText } from '@/lib/recepcao/pdfText'
import { ItemPickerCombobox } from '@/components/recepcao/ItemPickerCombobox'
import { Inbox, FileText, Image as ImageIcon, Sparkles, Check, X, Trash2, AlertTriangle, Loader2, Database, Plus, ShieldCheck, HelpCircle } from 'lucide-react'
import { useEtapas } from '@/hooks/useEtapas'

type Acao = 'substituir_pedido' | 'criar_pedido' | 'criar_item' | 'ignorar'

// Zonas de confiança do matching IA
// Score >= AUTO: pré-seleciona automaticamente (alta confiança)
// AUTO > Score >= SUGESTAO: pré-seleciona MAS exige confirmação explícita do operador
// Score < SUGESTAO: não pré-seleciona; operador escolhe (ou cria item novo)
const THRESHOLD_AUTO = 0.80
const THRESHOLD_SUGESTAO = 0.55

type ZonaConfianca = 'alta' | 'media' | 'baixa' | 'nenhuma'
function zonaDeScore(score: number | null | undefined): ZonaConfianca {
  if (score == null) return 'nenhuma'
  if (score >= THRESHOLD_AUTO) return 'alta'
  if (score >= THRESHOLD_SUGESTAO) return 'media'
  return 'baixa'
}

// F2.3: gera próximo código sugerido pra um item dentro de uma etapa.
// Lê os códigos existentes da etapa, acha o maior sufixo numérico e propõe +1.
function gerarCodigoSugerido(
  etapaCodigo: string | null | undefined,
  itensDaEtapa: Array<{ codigo: string | null | undefined }>,
): string {
  const prefixo = (etapaCodigo ?? '').trim()
  if (!prefixo) {
    // Fallback: sem código de etapa, usa ITEM-NNN baseado no total
    return `ITEM-${String(itensDaEtapa.length + 1).padStart(3, '0')}`
  }
  const maxNum = itensDaEtapa.reduce((max, it) => {
    const c = it.codigo ?? ''
    if (!c.startsWith(prefixo)) return max
    const resto = c.slice(prefixo.length).replace(/^[.\-_ ]/, '')
    const n = parseInt(resto, 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `${prefixo}.${String(maxNum + 1).padStart(3, '0')}`
}

// Avisos contextuais (F1.4): cruzam o que a NF diz com o que o orçamento prevê
interface AvisoLinha {
  severidade: 'amber' | 'red'
  texto: string
  detalhe?: string
}
const TOL_PRECO_AMBER = 0.05  // ±5% até 15% → âmbar
const TOL_PRECO_RED = 0.15    // > 15% → vermelho

function calcularAvisos(linha: LinhaExtraida, itemOrcado: {
  custo_unitario_orcado: number
  valor_total_orcado: number
  valor_consumido: number
  qtd_total: number | null
  unidade: string | null
} | null): AvisoLinha[] {
  const avisos: AvisoLinha[] = []
  if (!itemOrcado) return avisos
  // 1) Variação de preço unitário
  if (linha.valor_unitario != null && itemOrcado.custo_unitario_orcado > 0) {
    const delta = (linha.valor_unitario / itemOrcado.custo_unitario_orcado) - 1
    const absDelta = Math.abs(delta)
    if (absDelta > TOL_PRECO_RED) {
      avisos.push({
        severidade: 'red',
        texto: `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}% vs orçado`,
        detalhe: `Unit. NF R$ ${linha.valor_unitario.toFixed(2)} vs orçado R$ ${itemOrcado.custo_unitario_orcado.toFixed(2)}`,
      })
    } else if (absDelta > TOL_PRECO_AMBER) {
      avisos.push({
        severidade: 'amber',
        texto: `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}% vs orçado`,
        detalhe: `Unit. NF R$ ${linha.valor_unitario.toFixed(2)} vs orçado R$ ${itemOrcado.custo_unitario_orcado.toFixed(2)}`,
      })
    }
  }
  // 2) Excede saldo do orçamento (em valor)
  const saldoValor = (itemOrcado.valor_total_orcado ?? 0) - (itemOrcado.valor_consumido ?? 0)
  if (linha.valor_total != null && saldoValor > 0 && linha.valor_total > saldoValor) {
    avisos.push({
      severidade: 'red',
      texto: 'Excede saldo do item',
      detalhe: `NF R$ ${linha.valor_total.toFixed(2)} > saldo R$ ${saldoValor.toFixed(2)}`,
    })
  } else if (linha.valor_total != null && saldoValor <= 0) {
    avisos.push({
      severidade: 'red',
      texto: 'Item sem saldo',
      detalhe: `Item já consumiu R$ ${itemOrcado.valor_consumido.toFixed(2)} de R$ ${itemOrcado.valor_total_orcado.toFixed(2)}`,
    })
  }
  // 3) Quantidade da NF excede o total orçado do item (sinal grosso)
  if (linha.quantidade != null && itemOrcado.qtd_total != null && linha.quantidade > itemOrcado.qtd_total) {
    avisos.push({
      severidade: 'amber',
      texto: `Qtd NF ${linha.quantidade} > orçado ${itemOrcado.qtd_total}`,
      detalhe: `Quantidade desta NF (${linha.quantidade} ${linha.unidade ?? ''}) supera o total orçado do item`,
    })
  }
  return avisos
}

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
  // Estado de confiança / confirmação
  precisaConfirmar?: boolean   // true quando pré-selecionado em zona "media" e ainda não confirmado
  confirmado?: boolean         // true quando operador confirmou explicitamente (manual ou clicando "confirmar")
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
  const [novoItemForm, setNovoItemForm] = useState({ descricao: '', etapa_id: '', categoria: 'MATERIAL', valor_orcado: '', codigo: '', unidade: '', qtd_total: '' })
  const [novoFornForm, setNovoFornForm] = useState({ nome: '', cnpj: '' })
  // F1.5: o operador precisa aceitar conscientemente a divergência NF×soma de linhas pra liberar o "Aplicar"
  const [diferencaAceita, setDiferencaAceita] = useState(false)
  // F2.1: filtro de visão da revisão (foco no que precisa atenção)
  const [filtroVisao, setFiltroVisao] = useState<'todas' | 'pendentes' | 'sem_match' | 'confirmadas'>('todas')

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
      } else if (ext === 'pdf') {
        // PDF: tenta primeiro extrair TEXTO NATIVO (gerado por sistema). Se o PDF
        // foi escaneado (sem texto), cai pro fluxo de rasterizar e mandar pra Vision.
        // Texto nativo é dramaticamente mais preciso e mais barato pra tabelas de NF.
        toast.info('Lendo PDF…')
        let textoPdf: Awaited<ReturnType<typeof pdfFileToText>>
        try {
          textoPdf = await pdfFileToText(file)
        } catch (err) {
          console.warn('Falha ao ler texto nativo do PDF, indo pra Vision:', err)
          textoPdf = { texto: '', paginas: 0, total_chars: 0, tem_texto_nativo: false, paginas_com_erro: 0 }
        }
        if (textoPdf.tem_texto_nativo) {
          toast.info(`PDF com texto nativo (${textoPdf.total_chars.toLocaleString('pt-BR')} chars) — extraindo direto, sem Vision.`)
          const r = await extrairDoc({ kind: 'texto', content: textoPdf.texto })
          await iniciarRevisao({
            fornecedor: r.fornecedor,
            documento: r.documento,
            itens: r.itens,
            observacoes: r.observacoes,
            origem: 'texto',
            modelo: r._meta?.modelo,
            custo_cents: r._meta?.custo_cents,
          })
        } else {
          // PDF escaneado (foto digitalizada) — sem texto extraível. Rasteriza e usa Vision.
          toast.info('PDF sem texto nativo (escaneado) — convertendo em imagens pra IA Vision…')
          const paginas = await pdfFileToImages(file)
          if (paginas.length === 0) {
            toast.error('PDF sem páginas')
            return
          }
          toast.info(`Extraindo ${paginas.length} página(s) com IA Vision…`)
          // Chama IA em paralelo (1 chamada por página). Para 1 página, eh equivalente.
          const resultados = await Promise.all(paginas.map(p => extrairDoc({
            kind: 'imagem',
            content: p.base64,
            prompt_extra: paginas.length > 1 ? `Esta eh a pagina ${p.pagina} de ${paginas.length} de uma NF.` : undefined,
          })))
          // Consolida: usa fornecedor/documento da primeira pagina, junta TODOS os itens
          const r0 = resultados[0]!
          const itensConsolidados = resultados.flatMap((r, idx) =>
            (r.itens ?? []).map((it, j) => ({ ...it, ordem: idx * 1000 + (it.ordem ?? j + 1) }))
          )
          const custoTotalCents = resultados.reduce((s, r) => s + (r._meta?.custo_cents ?? 0), 0)
          await iniciarRevisao({
            fornecedor: r0.fornecedor,
            documento: r0.documento,
            itens: itensConsolidados,
            observacoes: r0.observacoes,
            origem: 'imagem',
            modelo: r0._meta?.modelo,
            custo_cents: custoTotalCents,
          })
        }
      } else {
        toast.error(`Formato nao suportado (${ext}). Use XML, PDF, JPG, PNG ou WEBP.`)
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
    setDiferencaAceita(false)
    if (!currentCompany) return
    // Garante que itens novos/alterados estejam indexados antes de buscar matches
    // (no-op se já está tudo indexado; custa ~R$0,001 por item novo)
    try {
      const r = await indexarEmbeddingsPendentes(currentCompany.id)
      if (r.indexados > 0) toast.info(`IA indexou ${r.indexados} item(ns) novo(s) do orçamento para o match.`)
    } catch (err) {
      // Não bloqueia o fluxo — cai pra trigram-only
      console.warn('Falha ao auto-indexar embeddings:', err)
    }
    // Resolve fornecedor da NF e carrega aliases históricos pra boostar matches recorrentes
    const fornecedorIdResolvido = resolverFornecedorLocal(
      fornecedores as any[],
      e.fornecedor.nome,
      e.fornecedor.cnpj,
    )
    let aliases: AliasMap = new Map()
    if (fornecedorIdResolvido) {
      try {
        aliases = await carregarAliasesFornecedor(currentCompany.id, fornecedorIdResolvido)
        if (aliases.size > 0) {
          toast.info(`IA carregou ${aliases.size} match(es) anteriores deste fornecedor.`)
        }
      } catch (err) {
        console.warn('Falha ao carregar aliases do fornecedor:', err)
      }
    }
    // Carrega sugestões em paralelo (com embedding do query — match semantico)
    Promise.all(linhas.map(async (l, idx) => {
      try {
        // Tenta gerar embedding do query (se falhar, cai pra so trigram)
        let queryEmb: number[] | undefined
        try { queryEmb = await embedQuery(l.descricao) } catch { /* ignora */ }
        const sugsRaw = await searchItensCompra({ company_id: currentCompany.id, query: l.descricao, query_embedding: queryEmb, limit: 10 })
        const sugs = aplicarBoostHistorico(sugsRaw, l.descricao, aliases)
        setExtracao(prev => {
          if (!prev) return prev
          const novas = [...prev.itens]
          novas[idx] = { ...novas[idx]!, sugestoesItens: sugs, carregandoSugestoes: false }
          const top = sugs[0]
          const zona = zonaDeScore(top?.score_combined)
          if (top && (zona === 'alta' || zona === 'media')) {
            novas[idx]!.item_compra_id = top.item_id
            const pedidoExistente = pedidos.find(p => p.item_compra_id === top.item_id && p.status === 'planejado')
            novas[idx]!.acao = pedidoExistente ? 'substituir_pedido' : 'criar_pedido'
            if (pedidoExistente) novas[idx]!.pedido_substituido_id = pedidoExistente.id
            // Zona alta → auto-confirmado; zona média → exige confirmação explícita
            novas[idx]!.precisaConfirmar = zona === 'media'
            novas[idx]!.confirmado = zona === 'alta'
          } else {
            // Zona baixa ou sem sugestão → operador decide (default cria item novo)
            novas[idx]!.acao = 'criar_item'
            novas[idx]!.precisaConfirmar = false
            novas[idx]!.confirmado = false
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
  // F1.5: tolerância = 1 centavo (R$ 0,01). Acima disso, exige aceite explícito do operador.
  const TOLERANCIA_DIFERENCA = 0.01
  const temDivergencia = Math.abs(diferenca) > TOLERANCIA_DIFERENCA
  const divergenciaBloqueia = temDivergencia && !diferencaAceita
  // Uma linha está "ok pra aplicar" se tem ação ≠ ignorar e não está pendente de confirmação
  const linhasOk = extracao?.itens.filter(l => l.acao && l.acao !== 'ignorar' && !(l.precisaConfirmar && !l.confirmado)).length ?? 0
  const linhasAConfirmar = extracao?.itens.filter(l => l.precisaConfirmar && !l.confirmado).length ?? 0
  const linhasAutoOk = extracao?.itens.filter(l => l.confirmado && l.acao && l.acao !== 'ignorar' && (l.acao === 'criar_pedido' || l.acao === 'substituir_pedido')).length ?? 0
  const linhasCriarItem = extracao?.itens.filter(l => l.acao === 'criar_item').length ?? 0
  // F2.1: lista visível preserva o índice original pra handlers continuarem funcionando
  const linhasVisiveis = (extracao?.itens ?? [])
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => {
      switch (filtroVisao) {
        case 'pendentes': return !!l.precisaConfirmar && !l.confirmado
        case 'sem_match': return l.acao === 'criar_item'
        case 'confirmadas': return !!l.confirmado && (l.acao === 'criar_pedido' || l.acao === 'substituir_pedido')
        default: return true
      }
    })

  const confirmarTodasPendentes = () => {
    setExtracao(prev => prev ? {
      ...prev,
      itens: prev.itens.map(l => (l.precisaConfirmar && !l.confirmado) ? { ...l, confirmado: true, precisaConfirmar: false } : l)
    } : prev)
  }

  // Handler unificado: operador escolheu um item do orçamento pra esta linha da NF.
  // Substitui as 2 lógicas duplicadas dos antigos <select> de sugestões.
  const escolherItemParaLinha = (idx: number, novoItemId: string | null) => {
    const pedidoExistente = novoItemId ? pedidos.find(p => p.item_compra_id === novoItemId && p.status === 'planejado') : undefined
    setExtracao(prev => prev ? {
      ...prev,
      itens: prev.itens.map((l, i) => i === idx ? {
        ...l,
        item_compra_id: novoItemId,
        pedido_substituido_id: pedidoExistente?.id ?? null,
        acao: pedidoExistente ? 'substituir_pedido' : (l.acao === 'substituir_pedido' ? 'criar_pedido' : (l.acao ?? 'criar_pedido')),
        confirmado: true,
        precisaConfirmar: false,
      } : l)
    } : prev)
  }

  // F1.5 edição inline: o operador corrige valores extraídos errados sem precisar remover a linha.
  // Quando muda quantidade ou unitário e o outro está preenchido, recalcula total.
  // Quando muda total e quantidade está preenchida, recalcula unitário.
  const editarLinha = (idx: number, campo: 'quantidade' | 'valor_unitario' | 'valor_total', novoValor: number | null) => {
    setExtracao(prev => {
      if (!prev) return prev
      const itens = prev.itens.map((l, i) => {
        if (i !== idx) return l
        const ln = { ...l, [campo]: novoValor }
        const q = ln.quantidade
        const vu = ln.valor_unitario
        const vt = ln.valor_total
        if (campo === 'valor_total' && q != null && q > 0 && vt != null) {
          ln.valor_unitario = vt / q
        } else if (campo === 'valor_unitario' && q != null && q > 0 && vu != null) {
          ln.valor_total = q * vu
        } else if (campo === 'quantidade' && q != null && q > 0 && vu != null) {
          ln.valor_total = q * vu
        }
        return ln
      })
      return { ...prev, itens }
    })
  }

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
      setDiferencaAceita(false)
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
      'application/pdf': ['.pdf'],
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
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50 text-muted-foreground"
              title="Manutenção: a indexação roda automaticamente ao receber uma nota. Use isto só pra forçar reindexação."
            >
              {indexando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              {indexando ? 'Re-indexando…' : 'Re-indexar (manutenção)'}
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
                <p className="text-sm font-semibold">Arraste o XML da NF-e, PDF ou foto da nota</p>
                <p className="text-xs text-muted-foreground">Formatos: .xml (deterministico) · .pdf (multi-pagina) · .jpg/.png/.webp (IA Vision)</p>
                <p className="text-[10px] text-muted-foreground">PDFs com varias paginas geram 1 chamada de IA por pagina (paralelo).</p>
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
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2">Criar item de orçamento rápido</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Cria um novo item de compra com código, unidade e quantidade — assim ele entra no orçamento corretamente e fica auditável depois.</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Descrição<span className="text-red-500">*</span></label>
                <input value={novoItemForm.descricao} onChange={e => setNovoItemForm({ ...novoItemForm, descricao: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Etapa<span className="text-red-500">*</span></label>
                  <select
                    value={novoItemForm.etapa_id}
                    onChange={e => {
                      const etapaId = e.target.value
                      const etapa = (etapas as any[]).find(et => et.id === etapaId)
                      const itensDaEtapa = (itens as any[]).filter(i => i.etapa_id === etapaId)
                      // Só sobrescreve o código se ainda estiver vazio ou se tinha sido sugerido automaticamente
                      const codigoNovo = etapa
                        ? gerarCodigoSugerido(etapa.codigo, itensDaEtapa)
                        : novoItemForm.codigo
                      setNovoItemForm({ ...novoItemForm, etapa_id: etapaId, codigo: codigoNovo })
                    }}
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">— escolher —</option>
                    {(etapas as any[]).map(et => <option key={et.id} value={et.id}>{et.codigo ? `${et.codigo} · ` : ''}{et.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Código<span className="text-red-500">*</span></label>
                  <input
                    value={novoItemForm.codigo}
                    onChange={e => setNovoItemForm({ ...novoItemForm, codigo: e.target.value })}
                    placeholder="ex.: 01.02.001"
                    className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono"
                    title="Sugestão automática baseada na etapa. Pode editar."
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Tipo</label>
                  <select value={novoItemForm.categoria} onChange={e => setNovoItemForm({ ...novoItemForm, categoria: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm">
                    <option value="MATERIAL">Material</option>
                    <option value="MAO_DE_OBRA">Mão de Obra</option>
                    <option value="EQUIPAMENTO">Equipamento</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Unidade<span className="text-red-500">*</span></label>
                  <input value={novoItemForm.unidade} onChange={e => setNovoItemForm({ ...novoItemForm, unidade: e.target.value.toUpperCase() })} placeholder="UN / KG / M" className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Qtd total<span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0" value={novoItemForm.qtd_total} onChange={e => setNovoItemForm({ ...novoItemForm, qtd_total: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono text-right" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Valor unitário orçado (R$)<span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" value={novoItemForm.valor_orcado} onChange={e => setNovoItemForm({ ...novoItemForm, valor_orcado: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-sm font-mono text-right" />
              </div>
              {(() => {
                const qtdNum = parseFloat(novoItemForm.qtd_total.replace(',', '.')) || 0
                const valorNum = parseFloat(novoItemForm.valor_orcado.replace(',', '.')) || 0
                const totalCalc = qtdNum * valorNum
                if (qtdNum > 0 && valorNum > 0) {
                  return (
                    <div className="rounded bg-muted/30 p-2 text-[11px] flex justify-between">
                      <span className="text-muted-foreground">Total orçado calculado</span>
                      <span className="font-bold">{formatCurrency(totalCalc)}</span>
                    </div>
                  )
                }
                return null
              })()}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCriandoItemIdx(null)} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
              <button
                onClick={async () => {
                  const descricao = novoItemForm.descricao.trim()
                  const codigo = novoItemForm.codigo.trim()
                  const unidade = novoItemForm.unidade.trim()
                  const qtdNum = parseFloat(novoItemForm.qtd_total.replace(',', '.'))
                  const valorNum = parseFloat(novoItemForm.valor_orcado.replace(',', '.'))
                  if (!descricao) { toast.error('Preencha a descrição'); return }
                  if (!novoItemForm.etapa_id) { toast.error('Selecione a etapa'); return }
                  if (!codigo) { toast.error('Preencha o código (a sugestão aparece ao escolher a etapa)'); return }
                  if (!unidade) { toast.error('Preencha a unidade (ex.: UN, KG, M)'); return }
                  if (!Number.isFinite(qtdNum) || qtdNum <= 0) { toast.error('Quantidade total deve ser > 0'); return }
                  if (!Number.isFinite(valorNum) || valorNum <= 0) { toast.error('Valor unitário deve ser > 0'); return }
                  // Checa duplicidade de código na company
                  const dup = (itens as any[]).find(i => i.codigo === codigo)
                  if (dup) { toast.error(`Código "${codigo}" já existe no item "${dup.descricao}". Use outro.`); return }
                  try {
                    const valorTotalOrcado = qtdNum * valorNum
                    const { data: novo, error: errIns } = await supabase.from('itens_compra').insert({
                      company_id: currentCompany.id,
                      etapa_id: novoItemForm.etapa_id,
                      codigo,
                      descricao,
                      tipo: novoItemForm.categoria,
                      categoria: novoItemForm.categoria,
                      unidade,
                      qtd_total: qtdNum,
                      custo_unitario_orcado: valorNum,
                      valor_total_orcado: valorTotalOrcado,
                    }).select('id').single()
                    if (errIns) throw errIns
                    if (novo) {
                      const idxLocal = criandoItemIdx
                      setExtracao(prev => prev ? {
                        ...prev,
                        itens: prev.itens.map((l, i) => i === idxLocal ? { ...l, item_compra_id: novo.id, acao: 'criar_pedido', confirmado: true, precisaConfirmar: false } : l)
                      } : prev)
                      toast.success(`Item ${codigo} criado e vinculado`)
                      // Indexa o novo item em background pra próximas linhas/notas (não bloqueia UI)
                      indexarEmbeddingsPendentes(currentCompany.id).catch(err => console.warn('Falha indexar item novo:', err))
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
                <p className="text-[10px] uppercase text-muted-foreground">Status IA</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5" title="Auto-vinculadas (alta confiança ≥80%)">
                    <ShieldCheck className="h-3 w-3" /> {linhasAutoOk}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${linhasAConfirmar > 0 ? 'bg-amber-500/15 text-amber-700 font-bold' : 'bg-muted text-muted-foreground'}`} title="Pré-selecionadas pela IA mas exigem confirmação (média confiança 55–80%)">
                    <HelpCircle className="h-3 w-3" /> {linhasAConfirmar}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-700 px-1.5 py-0.5" title="Sem match no orçamento — criar item novo ou ignorar">
                    <Plus className="h-3 w-3" /> {linhasCriarItem}
                  </span>
                </div>
              </div>
            </div>
            {extracao.modelo && (
              <p className="mt-2 text-[10px] text-muted-foreground">Extraído por {extracao.modelo} · custo R$ {((extracao.custo_cents ?? 0) / 100).toFixed(4)}</p>
            )}
            {linhasAConfirmar > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700">
                <span className="inline-flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5" /> {linhasAConfirmar} linha(s) com match de confiança média — confirme antes de aplicar.
                </span>
                <button
                  onClick={confirmarTodasPendentes}
                  className="inline-flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 text-[10px] font-bold whitespace-nowrap"
                  title="Aceita todas as sugestões de média confiança de uma vez"
                >
                  <Check className="h-3 w-3" /> Confirmar todas
                </button>
              </div>
            )}
            {temDivergencia && (
              <div className={`mt-2 flex items-center justify-between gap-2 rounded-md p-2 text-[11px] ${divergenciaBloqueia ? 'bg-red-500/10 text-red-700 border border-red-500/40' : 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30'}`}>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Soma das linhas ({formatCurrency(totalLinhas)}) difere do total da NF ({formatCurrency(extracao.documento.valor_total ?? 0)}) — diferença <strong>{formatCurrency(diferenca)}</strong>.
                    {divergenciaBloqueia ? ' Confira os valores ou aceite a diferença pra aplicar.' : ' Diferença aceita pelo operador.'}
                  </span>
                </div>
                {divergenciaBloqueia ? (
                  <button
                    onClick={() => setDiferencaAceita(true)}
                    className="inline-flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 text-[10px] font-bold whitespace-nowrap"
                    title="Aceita conscientemente a diferença (frete, desconto, imposto não-detalhado) e libera o Aplicar"
                  >
                    <Check className="h-3 w-3" /> Aceitar diferença
                  </button>
                ) : (
                  <button
                    onClick={() => setDiferencaAceita(false)}
                    className="inline-flex items-center gap-1 rounded border border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 px-2 py-1 text-[10px] whitespace-nowrap"
                    title="Reverter aceite — voltar a bloquear o Aplicar"
                  >
                    <X className="h-3 w-3" /> Reverter aceite
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filtros de visão (F2.1) */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] uppercase text-muted-foreground mr-1">Ver:</span>
            {([
              { key: 'todas', label: `Todas (${extracao.itens.length})` },
              { key: 'pendentes', label: `A confirmar (${linhasAConfirmar})`, disabled: linhasAConfirmar === 0 },
              { key: 'sem_match', label: `Sem match (${linhasCriarItem})`, disabled: linhasCriarItem === 0 },
              { key: 'confirmadas', label: `Confirmadas (${linhasAutoOk})`, disabled: linhasAutoOk === 0 },
            ] as Array<{ key: typeof filtroVisao; label: string; disabled?: boolean }>).map(b => (
              <button
                key={b.key}
                onClick={() => setFiltroVisao(b.key)}
                disabled={b.disabled}
                className={`rounded px-2 py-1 text-[11px] font-medium border ${filtroVisao === b.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted text-foreground border-border'} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {b.label}
              </button>
            ))}
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
                {linhasVisiveis.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-[11px] text-muted-foreground">Nenhuma linha neste filtro.</td></tr>
                )}
                {linhasVisiveis.map(({ l: linha, idx }) => {
                  const sugTop = linha.sugestoesItens?.[0]
                  const itemSelecionado = linha.item_compra_id ? itens.find(i => i.id === linha.item_compra_id) : null
                  const pedidoSel = linha.pedido_substituido_id ? pedidos.find(p => p.id === linha.pedido_substituido_id) : null
                  const zona = zonaDeScore(sugTop?.score_combined)
                  const precisaConf = !!linha.precisaConfirmar && !linha.confirmado
                  // Destaque de fundo por estado: pendente confirmação > alta confiança > nenhum
                  const bgRow = precisaConf
                    ? 'bg-amber-500/10 hover:bg-amber-500/15'
                    : linha.confirmado && zona === 'alta'
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                      : 'hover:bg-muted/10'
                  return (
                    <tr key={idx} className={`border-t ${bgRow}`}>
                      <td className="px-3 py-2 text-center text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{linha.descricao}</div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linha.quantidade ?? ''}
                            onChange={e => editarLinha(idx, 'quantidade', e.target.value === '' ? null : parseFloat(e.target.value))}
                            className="w-16 rounded border bg-background px-1 py-0.5 text-[10px] font-mono text-right"
                            title="Quantidade"
                          />
                          <span>{linha.unidade ?? 'un'}</span>
                          <span>×</span>
                          <span>R$</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={linha.valor_unitario ?? ''}
                            onChange={e => editarLinha(idx, 'valor_unitario', e.target.value === '' ? null : parseFloat(e.target.value))}
                            className="w-20 rounded border bg-background px-1 py-0.5 text-[10px] font-mono text-right"
                            title="Valor unitário — editar aqui recalcula o total"
                          />
                          {linha.ncm && <span className="ml-1">· NCM {linha.ncm}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={linha.valor_total ?? ''}
                          onChange={e => editarLinha(idx, 'valor_total', e.target.value === '' ? null : parseFloat(e.target.value))}
                          className="w-24 rounded border bg-background px-1 py-1 text-xs font-mono font-bold text-right"
                          title="Valor total — editar aqui recalcula o unitário"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {linha.carregandoSugestoes ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> buscando…
                          </span>
                        ) : (
                          <div className="space-y-1">
                            {/* Resumo do item selecionado (quando há) — badges de score, histórico e avisos */}
                            {itemSelecionado && (
                              <>
                                <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-wrap">
                                  {sugTop && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 rounded px-1 ${zona === 'alta' ? 'bg-emerald-500/15 text-emerald-700' : zona === 'media' ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}
                                      title={zona === 'alta' ? 'Alta confiança — auto-vinculado' : zona === 'media' ? 'Média confiança — requer confirmação' : 'Baixa confiança'}
                                    >
                                      {zona === 'alta' && <ShieldCheck className="h-2.5 w-2.5" />}
                                      {zona === 'media' && <HelpCircle className="h-2.5 w-2.5" />}
                                      {Math.round(sugTop.score_combined * 100)}%
                                    </span>
                                  )}
                                  {sugTop?.match_historico && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-700 px-1" title={sugTop.score_original != null ? `Item recorrente deste fornecedor (histórico). Score base: ${Math.round(sugTop.score_original * 100)}%` : 'Item recorrente deste fornecedor (histórico)'}>
                                      <Database className="h-2.5 w-2.5" /> histórico
                                    </span>
                                  )}
                                  {linha.confirmado && !precisaConf && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-700 px-1" title="Confirmado">
                                      <Check className="h-2.5 w-2.5" /> ok
                                    </span>
                                  )}
                                  {pedidoSel && <span className="rounded bg-blue-500/15 text-blue-700 px-1">→ #{pedidoSel.numero_pedido} (subst.)</span>}
                                </div>
                                {(() => {
                                  const avisos = calcularAvisos(linha, itemSelecionado)
                                  if (avisos.length === 0) return null
                                  return (
                                    <div className="flex gap-1 flex-wrap">
                                      {avisos.map((a, i) => (
                                        <span
                                          key={i}
                                          className={`inline-flex items-center gap-0.5 rounded px-1 text-[9px] ${a.severidade === 'red' ? 'bg-red-500/15 text-red-700' : 'bg-amber-500/15 text-amber-700'}`}
                                          title={a.detalhe ?? ''}
                                        >
                                          <AlertTriangle className="h-2.5 w-2.5" /> {a.texto}
                                        </span>
                                      ))}
                                    </div>
                                  )
                                })()}
                                {precisaConf && (
                                  <button
                                    onClick={() => {
                                      setExtracao(prev => prev ? {
                                        ...prev,
                                        itens: prev.itens.map((l, i) => i === idx ? { ...l, confirmado: true, precisaConfirmar: false } : l)
                                      } : prev)
                                    }}
                                    className="inline-flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 text-[10px] font-bold"
                                    title="Confirmar este match"
                                  >
                                    <Check className="h-2.5 w-2.5" /> Confirmar match
                                  </button>
                                )}
                              </>
                            )}
                            {/* Combobox de busca: substitui os antigos <select> limitados a 10 sugestões.
                                Mostra TODOS os itens do orçamento com busca livre + scroll. */}
                            <ItemPickerCombobox
                              value={linha.item_compra_id ?? null}
                              onChange={(itemId) => escolherItemParaLinha(idx, itemId)}
                              sugestoes={linha.sugestoesItens ?? []}
                              todosItens={itens as any}
                              placeholderQuery={linha.descricao}
                              onCriarItem={() => {
                                setCriandoItemIdx(idx)
                                const valor = linha.valor_unitario ?? linha.valor_total ?? 0
                                setNovoItemForm({
                                  descricao: linha.descricao,
                                  etapa_id: '',
                                  categoria: 'MATERIAL',
                                  valor_orcado: String(valor),
                                  codigo: '',
                                  unidade: linha.unidade ?? 'UN',
                                  qtd_total: linha.quantidade != null ? String(linha.quantidade) : '',
                                })
                              }}
                            />
                            {!itemSelecionado && (!linha.sugestoesItens || linha.sugestoesItens.length === 0) && (
                              <span className="text-[10px] text-muted-foreground italic">Sem match automático — busque ou crie</span>
                            )}
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
                              itens: prev.itens.map((l, i) => i === idx ? { ...l, acao, confirmado: true, precisaConfirmar: false } : l)
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
            {linhasAConfirmar > 0 && (
              <span className="text-[11px] text-amber-700 mr-2">
                Confirme {linhasAConfirmar} linha(s) antes de aplicar.
              </span>
            )}
            {divergenciaBloqueia && (
              <span className="text-[11px] text-red-700 mr-2">
                Aceite a diferença NF×linhas antes de aplicar.
              </span>
            )}
            <button onClick={() => { setExtracao(null); setTextoColado(''); setDiferencaAceita(false) }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
            <button
              onClick={aplicar}
              disabled={aplicando || linhasOk === 0 || linhasAConfirmar > 0 || divergenciaBloqueia}
              title={
                linhasAConfirmar > 0 ? 'Há linhas com match de média confiança que precisam ser confirmadas'
                : divergenciaBloqueia ? 'Soma das linhas difere do total da NF — aceite a diferença pra liberar'
                : ''
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
