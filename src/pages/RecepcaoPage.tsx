// Recepção de Documentos — wizard de entrada de NF/PDF/imagem/texto
// Fluxo: Upload → Extração (XML deterministico OU OpenAI) → Revisão linha-a-linha → Comitar
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { PageHeader } from '@/components/ui/PageHeader'
import { useProject } from '@/contexts/ProjectContext'
import { useFornecedores, usePedidos, STATUS_PEDIDO_ATIVO } from '@/hooks/useCompras'
import { useItensCompra } from '@/hooks/useCompras'

/** Pedidos elegíveis pra consumo via NF: TODOS os status ativos (não-cancelado).
 *  Inclui pagos/parcialmente_pagos porque é comum pagar antes da NF chegar — e
 *  quando a NF chega, ela precisa poder consumir o pedido pago pra dar baixa no
 *  recebimento. O gate "qtd > qtd_recebida + 0.001" já filtra os que realmente
 *  esgotaram saldo. (Bug 2026-05-15: antes era só ['planejado','pedido_enviado',
 *  'parcialmente_entregue'] — operadores reportaram que 'Consumir previsão' não
 *  aparecia em NFs cujos pedidos já tinham sido pagos no banco.) */
const STATUS_ELEGIVEIS_CONSUMO: readonly string[] = STATUS_PEDIDO_ATIVO
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { parseNfeXml } from '@/lib/recepcao/xmlNfeParser'
import { extrairDoc, extrairDocImagens, searchItensCompra, fileToBase64, carregarAliasesFornecedor, aplicarBoostHistorico, resolverFornecedorLocal, parsearPdf, type ItemMatchSugerido, type AliasMap, type PagamentoExtraido } from '@/lib/recepcao/api'
import { indexarEmbeddingsPendentes, embedQuery } from '@/lib/recepcao/indexador'
import { pdfFileToImages } from '@/lib/recepcao/pdfToImages'
import { processImageForVision, compressBase64Images } from '@/lib/recepcao/imageProcess'
// Nota: pdfFileToText e parseDanfe foram movidos pra edge function recepcao-pdf-parse
// (server-side), pra evitar o bug "value of readableStream" do pdfjs v5 no Vite.
import { ItemPickerCombobox } from '@/components/recepcao/ItemPickerCombobox'
import { gerarParcelas, localDate } from '@/lib/parcelas'
import { Inbox, FileText, Image as ImageIcon, Sparkles, Check, X, Trash2, AlertTriangle, Loader2, Database, Plus, ShieldCheck, HelpCircle, History } from 'lucide-react'
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

/** Parse Brazilian currency input: "1.234,56" → 1234.56 */
function parseBRL(v: string): number {
  if (!v) return 0
  const cleaned = v.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

/** Format number for input display: 1234.56 → "1234,56" */
function toBRLInput(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Parcela editável no header da recepção — antes de virar registro em `parcelas`. */
interface EditableParcela {
  id: string                  // local UUID, não persiste
  numero_parcela: number
  valor: string               // BRL input "1.234,56"
  data_vencimento: string     // YYYY-MM-DD
  descricao: string
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
  documento: {
    numero: string | null
    serie: string | null
    data_emissao: string | null
    data_vencimento: string | null
    valor_total: number | null
    /** NF-e — 44 dígitos. Usado pra detectar reaplicação de uma NF já aplicada (dedup). */
    chave_acesso?: string | null
    tipo: string
  }
  itens: LinhaExtraida[]
  observacoes?: string | null
  /** xml_nfe = parser determinístico de NF-e (rápido, custo zero).
   *  xml_outro = XML que não é NF-e (NFSe, CTe, qualquer schema) que caiu pro fallback IA.
   *  imagem / texto = IA Vision ou texto extraído de PDF.
   *  Persistido em recepcao_docs.origem (text livre, sem CHECK). */
  origem: 'xml_nfe' | 'xml_outro' | 'imagem' | 'texto'
  modelo?: string
  custo_cents?: number
  /** Dados de pagamento extraídos quando o doc contém boleto/PIX/TED.
   *  Persiste em recepcao_docs.raw_extracao (jsonb). UI mostra ao operador
   *  e — quando disponível — pré-popula data_vencimento / cond_pagamento. */
  pagamento?: PagamentoExtraido | null
}

/** Conflito de NF já aplicada (chave_acesso já existe pra esta company). */
interface ExistingDocConflict {
  id: string
  numero_doc: string | null
  fornecedor_nome: string | null
  valor_total: number | string | null
  data_emissao: string | null
  applied_at: string | null
}

export default function RecepcaoPage() {
  const { currentCompany } = useProject()
  // Setting que governa se o operador pode aplicar NF que estoura qtd/valor
  // dos pedidos planejados. Default OFF. Quando ON: banner amarelo + Aplicar
  // libera + RPC marca a sobra como fora_orcamento=true (não infla comprometido).
  const permitirEstouroOrcamento = Boolean(
    (currentCompany?.config as Record<string, unknown> | null | undefined)?.permitir_estouro_orcamento
  )
  const { data: itens = [] } = useItensCompra()
  const { data: fornecedores = [] } = useFornecedores()
  const { data: pedidos = [] } = usePedidos()
  const { data: etapas = [] } = useEtapas()

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
  // Condição de pagamento que o operador define no header da revisão.
  // Preenchida automaticamente do fornecedor cadastrado quando o CNPJ bate;
  // editável a qualquer momento. Atua como ATALHO pra (re)gerar a lista
  // de `editableParcelas` linearmente — depois disso o operador pode editar
  // valor/data/descrição de cada parcela individualmente.
  const [condPagamento, setCondPagamento] = useState<string>('')
  // Frete (CIF) que entra no total da NF mas NÃO é diluído nos itens.
  // BRL input ("1.234,56"). No aplicar(), vira `pedidos.valor_frete` do pedido âncora.
  const [valorFreteInput, setValorFreteInput] = useState<string>('')
  // Parcelas editáveis do pedido âncora. Substitui o input texto único de
  // cond. pagamento — operador edita valor/data/descrição direto na UI.
  // Geradas automaticamente a partir de `condPagamento` quando `parcelasManuallyEdited === false`.
  const [editableParcelas, setEditableParcelas] = useState<EditableParcela[]>([])
  const [parcelasManuallyEdited, setParcelasManuallyEdited] = useState(false)
  // Input controlado do "VALOR DA NF" — agora editável (era <p> readonly).
  // Sincroniza nos dois sentidos com extracao.documento.valor_total via parseBRL.
  // Necessário porque XML sem <ICMSTot> / OCR falho vinha com null e o operador
  // não conseguia corrigir manualmente — tinha que aceitar diferença gigante.
  const [valorTotalManualInput, setValorTotalManualInput] = useState<string>('')
  // Dedup pré-aplicação: setado quando a chave_acesso da NF já existe em
  // recepcao_docs (chave_acesso UNIQUE por company). Aciona dialog
  // "esta NF já foi aplicada — excluir e refazer?".
  const [existingDocConflict, setExistingDocConflict] = useState<ExistingDocConflict | null>(null)
  const [checandoDedup, setChecandoDedup] = useState(false)

  // C: lista de NFs aplicadas + exclusão (com reversão via trigger no banco)
  const qc = useQueryClient()
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ id: string; numero: string | null; fornecedor: string | null } | null>(null)
  // Rastreio: mostra em modal os efeitos que a NF gerou (consumo físico,
  // cobertura de previsão, pedido criado). Lê de v_recepcao_rastreio.
  const [rastreioDoc, setRastreioDoc] = useState<{ id: string; numero: string | null; fornecedor: string | null } | null>(null)
  const { data: rastreioRows = [], isFetching: rastreioLoading } = useQuery<Array<{
    consumo_id: string
    tipo: 'pedido_criado' | 'cobertura_previsao' | 'consumo_fisico' | 'outro'
    pedido_numero: number | null
    fornecedor_nome: string | null
    is_previsao: boolean
    item_codigo: string | null
    item_descricao: string | null
    delta_qtd_recebida: number | string | null
    valor_coberto_previsao: number | string | null
    vu_pedido: number | string | null
    vu_nf: number | string | null
    valor_efeito: number | string | null
  }>>({
    queryKey: ['recepcao_rastreio', rastreioDoc?.id],
    enabled: !!rastreioDoc,
    queryFn: async () => {
      if (!rastreioDoc) return []
      const { data, error } = await supabase
        .from('v_recepcao_rastreio')
        .select('*')
        .eq('doc_id', rastreioDoc.id)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
  const { data: docsAplicadas = [] } = useQuery<Array<{
    id: string; numero_doc: string | null; fornecedor_nome: string | null;
    valor_total: number | string | null; data_emissao: string | null; applied_at: string | null;
    qtdPedidosCriados: number; qtdConsumos: number;
  }>>({
    queryKey: ['recepcao_docs_aplicadas', currentCompany?.id],
    enabled: !!currentCompany,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recepcao_docs')
        .select('id, numero_doc, fornecedor_nome, valor_total, data_emissao, applied_at, recepcao_consumos(id, created_pedido_id)')
        .eq('company_id', currentCompany!.id)
        .order('applied_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((d: any) => ({
        id: d.id,
        numero_doc: d.numero_doc,
        fornecedor_nome: d.fornecedor_nome,
        valor_total: d.valor_total,
        data_emissao: d.data_emissao,
        applied_at: d.applied_at,
        qtdConsumos: (d.recepcao_consumos ?? []).length,
        qtdPedidosCriados: (d.recepcao_consumos ?? []).filter((c: any) => c.created_pedido_id != null).length,
      }))
    },
  })

  const excluirNF = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase.rpc('excluir_recepcao_doc', { p_doc_id: docId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('NF excluída · consumo revertido')
      qc.invalidateQueries({ queryKey: ['recepcao_docs_aplicadas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido_itens'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      setConfirmDeleteDoc(null)
    },
    onError: (err: any) => toast.error('Erro ao excluir NF: ' + (err?.message ?? String(err))),
  })

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
        // Tenta parser determinístico de NF-e primeiro (custo zero, exato).
        // Se for NFSe (qualquer município), CTe ou outro schema, parseNfeXml lança
        // "sem infNFe" — caímos pro fallback IA mandando o XML cru como texto.
        // A IA já está instruída a reconhecer NFSe/CTe/boleto e devolver o bloco pagamento.
        const text = await file.text()
        let parsedNfe: ReturnType<typeof parseNfeXml> | null = null
        try {
          parsedNfe = parseNfeXml(text)
        } catch {
          parsedNfe = null
        }
        if (parsedNfe) {
          await iniciarRevisao({
            fornecedor: parsedNfe.fornecedor,
            documento: { ...parsedNfe.documento, tipo: 'NFE' },
            itens: parsedNfe.itens,
            origem: 'xml_nfe',
          })
        } else {
          toast.info('XML não é NF-e padrão (provável NFSe/CTe). Extraindo via IA…')
          const r = await extrairDoc({ kind: 'texto', content: text, prompt_extra: 'Este é um XML — provavelmente NFSe (padrão ABRASF ou municipal) ou CTe. Extraia fornecedor/tomador, valor, vencimento e pagamento.' })
          await iniciarRevisao({
            fornecedor: r.fornecedor,
            documento: r.documento,
            itens: r.itens,
            observacoes: r.observacoes,
            origem: 'xml_outro',
            modelo: r._meta?.modelo,
            custo_cents: r._meta?.custo_cents,
            pagamento: r.pagamento ?? null,
          })
        }
      } else if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) {
        // Compressão + HEIC→JPEG client-side ANTES do upload. Resolve dois bugs:
        //   1) foto de celular > 5 MB estourava payload da edge function (erro genérico)
        //   2) HEIC do iPhone não era aceito pela Vision API (e nem o browser decodifica nativo)
        const processed = await processImageForVision(file)
        if (processed.comprimida) {
          const ratio = (processed.finalBytes / processed.originalBytes * 100).toFixed(0)
          toast.info(`Imagem otimizada: ${(processed.originalBytes / 1024).toFixed(0)} KB → ${(processed.finalBytes / 1024).toFixed(0)} KB (${ratio}%)`)
        }
        const r = await extrairDoc({ kind: 'imagem', content: processed.base64 })
        await iniciarRevisao({
          fornecedor: r.fornecedor,
          documento: r.documento,
          itens: r.itens,
          observacoes: r.observacoes,
          origem: 'imagem',
          modelo: r._meta?.modelo,
          custo_cents: r._meta?.custo_cents,
          pagamento: r.pagamento ?? null,
        })
      } else if (ext === 'pdf') {
        // PDF — política de roteamento (2026-05):
        //   1. file.size > 3 MB           → skip recepcao-pdf-parse (estoura body
        //                                    da edge function 6MB com base64+JSON).
        //                                    Rasteriza no client → 1 call Vision.
        //   2. PDF de 1 página            → tenta recepcao-pdf-parse:
        //                                    - DANFE-padrão → usa direto (custo 0)
        //                                    - texto → IA via kind=texto
        //                                    - erro/escaneado → rasteriza
        //   3. PDF de 2+ páginas          → tenta recepcao-pdf-parse SÓ pra ver se
        //                                    é DANFE-padrão com qualidade alta;
        //                                    caso contrário rasteriza tudo e
        //                                    manda em 1 call Vision com kind=imagens.
        //                                    Razão: o parser de texto coord-based
        //                                    do unpdf perde itens entre páginas e a
        //                                    IA com texto puro de 2+ pgs vinha
        //                                    devolvendo só p1.
        const t0 = performance.now()
        const sizeMb = (file.size / 1_048_576).toFixed(2)
        console.log(`[recepcao] PDF: ${file.name} · ${sizeMb} MB`)

        const SKIP_SERVER_MB = 3
        const skipServer = file.size > SKIP_SERVER_MB * 1_048_576

        let resp: Awaited<ReturnType<typeof parsearPdf>> | null = null
        if (skipServer) {
          toast.info(`PDF grande (${sizeMb} MB) — pulando server parser, indo direto pra IA Vision…`)
          console.log(`[recepcao] PDF > ${SKIP_SERVER_MB} MB — skip recepcao-pdf-parse`)
        } else {
          toast.info('Enviando PDF pro servidor…')
          const b64 = await fileToBase64(file)
          const tParseStart = performance.now()
          try {
            resp = await parsearPdf(b64)
            console.log(`[recepcao] recepcao-pdf-parse: ${Math.round(performance.now() - tParseStart)}ms · kind=${resp.kind} · paginas=${resp.paginas ?? '?'}`)
          } catch (err) {
            console.warn(`[recepcao] recepcao-pdf-parse FAIL em ${Math.round(performance.now() - tParseStart)}ms:`, err)
            resp = { kind: 'erro', erro: err instanceof Error ? err.message : String(err) }
          }
        }

        const paginasServer = resp?.paginas ?? 0
        const ehMultipagina = paginasServer > 1

        // Caminho ouro: DANFE-padrão (server entregou estrutura pronta) — confia
        // mesmo em multipágina, porque o parser deterministico exige qualidade ≥ 0.5.
        if (resp?.kind === 'danfe' && resp.danfe && resp.danfe.itens.length >= 1) {
          toast.success(`DANFE parseada: ${resp.danfe.itens.length} itens, ${Math.round(resp.danfe.qualidade * 100)}% validação. Sem IA, custo zero.`)
          console.log(`[recepcao] DANFE-padrão · total ${Math.round(performance.now() - t0)}ms`)
          await iniciarRevisao({
            fornecedor: resp.danfe.fornecedor,
            documento: resp.danfe.documento,
            itens: resp.danfe.itens,
            observacoes: resp.danfe.observacoes,
            origem: 'texto',
            modelo: 'parser_danfe_server',
            custo_cents: 0,
          })
        } else if (resp?.kind === 'texto' && resp.texto && !ehMultipagina) {
          // PDF de 1 página com texto extraível mas não-DANFE-padrão → IA via texto.
          // Multipágina NÃO entra aqui (cai pro raster) — parser de texto perde itens
          // entre páginas e a IA com texto truncado devolvia só fornecedor da p1.
          toast.info(`Texto extraído do PDF (${(resp.total_chars ?? 0).toLocaleString('pt-BR')} chars) — extraindo via IA…`)
          const tIaStart = performance.now()
          const r = await extrairDoc({ kind: 'texto', content: resp.texto })
          console.log(`[recepcao] IA texto: ${Math.round(performance.now() - tIaStart)}ms · total ${Math.round(performance.now() - t0)}ms`)
          await iniciarRevisao({
            fornecedor: r.fornecedor,
            documento: r.documento,
            itens: r.itens,
            observacoes: r.observacoes,
            origem: 'texto',
            modelo: r._meta?.modelo,
            custo_cents: r._meta?.custo_cents,
            pagamento: r.pagamento ?? null,
          })
        } else {
          // Caminho universal pra qualquer PDF problemático:
          //   - skipServer=true (PDF grande)
          //   - resp.kind='erro' (escaneado ou falha na edge function)
          //   - multipágina sem DANFE-padrão (mais confiável rasterizar)
          //
          // Rasteriza no client com pdfjs legacy, comprime cada página (max 2000px,
          // JPEG q=0.85) e manda TODAS as páginas em UMA call Vision via kind='imagens'.
          // A IA vê o doc inteiro, fornecedor/totais saem uma vez, itens fluem.
          const motivo = skipServer ? `PDF grande (${sizeMb} MB)`
                       : resp?.kind === 'erro' ? `erro do servidor: ${resp.erro}`
                       : ehMultipagina ? `${paginasServer} páginas — rasterizando pra IA ver junto`
                       : 'PDF sem texto extraível (escaneado)'
          toast.info(`${motivo} — convertendo em imagens pra IA Vision…`)
          const tRasterStart = performance.now()
          let paginasRaw: Awaited<ReturnType<typeof pdfFileToImages>>
          try {
            paginasRaw = await pdfFileToImages(file)
          } catch (err) {
            console.error('[recepcao] pdfFileToImages FAIL:', err)
            toast.error('Falha ao abrir PDF no navegador: ' + (err instanceof Error ? err.message : String(err)))
            return
          }
          console.log(`[recepcao] raster: ${paginasRaw.length} págs em ${Math.round(performance.now() - tRasterStart)}ms`)
          if (paginasRaw.length === 0) {
            toast.error('PDF sem páginas')
            return
          }
          const paginas = await compressBase64Images(paginasRaw)
          const totalKb = Math.round(paginas.reduce((s, p) => s + p.finalBytes, 0) / 1024)
          console.log(`[recepcao] payload final Vision: ${totalKb} KB`)
          toast.info(`Extraindo ${paginas.length} página(s) em 1 chamada Vision (${totalKb} KB)…`)
          const tVisionStart = performance.now()
          let r: Awaited<ReturnType<typeof extrairDocImagens>>
          try {
            r = await extrairDocImagens({
              images: paginas.map(p => ({ base64: p.base64, mime: p.mime })),
              prompt_extra: paginas.length > 1
                ? `Documento de ${paginas.length} páginas. Trate como UM único documento — fornecedor e totais aparecem UMA VEZ. A tabela de itens pode continuar entre páginas.`
                : undefined,
            })
          } catch (err) {
            console.error(`[recepcao] Vision FAIL em ${Math.round(performance.now() - tVisionStart)}ms:`, err)
            toast.error('Falha na extração via IA Vision: ' + (err instanceof Error ? err.message : String(err)))
            return
          }
          console.log(`[recepcao] Vision: ${Math.round(performance.now() - tVisionStart)}ms · total ${Math.round(performance.now() - t0)}ms`)
          await iniciarRevisao({
            fornecedor: r.fornecedor,
            documento: r.documento,
            itens: r.itens,
            observacoes: r.observacoes,
            origem: 'imagem',
            modelo: r._meta?.modelo,
            custo_cents: r._meta?.custo_cents,
            pagamento: r.pagamento ?? null,
          })
        }
      } else {
        // Fallback genérico: extensão desconhecida (txt, csv, doc, etc.) — tenta ler como texto e mandar pra IA.
        // Único caso que ainda falha duro: arquivos binários não-suportados (zip, docx, etc.) — caem no catch.
        try {
          const text = await file.text()
          if (text.trim().length < 10) throw new Error('arquivo vazio ou binário ilegível')
          toast.info(`Formato .${ext} — tentando extração via IA…`)
          const r = await extrairDoc({ kind: 'texto', content: text })
          await iniciarRevisao({
            fornecedor: r.fornecedor,
            documento: r.documento,
            itens: r.itens,
            observacoes: r.observacoes,
            origem: 'texto',
            modelo: r._meta?.modelo,
            custo_cents: r._meta?.custo_cents,
            pagamento: r.pagamento ?? null,
          })
        } catch {
          toast.error(`Formato nao suportado (${ext}). Use XML, PDF, JPG, PNG, WEBP ou HEIC.`)
        }
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
        pagamento: r.pagamento ?? null,
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
    // Sobrescreve o nome do fornecedor com o cadastrado no banco quando o CNPJ
    // bate. Resolve casos onde o parser pegou texto errado (natureza da operação,
    // protocolo, etc.) mas o CNPJ extraído da chave de acesso está correto.
    const cnpjLimpo = e.fornecedor.cnpj?.replace(/\D/g, '') ?? ''
    const fornCadastrado = cnpjLimpo
      ? (fornecedores as any[]).find(f => (f.cnpj ?? '').replace(/\D/g, '') === cnpjLimpo)
      : null
    const fornecedorAjustado = fornCadastrado
      ? { ...e.fornecedor, nome: fornCadastrado.nome }
      : e.fornecedor
    const extracaoAjustada = { ...e, fornecedor: fornecedorAjustado }

    const linhas: LinhaExtraida[] = e.itens.map((i: any) => ({ ...i, carregandoSugestoes: true }))
    // Fallback do "valor total da NF": se XML/OCR não trouxe (vNF ausente, NFC-e, foto baixa
    // qualidade), pré-preenche com a soma dos itens — o operador pode editar depois. Antes era
    // null e a UI mostrava diferença gigante sem deixar editar.
    const valorTotalEfetivo = extracaoAjustada.documento.valor_total ?? (linhas.reduce((s, l) => s + (l.valor_total ?? 0), 0) || null)
    const extracaoComFallback = {
      ...extracaoAjustada,
      documento: { ...extracaoAjustada.documento, valor_total: valorTotalEfetivo },
      itens: linhas,
    } as Extracao
    setExtracao(extracaoComFallback)
    setValorTotalManualInput(valorTotalEfetivo != null ? toBRLInput(valorTotalEfetivo) : '')
    setDiferencaAceita(false)
    setExistingDocConflict(null)
    // Pré-preenche cond. pagamento com a default do fornecedor (se cadastrado),
    // ou da extração (raro NFs trazerem essa info, mas se a IA extraiu, respeita).
    setCondPagamento(fornCadastrado?.cond_pagamento_padrao ?? '')
    if (fornCadastrado) {
      toast.info(`Fornecedor reconhecido pelo CNPJ: ${fornCadastrado.nome}`)
    }
    if (!currentCompany) return
    // Dedup: se a NF traz chave_acesso (44 dígitos), pergunta ao banco se já foi aplicada
    // nesta company. Em caso afirmativo, abre dialog "excluir e refazer".
    const chave = (extracaoAjustada.documento.chave_acesso ?? '').replace(/\D/g, '')
    if (chave.length === 44) {
      setChecandoDedup(true)
      try {
        const { data: existente, error } = await supabase
          .rpc('recepcao_doc_por_chave', { p_company_id: currentCompany.id, p_chave_acesso: chave })
          .maybeSingle<ExistingDocConflict>()
        if (error) {
          console.warn('Falha ao checar duplicidade de NF:', error)
        } else if (existente) {
          setExistingDocConflict(existente)
          toast.warning(`Esta NF já foi aplicada em ${existente.applied_at ? new Date(existente.applied_at).toLocaleString('pt-BR') : '?'} — confira o painel no topo.`)
        }
      } finally {
        setChecandoDedup(false)
      }
    }
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
            // Match SÓ POR ITEM (não filtra fornecedor): qualquer pedido com saldo
            // pra consumir conta. Pós split_pedidos_header_e_itens o item_compra_id
            // do header é legado — temos que olhar dentro de `pedido.itens` (estrutura
            // nova) E só considerar quem ainda tem saldo (qtd > qtd_recebida).
            const pedidoExistente = pedidos.find(p =>
              STATUS_ELEGIVEIS_CONSUMO.includes(p.status)
              && (p.itens ?? []).some(pi =>
                pi.item_compra_id === top.item_id
                && Number(pi.qtd ?? 0) > Number(pi.qtd_recebida ?? 0) + 0.001
              )
            )
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
  const valorFrete = parseBRL(valorFreteInput)
  // Total a parcelar = itens + frete. É o que precisa bater com a NF e com a soma das parcelas.
  const totalAParcelar = totalLinhas + valorFrete
  const diferenca = (extracao?.documento.valor_total ?? 0) - totalAParcelar
  // F1.5: tolerância = 1 centavo (R$ 0,01). Acima disso, exige aceite explícito do operador.
  const TOLERANCIA_DIFERENCA = 0.01
  const temDivergencia = Math.abs(diferenca) > TOLERANCIA_DIFERENCA
  const divergenciaBloqueia = temDivergencia && !diferencaAceita
  // Conferência soma das parcelas == total a parcelar (tolerância 1 cent).
  const parcelasSoma = editableParcelas.reduce((s, p) => s + parseBRL(p.valor), 0)
  const parcelasDiff = Math.abs(parcelasSoma - totalAParcelar)
  const parcelasOk = parcelasDiff <= 0.01

  // Regera `editableParcelas` automaticamente sempre que (total a parcelar, cond. pagamento,
  // data de emissão) mudarem — desde que o operador NÃO tenha mexido manualmente. Quem mexer
  // numa parcela individual seta `parcelasManuallyEdited = true` e congela a auto-geração até
  // clicar em "Redistribuir".
  useEffect(() => {
    if (parcelasManuallyEdited) return
    if (!extracao || totalAParcelar <= 0 || !condPagamento.trim()) {
      setEditableParcelas([])
      return
    }
    const dataBase = extracao.documento.data_emissao ? localDate(extracao.documento.data_emissao) : new Date()
    try {
      const generated = gerarParcelas({
        pedidoId: 'preview', companyId: 'preview',
        valorTotal: totalAParcelar,
        condPagamento: condPagamento.trim(),
        dataEntrega: dataBase,
      })
      setEditableParcelas(generated.map(p => ({
        id: crypto.randomUUID(),
        numero_parcela: p.numero_parcela,
        valor: toBRLInput(p.valor),
        data_vencimento: p.data_vencimento,
        descricao: '',
      })))
    } catch (err) {
      console.warn('gerarParcelas falhou:', err)
    }
  }, [totalAParcelar, condPagamento, extracao?.documento.data_emissao, parcelasManuallyEdited])

  const addParcela = () => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => [...prev, {
      id: crypto.randomUUID(),
      numero_parcela: prev.length + 1,
      valor: '0,00',
      data_vencimento: extracao?.documento.data_emissao || new Date().toISOString().slice(0, 10),
      descricao: '',
    }])
  }

  const removeParcela = (id: string) => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => prev
      .filter(p => p.id !== id)
      .map((p, i) => ({ ...p, numero_parcela: i + 1 })))
  }

  const updateParcela = (id: string, field: 'valor' | 'data_vencimento' | 'descricao', value: string) => {
    setParcelasManuallyEdited(true)
    setEditableParcelas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const redistribuirParcelas = () => {
    setParcelasManuallyEdited(false) // re-dispara o useEffect acima
  }
  // Uma linha está "ok pra aplicar" se tem ação ≠ ignorar e não está pendente de confirmação
  const linhasOk = extracao?.itens.filter(l => l.acao && l.acao !== 'ignorar' && !(l.precisaConfirmar && !l.confirmado)).length ?? 0
  const linhasAConfirmar = extracao?.itens.filter(l => l.precisaConfirmar && !l.confirmado).length ?? 0
  const linhasAutoOk = extracao?.itens.filter(l => l.confirmado && l.acao && l.acao !== 'ignorar' && (l.acao === 'criar_pedido' || l.acao === 'substituir_pedido')).length ?? 0
  const linhasCriarItem = extracao?.itens.filter(l => l.acao === 'criar_item').length ?? 0
  // Pedidos que vão ser consumidos/cobertos ao aplicar — IDs únicos pra mostrar lista.
  // isPrevisao=true significa cobertura financeira (não consumo de quantidade).
  const previsoesACancelar = useMemo(() => {
    if (!extracao) return [] as { pedidoId: string; numero: number | null; itemDescricao: string; valor: number; linhasNF: number[]; isPrevisao: boolean }[]
    const map = new Map<string, { pedidoId: string; numero: number | null; itemDescricao: string; valor: number; linhasNF: number[]; isPrevisao: boolean }>()
    extracao.itens.forEach((l, idx) => {
      if (l.acao !== 'substituir_pedido' || !l.pedido_substituido_id) return
      const ped = pedidos.find(p => p.id === l.pedido_substituido_id)
      if (!ped) return
      const itemInfo = itens.find(i => i.id === ped.item_compra_id)
      const entry = map.get(ped.id)
      if (entry) {
        entry.linhasNF.push(idx + 1)
      } else {
        map.set(ped.id, {
          pedidoId: ped.id,
          numero: ped.numero_pedido,
          itemDescricao: itemInfo?.descricao ?? ped.item_descricao ?? '—',
          valor: Number(ped.valor_total_real ?? 0),
          linhasNF: [idx + 1],
          isPrevisao: (ped as any).is_previsao_orcamento === true,
        })
      }
    })
    return Array.from(map.values())
  }, [extracao, pedidos, itens])

  /**
   * Estouros AGRUPADOS POR item_compra_id: quando a soma da qtd OU valor das
   * linhas "substituir_pedido" pra um mesmo item excede o saldo agregado dos
   * pedidos planejados elegíveis.
   *
   * Por que agregar: se 5 linhas da NF apontam pro mesmo item de orçamento e
   * cada uma individualmente cabe no saldo, mas a SOMA excede, o FIFO esgota
   * saldo no meio e a transação aborta com "inconsistência". Agregar aqui
   * detecta isso ANTES, mostra mensagem clara e bloqueia o Aplicar.
   *
   * Regra (decidida 2026-05-15): "Consumir previsão" não tolera estouro.
   * Operador precisa ou (a) ajustar a qtd/valor do pedido em Compras pra
   * acomodar, ou (b) trocar a ação de uma ou mais linhas para "Criar pedido novo".
   */
  const estourosPorItem = useMemo(() => {
    const out = new Map<string, {
      itemId: string
      itemDescricao: string
      ordens: number[]      // ordens das linhas NF (idx + 1) que apontam pro item
      qtdTotal: number
      valorTotal: number
      saldoQtd: number
      saldoValor: number
      excQtd: number
      excValor: number
    }>()
    if (!extracao) return out
    // 1) Agrega qtd e valor por item_compra_id
    const agg = new Map<string, { qtdTotal: number; valorTotal: number; ordens: number[]; descricoes: Set<string> }>()
    extracao.itens.forEach((linha, idx) => {
      if (linha.acao !== 'substituir_pedido' || !linha.item_compra_id) return
      const qtd = Number(linha.quantidade ?? 0)
      const vu = Number(linha.valor_unitario ?? 0)
      const valor = Number(linha.valor_total ?? (qtd * vu))
      const key = linha.item_compra_id
      const cur = agg.get(key) ?? { qtdTotal: 0, valorTotal: 0, ordens: [], descricoes: new Set<string>() }
      cur.qtdTotal += qtd
      cur.valorTotal += valor
      cur.ordens.push(idx + 1)
      cur.descricoes.add(linha.descricao)
      agg.set(key, cur)
    })
    // 2) Pra cada item agregado, calcula saldo dos pedidos elegíveis e compara.
    //    Pedidos com is_previsao_orcamento=true contribuem só pra saldoValor
    //    (consumo por VALOR, qtd é fictícia). Pedidos normais contribuem pros 2.
    for (const [itemId, ag] of agg.entries()) {
      let saldoQtd = 0
      let saldoValor = 0
      for (const p of pedidos) {
        if (!STATUS_ELEGIVEIS_CONSUMO.includes(p.status)) continue
        const isPrevisao = (p as any).is_previsao_orcamento === true
        if (isPrevisao) {
          // Saldo financeiro disponível da previsão (aproximação cliente-side:
          // valor_total - valor_coberto_por_realizacao; o front não tem o
          // SUM(parcelas.valor_pago) facilmente; a RPC recalcula exato).
          const piMatch = (p.itens ?? []).find(pi => pi.item_compra_id === itemId)
          if (!piMatch) continue
          const valorTotal = Number(p.valor_total_real ?? 0)
          const coberto = Number((p as any).valor_coberto_por_realizacao ?? 0)
          saldoValor += Math.max(valorTotal - coberto, 0)
          // NÃO incrementa saldoQtd: previsão não consome qtd
          continue
        }
        for (const pi of (p.itens ?? [])) {
          if (pi.item_compra_id !== itemId) continue
          const dispQtd = Math.max(Number(pi.qtd ?? 0) - Number(pi.qtd_recebida ?? 0), 0)
          if (dispQtd <= 0.001) continue
          saldoQtd += dispQtd
          saldoValor += dispQtd * Number(pi.valor_unitario_real ?? 0)
        }
      }
      // Pra estouro de QTD: só conta se ag.qtdTotal > saldoQtd E há pelo menos
      // saldoQtd > 0 (i.e., existe pedido NORMAL pra esse item). Se o item só
      // tem previsões, qtd não estoura — a NF cobre por valor.
      const excQtd = saldoQtd > 0 ? (ag.qtdTotal - saldoQtd) : 0
      const excValor = ag.valorTotal - saldoValor
      if (excQtd > 0.001 || excValor > 0.01) {
        const itemBd = itens.find(i => i.id === itemId)
        const itemDescricao = itemBd?.descricao ?? Array.from(ag.descricoes).join(' / ')
        out.set(itemId, {
          itemId,
          itemDescricao,
          ordens: ag.ordens,
          qtdTotal: ag.qtdTotal,
          valorTotal: ag.valorTotal,
          saldoQtd, saldoValor,
          excQtd: Math.max(excQtd, 0),
          excValor: Math.max(excValor, 0),
        })
      }
    }
    return out
  }, [extracao, pedidos, itens])

  /**
   * F2.a — DUPLICAÇÃO POTENCIAL: linhas que vão criar pedido novo mas o item já
   * tem pedido planejado com saldo. É EXATAMENTE o cenário que gera os
   * pedidos-fantasma (caso #538 DIMARCK vs #652-#655 EGX): a NF chega com um
   * fornecedor diferente do pedido, ou a IA não casou o item, ou o operador
   * escolheu "Criar pedido novo" sem perceber que tinha previsão pra consumir.
   *
   * Em vez de só desabilitar a opção "Consumir previsão" silenciosamente (como
   * hoje), agora MOSTRAMOS proativamente: "linha X da NF tem item ligado ao
   * pedido planejado #N (saldo Y) que NÃO será consumido — clique pra vincular".
   *
   * Não bloqueia (operador pode preferir mesmo criar pedido novo, ex: pedido
   * original é doutra obra), só avisa + oferece 1 clique pra resolver.
   */
  const pedidosOrfaosMesmoItem = useMemo(() => {
    const out: Array<{
      linhaIdx: number
      linhaDescricao: string
      pedidoId: string
      pedidoNumero: number | null
      fornecedorNomePedido: string | null
      itemDescricao: string
      saldoQtd: number
      saldoValor: number
      isPrevisao: boolean
    }> = []
    if (!extracao) return out
    extracao.itens.forEach((linha, idx) => {
      // Só linhas que vão CRIAR pedido (não estão consumindo). 'criar_item' não
      // tem item_compra_id ainda, então não entra (cai no else).
      if (linha.acao !== 'criar_pedido') return
      if (!linha.item_compra_id) return
      for (const ped of pedidos) {
        if (!STATUS_ELEGIVEIS_CONSUMO.includes(ped.status)) continue
        const isPrevisao = (ped as any).is_previsao_orcamento === true
        if (isPrevisao) {
          // Previsão de orçamento: oferece consumo por VALOR. Saldo efetivo =
          // valor_total - parcelas pagas - valor_coberto_por_realizacao.
          // Como o front não tem o SUM(valor_pago) facilmente acessível por pedido
          // aqui, usamos uma aproximação conservadora: valor_total - coberto.
          // O backend RPC recalcula com precisão e nunca excede o saldo real.
          const valorTotal = Number(ped.valor_total_real ?? 0)
          const coberto = Number((ped as any).valor_coberto_por_realizacao ?? 0)
          const saldoFinanceiroAprox = Math.max(valorTotal - coberto, 0)
          if (saldoFinanceiroAprox <= 0.01) continue
          // Verifica se algum pedido_item do pedido bate o item_compra_id da linha
          const piMatch = (ped.itens ?? []).find(pi => pi.item_compra_id === linha.item_compra_id)
          if (!piMatch) continue
          out.push({
            linhaIdx: idx,
            linhaDescricao: linha.descricao,
            pedidoId: ped.id,
            pedidoNumero: ped.numero_pedido,
            fornecedorNomePedido: ped.fornecedor_nome ?? null,
            itemDescricao: itens.find(i => i.id === linha.item_compra_id)?.descricao ?? linha.descricao,
            saldoQtd: 0,                       // previsão não tem qtd real
            saldoValor: saldoFinanceiroAprox,  // saldo financeiro
            isPrevisao: true,
          })
          continue
        }
        // Pedidos normais: oferece consumo por QTD
        for (const pi of (ped.itens ?? [])) {
          if (pi.item_compra_id !== linha.item_compra_id) continue
          const saldoQtd = Math.max(Number(pi.qtd ?? 0) - Number(pi.qtd_recebida ?? 0), 0)
          if (saldoQtd <= 0.001) continue
          out.push({
            linhaIdx: idx,
            linhaDescricao: linha.descricao,
            pedidoId: ped.id,
            pedidoNumero: ped.numero_pedido,
            fornecedorNomePedido: ped.fornecedor_nome ?? null,
            itemDescricao: itens.find(i => i.id === linha.item_compra_id)?.descricao ?? linha.descricao,
            saldoQtd,
            saldoValor: saldoQtd * Number(pi.valor_unitario_real ?? 0),
            isPrevisao: false,
          })
        }
      }
    })
    return out
  }, [extracao, pedidos, itens])

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
    // Match SÓ POR ITEM (sem fornecedor) — busca em pedido_itens (estrutura nova)
    // e considera apenas pedidos com saldo aberto.
    const pedidoExistente = novoItemId
      ? pedidos.find(p =>
          STATUS_ELEGIVEIS_CONSUMO.includes(p.status)
          && (p.itens ?? []).some(pi =>
            pi.item_compra_id === novoItemId
            && Number(pi.qtd ?? 0) > Number(pi.qtd_recebida ?? 0) + 0.001
          )
        )
      : undefined
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

  /** F2.a — vincula uma linha da NF a um pedido planejado existente com 1 clique.
   * Usado pelo banner "pedidos planejados ignorados". Troca a ação pra
   * 'substituir_pedido' e seta o pedido_substituido_id alvo. */
  const vincularLinhaAPedido = (idx: number, pedidoId: string) => {
    setExtracao(prev => prev ? {
      ...prev,
      itens: prev.itens.map((l, i) => i === idx ? {
        ...l,
        acao: 'substituir_pedido',
        pedido_substituido_id: pedidoId,
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

  /**
   * Aplica a NF chamando a RPC atômica `aplicar_recepcao_nf(payload jsonb)`.
   *
   * Antes (até 2026-05-15) este fluxo eram ~12 operações Supabase sequenciais no
   * client — sem envelope transacional. Falha no meio (ex: insert de
   * recepcao_consumos) deixava NF "meio aplicada" sem como reverter.
   *
   * Agora a RPC envelopa tudo (insert doc → consumo FIFO → cria âncora →
   * snapshot+regenera parcelas → log → matches) numa única transação.
   * Erro em qualquer passo = rollback completo (DB volta ao estado anterior).
   *
   * Também resolve o "consumo fantasma": a RPC rejeita NFs com chave_acesso
   * já existente, a menos que o operador autorize substituição
   * (force_replace_doc_id) — caso em que o doc antigo é deletado primeiro
   * (devolve qtd_recebida, restaura snapshots) e a nova versão é aplicada.
   */
  const aplicar = async (opts?: { forceReplaceDocId?: string }) => {
    if (!extracao || !currentCompany) return
    setAplicando(true)
    try {

      // Monta o payload em jsonb para a RPC atômica.
      const payload = {
        company_id: currentCompany.id,
        force_replace_doc_id: opts?.forceReplaceDocId ?? null,
        cond_pagamento: condPagamento.trim() || null,
        fornecedor: {
          nome: extracao.fornecedor.nome,
          cnpj: extracao.fornecedor.cnpj?.replace(/\D/g, '') ?? null,
        },
        doc: {
          origem: extracao.origem,
          numero: extracao.documento.numero,
          serie: extracao.documento.serie,
          data_emissao: extracao.documento.data_emissao,
          valor_total: extracao.documento.valor_total,
          valor_frete: valorFrete,
          chave_acesso: extracao.documento.chave_acesso ?? null,
          modelo_ia: extracao.modelo ?? null,
          custo_ia_cents: extracao.custo_cents ?? 0,
          raw_extracao: extracao,
        },
        linhas: extracao.itens.map((l, idx) => ({
          ordem: l.ordem ?? idx,
          descricao: l.descricao,
          ncm: l.ncm,
          unidade: l.unidade,
          quantidade: l.quantidade,
          valor_unitario: l.valor_unitario,
          valor_total: l.valor_total,
          acao: l.acao ?? 'ignorar',
          item_compra_id: l.item_compra_id ?? null,
          pedido_substituido_id: l.pedido_substituido_id ?? null,
          sugestoes: l.sugestoesItens ?? null,
          observacao: l.observacao ?? null,
        })),
        parcelas: editableParcelas.map(ep => ({
          numero_parcela: ep.numero_parcela,
          valor: parseBRL(ep.valor),
          data_vencimento: ep.data_vencimento,
          descricao: ep.descricao || null,
        })),
      }

      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc('aplicar_recepcao_nf', { payload })

      // Se a RPC rejeitou por duplicidade (chave_acesso já existe), o HINT carrega o doc_id
      // existente e o front pode dispor o dialog "Excluir e refazer".
      if (rpcErr) {
        const hint = (rpcErr as any).hint as string | undefined
        const code = (rpcErr as any).code as string | undefined
        if (code === '23505' && hint && !opts?.forceReplaceDocId) {
          // Carrega info do doc existente pra mostrar diálogo
          const { data: existente } = await supabase
            .from('recepcao_docs')
            .select('id, numero_doc, fornecedor_nome, valor_total, data_emissao, applied_at')
            .eq('id', hint)
            .maybeSingle()
          if (existente) {
            setExistingDocConflict(existente as ExistingDocConflict)
            toast.warning('Esta NF já foi aplicada. Confira o painel no topo pra excluir e refazer.')
            return
          }
        }
        throw rpcErr
      }

      const result = (rpcResult ?? {}) as {
        doc_id?: string
        novo_pedido_id?: string | null
        pedidos_consumidos_count?: number
        itens_novos_count?: number
        linhas_ignoradas_count?: number
        parcelas_preservadas_count?: number
        pedido_ancora_sem_itens?: boolean
        replaced_doc_id?: string | null
        warnings?: string[]
      }

      // Toast resumido com base no que a RPC reportou
      const partes: string[] = []
      if ((result.pedidos_consumidos_count ?? 0) > 0) partes.push(`${result.pedidos_consumidos_count} previsão(ões) consumida(s)`)
      if (result.novo_pedido_id) {
        const sufixo = result.pedido_ancora_sem_itens ? ' (âncora financeiro)' : ` com ${result.itens_novos_count ?? 0} item(s)`
        partes.push(`1 pedido novo${sufixo}`)
      }
      if (valorFrete > 0) partes.push(`frete ${formatCurrency(valorFrete)}`)
      if (editableParcelas.length > 0) partes.push(`${editableParcelas.length} parcela(s)`)
      if ((result.linhas_ignoradas_count ?? 0) > 0) partes.push(`${result.linhas_ignoradas_count} linha(s) ignorada(s)`)
      if (result.replaced_doc_id) partes.unshift('NF anterior substituída')
      toast.success(`NF aplicada · ${partes.join(' · ') || 'nada a aplicar'}`)
      for (const w of (result.warnings ?? [])) toast.warning(w)

      // Invalida queries que a UI consome (pedidos, parcelas, recepcao_docs aplicadas)
      qc.invalidateQueries({ queryKey: ['recepcao_docs_aplicadas'] })
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido_itens'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })

      setExtracao(null)
      setTextoColado('')
      setDiferencaAceita(false)
      setCondPagamento('')
      setValorFreteInput('')
      setEditableParcelas([])
      setParcelasManuallyEdited(false)
      setValorTotalManualInput('')
      setExistingDocConflict(null)
    } catch (err) {
      // Extrai mensagem útil de qualquer formato de erro (Error nativo, PostgrestError, etc.)
      const e: any = err
      let msg: string
      if (e instanceof Error) msg = e.message
      else if (e && typeof e === 'object') msg = e.message ?? e.details ?? e.hint ?? e.error_description ?? JSON.stringify(e).slice(0, 300)
      else msg = String(e)
      console.error('[recepcao] erro ao aplicar:', err)
      toast.error('Erro ao aplicar: ' + msg)
    } finally {
      setAplicando(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
      // NFSe de algumas prefeituras vem com MIME genérico — text/plain aceita pra não bloquear
      'text/plain': ['.xml', '.txt'],
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
      // HEIC/HEIF do iPhone — convertidos client-side em processImageForVision
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
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
                <p className="text-xs text-muted-foreground">Formatos: .xml (NF-e/NFSe/CTe) · .pdf (multi-pagina) · .jpg/.png/.webp/.heic (IA Vision)</p>
                <p className="text-[10px] text-muted-foreground">PDFs multi-pagina viram 1 chamada Vision unificada. Imagens grandes/HEIC sao otimizadas automaticamente antes do upload.</p>
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

          {/* C: Lista de NFs aplicadas — permite excluir e reverter o consumo
              via trigger no banco (recepcao_consumos → fn_recepcao_doc_revert_consumo).
              Substitui a prática insegura de apagar pelo Studio. */}
          {docsAplicadas.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Últimas NFs aplicadas</h3>
                <span className="text-[10px] text-muted-foreground">excluir reverte automaticamente o consumo nos pedidos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[9px] uppercase text-muted-foreground border-b">
                      <th className="py-1.5 text-left">NF</th>
                      <th className="py-1.5 text-left">Fornecedor</th>
                      <th className="py-1.5 text-left">Data emissão</th>
                      <th className="py-1.5 text-left">Aplicada em</th>
                      <th className="py-1.5 text-right">Valor</th>
                      <th className="py-1.5 text-center">Impacto</th>
                      <th className="py-1.5 text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {docsAplicadas.map(d => (
                      <tr key={d.id} className="hover:bg-muted/10">
                        <td className="py-1.5 font-mono text-primary font-bold">#{d.numero_doc ?? '?'}</td>
                        <td className="py-1.5 truncate max-w-[200px]">{d.fornecedor_nome ?? '—'}</td>
                        <td className="py-1.5 font-mono text-[10px]">{d.data_emissao ?? '—'}</td>
                        <td className="py-1.5 font-mono text-[10px]">{d.applied_at ? new Date(d.applied_at).toLocaleString('pt-BR') : '—'}</td>
                        <td className="py-1.5 text-right font-medium">{d.valor_total != null ? Number(d.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                        <td className="py-1.5 text-center text-[10px] text-muted-foreground">
                          {d.qtdConsumos - d.qtdPedidosCriados > 0 && <span className="mr-1">{d.qtdConsumos - d.qtdPedidosCriados} consumo(s)</span>}
                          {d.qtdPedidosCriados > 0 && <span className="rounded bg-blue-500/10 text-blue-700 px-1">+ {d.qtdPedidosCriados} pedido novo</span>}
                          {d.qtdConsumos === 0 && <span className="text-amber-700">sem log</span>}
                        </td>
                        <td className="py-1.5 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              onClick={() => setRastreioDoc({ id: d.id, numero: d.numero_doc, fornecedor: d.fornecedor_nome })}
                              className="rounded p-1 hover:bg-blue-500/10 text-blue-600"
                              title="Ver rastreio (o que essa NF consumiu, cobriu ou criou)"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteDoc({ id: d.id, numero: d.numero_doc, fornecedor: d.fornecedor_nome })}
                              className="rounded p-1 hover:bg-destructive/10 text-destructive"
                              title="Excluir NF (reverte o consumo nos pedidos)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog: Rastreio da NF (efeitos gerados) */}
      {rastreioDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRastreioDoc(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b px-5 py-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <History className="h-4 w-4 text-blue-600" /> Rastreio da NF #{rastreioDoc.numero ?? '?'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rastreioDoc.fornecedor ?? '—'} · efeitos gerados ao aplicar esta nota
                </p>
              </div>
              <button onClick={() => setRastreioDoc(null)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 text-xs">
              {rastreioLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando rastreio…
                </div>
              )}
              {!rastreioLoading && rastreioRows.length === 0 && (
                <p className="text-muted-foreground italic text-center py-4">
                  Sem registros de consumo pra essa NF.
                </p>
              )}
              {!rastreioLoading && rastreioRows.map(r => {
                const valor = r.valor_efeito != null ? Number(r.valor_efeito) : 0
                const qtd = r.delta_qtd_recebida != null ? Number(r.delta_qtd_recebida) : 0
                if (r.tipo === 'pedido_criado') {
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] rounded bg-blue-500/15 text-blue-700 px-1.5 py-0.5 font-bold uppercase">pedido novo</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? 'sem fornecedor'}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Pedido criado a partir desta NF (ancora financeiro pras parcelas da NF).
                      </p>
                    </div>
                  )
                }
                if (r.tipo === 'cobertura_previsao') {
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] rounded bg-amber-500/20 text-amber-800 px-1.5 py-0.5 font-bold uppercase">cobertura financeira</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? '—'}</span>
                        <span className="text-[10px] rounded bg-amber-500/15 text-amber-800 px-1 font-semibold">PREVISÃO</span>
                      </div>
                      <p className="text-[11px]">
                        Cobriu <span className="font-mono font-bold text-amber-700">{formatCurrency(valor)}</span> do saldo financeiro da previsão
                        {r.item_codigo && <> · item <span className="font-mono text-muted-foreground">{r.item_codigo}</span></>}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        A parcela futura mais distante do pedido foi reduzida nesse valor (sem mexer em parcelas pagas/conciliadas).
                      </p>
                    </div>
                  )
                }
                if (r.tipo === 'consumo_fisico') {
                  const vuNF = r.vu_nf != null ? Number(r.vu_nf) : null
                  const vuPed = r.vu_pedido != null ? Number(r.vu_pedido) : null
                  const temDifPreco = vuNF != null && vuPed != null && Math.abs(vuNF - vuPed) > 0.01
                  const deltaUnit = (vuNF ?? 0) - (vuPed ?? 0)
                  const deltaPct = vuPed && vuPed > 0 ? (deltaUnit / vuPed) * 100 : 0
                  return (
                    <div key={r.consumo_id} className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 font-bold uppercase">consumo</span>
                        <span className="font-mono font-bold">#{r.pedido_numero ?? '?'}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{r.fornecedor_nome ?? '—'}</span>
                      </div>
                      <p className="text-[11px]">
                        Consumiu <span className="font-mono font-bold text-emerald-700">{qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> un
                        {valor > 0 && <> = <span className="font-mono">{formatCurrency(valor)}</span></>}
                        {r.item_codigo && <> · <span className="font-mono text-muted-foreground">{r.item_codigo}</span></>}
                      </p>
                      {r.item_descricao && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.item_descricao}</p>
                      )}
                      {temDifPreco && (
                        <p className={`text-[10px] mt-1 ${deltaUnit > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          Preço NF: <span className="font-mono">{formatCurrency(vuNF!)}</span>/un
                          {' '}vs orçado <span className="font-mono">{formatCurrency(vuPed!)}</span>
                          {' · '}<strong>{deltaUnit > 0 ? '+' : ''}{formatCurrency(deltaUnit * qtd)}</strong>
                          {' '}({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={r.consumo_id} className="rounded-md border bg-muted/10 p-2 text-[11px] text-muted-foreground">
                    Registro sem efeito identificado (consumo_id <span className="font-mono">{r.consumo_id.slice(0,8)}</span>)
                  </div>
                )
              })}
              {!rastreioLoading && rastreioRows.length > 0 && (() => {
                const totConsumido = rastreioRows.filter(r => r.tipo === 'consumo_fisico').reduce((s, r) => s + Number(r.valor_efeito ?? 0), 0)
                const totCoberto = rastreioRows.filter(r => r.tipo === 'cobertura_previsao').reduce((s, r) => s + Number(r.valor_efeito ?? 0), 0)
                const totPedidosNovos = rastreioRows.filter(r => r.tipo === 'pedido_criado').length
                return (
                  <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground space-y-0.5">
                    {totConsumido > 0 && <div>Consumido (físico): <span className="font-mono">{formatCurrency(totConsumido)}</span></div>}
                    {totCoberto > 0 && <div>Coberto (previsões): <span className="font-mono">{formatCurrency(totCoberto)}</span></div>}
                    {totPedidosNovos > 0 && <div>Pedidos novos: <span className="font-mono">{totPedidosNovos}</span></div>}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog: Excluir NF */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteDoc(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2 text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Excluir NF #{confirmDeleteDoc.numero ?? '?'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Fornecedor: <span className="text-foreground font-medium">{confirmDeleteDoc.fornecedor ?? '—'}</span>.
              Esta ação reverte o consumo nos planejados (qtd_recebida) e apaga o pedido novo criado pela NF (se houver).
              Não é possível desfazer.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDeleteDoc(null)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                Cancelar
              </button>
              <button
                onClick={() => excluirNF.mutate(confirmDeleteDoc.id)}
                disabled={excluirNF.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {excluirNF.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Excluir e reverter
              </button>
            </div>
          </div>
        </div>
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
          {/* Banner: NF JÁ APLICADA (chave_acesso já existe nesta company).
              Mostra detalhes do doc anterior e botão "Excluir e refazer", que dispara a RPC
              com force_replace_doc_id — o trigger BEFORE DELETE reverte tudo do doc antigo
              (devolve qtd_recebida, restaura snapshots, apaga âncora) e aplica a nova versão
              numa única transação. Resolve o "consumo fantasma" da NF reaplicada. */}
          {existingDocConflict && (
            <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-red-700 text-sm">Esta NF já foi aplicada anteriormente</p>
                    <p className="mt-1 text-foreground">
                      NF <strong>#{existingDocConflict.numero_doc ?? '?'}</strong>
                      {existingDocConflict.fornecedor_nome ? <> · {existingDocConflict.fornecedor_nome}</> : null}
                      {existingDocConflict.applied_at && <> · aplicada em {new Date(existingDocConflict.applied_at).toLocaleString('pt-BR')}</>}
                      {existingDocConflict.valor_total != null && <> · {formatCurrency(Number(existingDocConflict.valor_total))}</>}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Se quiser reaplicar (ex: a anterior estava com dados errados),
                      o sistema vai <strong>reverter completamente</strong> a aplicação anterior
                      (devolve saldo dos planejados consumidos, apaga pedido âncora, restaura parcelas)
                      e aplicar esta versão. Tudo numa única transação.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setExistingDocConflict(null)
                      aplicar({ forceReplaceDocId: existingDocConflict.id })
                    }}
                    disabled={aplicando}
                    className="inline-flex items-center gap-1.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 text-[11px] font-bold whitespace-nowrap"
                    title="Reverte a NF anterior e aplica esta numa única transação atômica"
                  >
                    {aplicando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Excluir anterior e aplicar esta
                  </button>
                  <button
                    onClick={() => {
                      setExistingDocConflict(null)
                      setExtracao(null)
                    }}
                    className="rounded border px-3 py-1 text-[10px] hover:bg-muted whitespace-nowrap"
                  >
                    Cancelar importação
                  </button>
                </div>
              </div>
            </div>
          )}
          {checandoDedup && !existingDocConflict && (
            <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Verificando se esta NF já foi aplicada…
            </div>
          )}
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
            {/* Bloco de pagamento extraído (boleto/PIX/TED) — só aparece quando a IA achou algo concreto.
                Read-only / informativo: serve pro operador conferir antes de pagar. Persistido em raw_extracao. */}
            {extracao.pagamento && extracao.pagamento.forma && extracao.pagamento.forma !== 'DESCONHECIDO' && (
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 text-blue-700 font-semibold uppercase tracking-wide text-[10px]">
                  Pagamento detectado: {extracao.pagamento.forma}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                  {extracao.pagamento.linha_digitavel && <div><span className="text-muted-foreground">Linha digitável:</span> {extracao.pagamento.linha_digitavel}</div>}
                  {extracao.pagamento.codigo_barras && !extracao.pagamento.linha_digitavel && <div><span className="text-muted-foreground">Cód. barras:</span> {extracao.pagamento.codigo_barras}</div>}
                  {extracao.pagamento.chave_pix && <div><span className="text-muted-foreground">Chave PIX ({extracao.pagamento.tipo_chave_pix ?? '?'}):</span> {extracao.pagamento.chave_pix}</div>}
                  {extracao.pagamento.banco && <div><span className="text-muted-foreground">Banco:</span> {extracao.pagamento.banco} {extracao.pagamento.agencia ? `· Ag ${extracao.pagamento.agencia}` : ''} {extracao.pagamento.conta ? `· Cc ${extracao.pagamento.conta}` : ''}</div>}
                  {extracao.pagamento.beneficiario_nome && <div><span className="text-muted-foreground">Beneficiário:</span> {extracao.pagamento.beneficiario_nome} {extracao.pagamento.beneficiario_cnpj_cpf ? `(${extracao.pagamento.beneficiario_cnpj_cpf})` : ''}</div>}
                </div>
                <p className="text-[10px] text-muted-foreground italic">Confira esses dados antes de pagar — extração automática, sujeita a erro de OCR.</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Valor da NF</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorTotalManualInput}
                  onChange={e => {
                    const raw = e.target.value
                    setValorTotalManualInput(raw)
                    const parsed = parseBRL(raw)
                    setExtracao(prev => prev ? {
                      ...prev,
                      documento: { ...prev.documento, valor_total: raw.trim() === '' ? null : parsed },
                    } : prev)
                  }}
                  onBlur={() => {
                    // Reformata pro padrão BR ao sair do foco (1234.5 → "1.234,50")
                    const v = extracao.documento.valor_total
                    if (v != null) setValorTotalManualInput(toBRLInput(v))
                  }}
                  placeholder="0,00"
                  title="Valor total da NF — XML/OCR pode falhar em extrair (NFC-e, foto baixa qualidade). Edite aqui pra corrigir."
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-bold font-mono text-right"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Itens + frete</p>
                <p className={`font-bold text-sm ${Math.abs(diferenca) > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`} title={`Itens: ${formatCurrency(totalLinhas)} + Frete: ${formatCurrency(valorFrete)}`}>{formatCurrency(totalAParcelar)}</p>
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
            {/* Campos editáveis aplicados no insert do pedido âncora da NF */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Frete (CIF)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorFreteInput}
                  onChange={e => setValorFreteInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono text-right"
                  title="Frete cobrado pelo fornecedor na NF. Entra no total a parcelar mas NÃO é diluído nos itens."
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Cond. pagamento (atalho)</label>
                <input
                  type="text"
                  value={condPagamento}
                  onChange={e => { setCondPagamento(e.target.value); setParcelasManuallyEdited(false) }}
                  placeholder="30/60 · à vista · vencimento na NF"
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  title="Atalho para gerar a lista de parcelas abaixo linearmente. Depois disso você pode editar cada parcela individualmente."
                />
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
                  <span className="text-muted-foreground">Total a parcelar:</span>{' '}
                  <strong className="font-mono">{formatCurrency(totalAParcelar)}</strong>
                </div>
              </div>
            </div>

            {/* Editor de parcelas — substitui o texto único "30/60/90".
                As parcelas configuradas aqui SUBSTITUEM as parcelas futuras (não pagas/
                não conciliadas) dos pedidos consumidos por esta NF. As parcelas pagas
                ou conciliadas são preservadas. */}
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Parcelas da NF ({editableParcelas.length}x)
                </p>
                <div className="flex items-center gap-2">
                  {parcelasManuallyEdited && condPagamento.trim() && (
                    <button
                      type="button"
                      onClick={redistribuirParcelas}
                      className="rounded border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                      title={`Redistribui ${formatCurrency(totalAParcelar)} sobre "${condPagamento.trim()}"`}
                    >
                      Redistribuir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addParcela}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" /> Parcela
                  </button>
                </div>
              </div>

              {editableParcelas.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Preencha a cond. pagamento (ex: <span className="font-mono">30/60</span>) ou clique em <strong>+ Parcela</strong> pra começar.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {editableParcelas.map(p => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 shadow-sm text-xs">
                      <span className="font-bold text-primary w-8 shrink-0">P{p.numero_parcela}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={p.valor}
                        onChange={e => updateParcela(p.id, 'valor', e.target.value)}
                        className="w-28 rounded border bg-background px-2 py-1 text-right font-mono text-xs focus:border-primary focus:outline-none"
                        placeholder="Valor"
                      />
                      <input
                        type="date"
                        value={p.data_vencimento}
                        onChange={e => updateParcela(p.id, 'data_vencimento', e.target.value)}
                        className="rounded border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={p.descricao}
                        onChange={e => updateParcela(p.id, 'descricao', e.target.value)}
                        placeholder="Descrição (opcional)"
                        className="flex-1 min-w-[120px] rounded border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeParcela(p.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Remover parcela"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editableParcelas.length > 0 && (
                <div className={`flex items-center gap-3 text-[11px] font-medium ${parcelasOk ? 'text-emerald-700' : 'text-red-600'}`}>
                  <span>Soma: <span className="font-mono">{formatCurrency(parcelasSoma)}</span></span>
                  <span>Total a parcelar: <span className="font-mono">{formatCurrency(totalAParcelar)}</span></span>
                  {!parcelasOk && <span className="font-bold">Diferença: {formatCurrency(parcelasDiff)}</span>}
                  {parcelasOk && <Check className="h-3.5 w-3.5" />}
                </div>
              )}
            </div>
            {/* Preview do CONSUMO de previsões: lista os pedidos planejados que serão
                consumidos. Note que a distribuição real é FIFO automática entre todos
                os pedidos planejados do mesmo item — esta lista é apenas o MATCH explícito
                da UI (linha N da NF aponta pra pedido X). Pedidos extras com saldo ainda
                podem ser consumidos automaticamente durante o aplicar(). */}
            {previsoesACancelar.length > 0 && (() => {
              const totalPrev = previsoesACancelar.filter(p => p.isPrevisao).length
              const totalNorm = previsoesACancelar.length - totalPrev
              return (
                <details className="mt-2 rounded-md border border-blue-500/40 bg-blue-500/5 text-[11px]">
                  <summary className="cursor-pointer px-2 py-1.5 flex items-center gap-1.5 text-blue-800 hover:bg-blue-500/10">
                    <Check className="h-3.5 w-3.5" />
                    {totalNorm > 0 && (
                      <span><strong>{totalNorm}</strong> pedido(s) planejado(s) serão <strong>consumidos</strong> (por quantidade)</span>
                    )}
                    {totalNorm > 0 && totalPrev > 0 && <span className="text-muted-foreground">·</span>}
                    {totalPrev > 0 && (
                      <span><strong>{totalPrev}</strong> previsão(ões) financeira(s) serão <strong>cobertas</strong> (por valor)</span>
                    )}
                    <span className="text-muted-foreground ml-1">ao aplicar.</span>
                  </summary>
                  <div className="border-t border-blue-500/30 divide-y divide-blue-500/20 max-h-48 overflow-y-auto">
                    {previsoesACancelar.map(p => (
                      <div key={p.pedidoId} className="px-2 py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] text-muted-foreground">#{p.numero ?? '?'}</span>
                          {p.isPrevisao && (
                            <span className="text-[9px] rounded bg-amber-500/20 text-amber-800 px-1 font-semibold whitespace-nowrap">
                              PREVISÃO · cobre por valor
                            </span>
                          )}
                          <span>{p.itemDescricao}</span>
                          <span className="text-[10px] text-muted-foreground">· linha(s) {p.linhasNF.join(', ')} da NF</span>
                        </div>
                        <span className="font-mono whitespace-nowrap">{formatCurrency(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })()}
            {/* Banner BLOQUEIO/AVISO: estouros AGRUPADOS por item_compra_id. Várias linhas
                da NF apontando pro mesmo item são somadas — se a soma excede o saldo
                agregado dos pedidos planejados, mostra alerta.
                Vermelho (bloqueio) quando setting permitirEstouroOrcamento = false.
                Amarelo (aviso, mas libera Aplicar) quando setting = true — sobra vira
                pedido_item com fora_orcamento=true (não infla comprometido). */}
            {estourosPorItem.size > 0 && (
              <div className={`mt-2 rounded-md border-2 p-3 text-[11px] ${permitirEstouroOrcamento ? 'border-amber-500/50 bg-amber-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
                <p className={`font-bold mb-1 flex items-center gap-1.5 ${permitirEstouroOrcamento ? 'text-amber-700' : 'text-red-700'}`}>
                  <AlertTriangle className="h-4 w-4" />
                  {permitirEstouroOrcamento
                    ? `${estourosPorItem.size} item(s) terão estouro de orçamento (a sobra será registrada SEM inflar o comprometido):`
                    : `${estourosPorItem.size} item(s) com soma da NF excedendo saldo do pedido planejado:`}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {Array.from(estourosPorItem.values()).map(e => (
                    <li key={e.itemId} className="flex items-start gap-1.5">
                      <span className="shrink-0">▸</span>
                      <div className="flex-1">
                        <div className="font-medium text-foreground/90">{e.itemDescricao}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Linha(s) da NF: <strong>{e.ordens.join(', ')}</strong>
                        </div>
                        {e.excQtd > 0.001 && (
                          <div className={permitirEstouroOrcamento ? 'text-amber-700' : 'text-red-700'}>
                            · Soma qtd NF <strong>{e.qtdTotal.toLocaleString('pt-BR')}</strong> &gt; saldo total {e.saldoQtd.toLocaleString('pt-BR')} (excesso <strong>{e.excQtd.toLocaleString('pt-BR')}</strong>)
                          </div>
                        )}
                        {e.excValor > 0.01 && (
                          <div className={permitirEstouroOrcamento ? 'text-amber-700' : 'text-red-700'}>
                            · Soma valor NF <strong>{formatCurrency(e.valorTotal)}</strong> &gt; saldo total {formatCurrency(e.saldoValor)} (excesso <strong>{formatCurrency(e.excValor)}</strong>)
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {permitirEstouroOrcamento ? (
                  <p className="mt-2 text-muted-foreground">
                    Setting "Permitir estourar orçamento" está <strong>ligado</strong> em Configurações.
                    A sobra será registrada como <strong>fora do orçamento</strong> (qtd e parcelas batem com a NF, mas o comprometido do item não infla).
                  </p>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Para aplicar, escolha uma das opções:
                    <br />
                    <strong>a)</strong> Ajuste a qtd/valor do pedido em <strong>Compras &gt; Pedidos</strong> para comportar a NF; ou
                    <br />
                    <strong>b)</strong> Troque a ação de alguma das linhas listadas para <strong>"Criar pedido novo"</strong> ou <strong>"Criar item novo"</strong>; ou
                    <br />
                    <strong>c)</strong> Habilite <strong>"Permitir estourar orçamento"</strong> em <strong>Configurações</strong> (se as linhas pertencem a este item de orçamento mas a NF tem qtd/valor maior por motivo legítimo).
                  </p>
                )}
              </div>
            )}
            {/* F2.a: Banner DUPLICAÇÃO POTENCIAL — linhas que vão criar pedido novo,
                mas existe pedido planejado com saldo do mesmo item. É o cenário que
                gerou os pedidos-fantasma #652–#655 (EGX) duplicando o #538 (DIMARCK):
                fornecedor diferente fez o operador não consumir a previsão.
                Não bloqueia — só avisa + 1 clique pra vincular. */}
            {pedidosOrfaosMesmoItem.length > 0 && (
              <div className="mt-2 rounded-md border-2 border-amber-500/50 bg-amber-500/5 p-3 text-[11px]">
                <p className="font-bold mb-1 text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {pedidosOrfaosMesmoItem.length} pedido(s) planejado(s) do mesmo item NÃO serão consumidos
                </p>
                <p className="text-muted-foreground mb-2">
                  As linhas abaixo vão <strong>criar pedido novo</strong>, mas existe pedido planejado com saldo do <strong>mesmo item de orçamento</strong>.
                  Aplicar assim duplica a previsão financeira. Clique em <strong>Vincular</strong> pra consumir o pedido existente — o sistema vai logar a divergência de fornecedor (se houver).
                </p>
                <ul className="space-y-1">
                  {pedidosOrfaosMesmoItem.map((o, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded bg-amber-500/10 px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground/90 flex items-center gap-1.5 flex-wrap">
                          <span>Pedido <span className="font-mono">#{o.pedidoNumero ?? '?'}</span></span>
                          {o.isPrevisao && (
                            <span className="text-[9px] rounded bg-amber-500/20 text-amber-800 px-1 py-0.5 font-semibold">
                              PREVISÃO FINANCEIRA
                            </span>
                          )}
                          <span>· {o.fornecedorNomePedido ?? 'fornecedor não informado'}</span>
                          <span>
                            · saldo {o.isPrevisao ? (
                              <span className="font-mono">{formatCurrency(o.saldoValor)} (financeiro)</span>
                            ) : (
                              <>
                                <span className="font-mono">{o.saldoQtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                {' un = '}
                                <span className="font-mono">{formatCurrency(o.saldoValor)}</span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Linha {o.linhaIdx + 1} da NF: <em>{o.linhaDescricao}</em> · item: {o.itemDescricao}
                          {o.isPrevisao && ' · NF vai abater saldo financeiro, sem mexer em qtd nem em parcelas pagas'}
                        </div>
                      </div>
                      <button
                        onClick={() => vincularLinhaAPedido(o.linhaIdx, o.pedidoId)}
                        className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 text-[10px] font-bold whitespace-nowrap"
                        title={o.isPrevisao
                          ? `Vincular linha ao pedido previsão #${o.pedidoNumero} — NF abate saldo financeiro`
                          : `Vincular linha ao pedido #${o.pedidoNumero} — NF consome quantidade`}
                      >
                        <Check className="h-3 w-3" /> Vincular
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                    Itens + frete ({formatCurrency(totalAParcelar)}) difere do total da NF ({formatCurrency(extracao.documento.valor_total ?? 0)}) — diferença <strong>{formatCurrency(diferenca)}</strong>.
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

          {/* Linhas — overflow-visible pra que o dropdown do ItemPickerCombobox
              escape do card sem ser cortado (a 3ª/4ª linha ficavam com a lista
              de match invisível). */}
          <div className="rounded-xl border bg-card">
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
                  // Há QUALQUER pedido planejado com saldo aberto pra este item?
                  // Se sim, "Consumir previsão" fica habilitado mesmo que o auto-match
                  // não tenha pré-selecionado um pedido (operador escolhe na hora).
                  const candidatoConsumo = !pedidoSel && linha.item_compra_id
                    ? pedidos.find(p =>
                        STATUS_ELEGIVEIS_CONSUMO.includes(p.status)
                        && (p.itens ?? []).some(pi =>
                          pi.item_compra_id === linha.item_compra_id
                          && Number(pi.qtd ?? 0) > Number(pi.qtd_recebida ?? 0) + 0.001
                        )
                      )
                    : undefined
                  const podeConsumir = !!pedidoSel || !!candidatoConsumo
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
                                  {pedidoSel && (
                                    (pedidoSel as any).is_previsao_orcamento === true ? (
                                      <span className="rounded bg-amber-500/15 text-amber-800 px-1 font-semibold" title="Pedido previsão financeira — a NF vai cobrir o saldo a pagar do pedido sem mexer em qtd nem em parcelas já pagas">
                                        → cobre previsão financeira
                                      </span>
                                    ) : (
                                      <span className="rounded bg-blue-500/15 text-blue-700 px-1" title="Consume previsão FIFO entre os pedidos planejados deste item (não só este)">
                                        → consome previsão
                                      </span>
                                    )
                                  )}
                                </div>
                                {(() => {
                                  // F2.b — Aviso de fornecedor divergente entre a NF e o pedido vinculado.
                                  // NÃO bloqueia: o consumo vai acontecer e a divergência fica registrada
                                  // pra relatório. Caso clássico: pedido #538 era DIMARCK, NF chegou da EGX.
                                  if (!pedidoSel) return null
                                  const cnpjNF = extracao.fornecedor.cnpj?.replace(/\D/g, '') ?? ''
                                  const nomeNF = (extracao.fornecedor.nome ?? '').trim()
                                  let fornNFId: string | null = null
                                  if (cnpjNF) {
                                    fornNFId = (fornecedores as any[]).find(f => (f.cnpj ?? '').replace(/\D/g, '') === cnpjNF)?.id ?? null
                                  }
                                  if (!fornNFId && nomeNF) {
                                    fornNFId = (fornecedores as any[]).find(f => (f.nome ?? '').toLowerCase() === nomeNF.toLowerCase())?.id ?? null
                                  }
                                  if (pedidoSel.fornecedor_id && fornNFId && pedidoSel.fornecedor_id === fornNFId) return null
                                  const nomePed = (pedidoSel.fornecedor_nome ?? '').trim()
                                  if (nomePed && nomeNF && nomePed.toLowerCase() === nomeNF.toLowerCase()) return null
                                  // Sem nome em nenhum lado = não há o que comparar
                                  if (!nomePed && !nomeNF) return null
                                  return (
                                    <div className="flex gap-1 flex-wrap">
                                      <span
                                        className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 text-amber-700 px-1 text-[9px]"
                                        title={`Pedido planejado é do fornecedor "${nomePed || '?'}", mas a NF é de "${nomeNF || '?'}". O consumo segue normal e a divergência fica registrada pra relatório.`}
                                      >
                                        <AlertTriangle className="h-2.5 w-2.5" /> Fornecedor diverge: {nomePed || '?'} → {nomeNF || '?'}
                                      </span>
                                    </div>
                                  )
                                })()}
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
                              itens: prev.itens.map((l, i) => {
                                if (i !== idx) return l
                                // Ao mudar pra "substituir_pedido" sem pedido pré-selecionado,
                                // pega o primeiro candidato (FIFO) — operador pode confirmar/aplicar.
                                const pedSubId = acao === 'substituir_pedido'
                                  ? (l.pedido_substituido_id || candidatoConsumo?.id || null)
                                  : l.pedido_substituido_id
                                return { ...l, acao, pedido_substituido_id: pedSubId, confirmado: true, precisaConfirmar: false }
                              })
                            } : prev)
                          }}
                          className="w-full rounded border bg-background px-1.5 py-1 text-[11px]"
                        >
                          <option value="">— escolher —</option>
                          <option value="criar_pedido">Criar pedido novo</option>
                          <option value="substituir_pedido" disabled={!podeConsumir}>
                            Consumir previsão (FIFO entre planejados)
                          </option>
                          <option value="criar_item">Criar item novo (manual)</option>
                          <option value="ignorar">Ignorar</option>
                        </select>
                        {/* Dica quando a opção "Consumir previsão" está desabilitada:
                            o gate é `linha.item_compra_id` setado E existir pedido planejado com
                            saldo pra esse item. Sem item ligado, a opção fica disabled silenciosamente —
                            o operador precisa SABER que tem que ligar um item primeiro. */}
                        {!podeConsumir && !linha.item_compra_id && (
                          <p className="mt-1 text-[9px] text-amber-700" title="A opção 'Consumir previsão' só aparece habilitada quando uma linha está ligada a um item do orçamento que tem pedido planejado com saldo aberto.">
                            <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />
                            Ligue um item do orçamento (acima) pra consumir previsão.
                          </p>
                        )}
                        {!podeConsumir && linha.item_compra_id && (
                          <p className="mt-1 text-[9px] text-muted-foreground" title="Não há pedido planejado com saldo aberto pra este item — só restam as opções 'Criar pedido novo' ou 'Criar item novo'.">
                            Sem previsão planejada com saldo pra este item.
                          </p>
                        )}
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
            {editableParcelas.length > 0 && !parcelasOk && (
              <span className="text-[11px] text-red-700 mr-2">
                Soma das parcelas ≠ total a parcelar (diferença {formatCurrency(parcelasDiff)}).
              </span>
            )}
            {estourosPorItem.size > 0 && !permitirEstouroOrcamento && (
              <span className="text-[11px] text-red-700 mr-2 font-medium">
                {estourosPorItem.size} item(s) com soma da NF excedendo saldo (veja banner acima).
              </span>
            )}
            <button onClick={() => { setExtracao(null); setTextoColado(''); setDiferencaAceita(false); setCondPagamento(''); setValorFreteInput(''); setEditableParcelas([]); setParcelasManuallyEdited(false) }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
            <button
              onClick={() => aplicar()}
              disabled={aplicando || linhasOk === 0 || linhasAConfirmar > 0 || divergenciaBloqueia || (editableParcelas.length > 0 && !parcelasOk) || (!permitirEstouroOrcamento && estourosPorItem.size > 0)}
              title={
                linhasAConfirmar > 0 ? 'Há linhas com match de média confiança que precisam ser confirmadas'
                : divergenciaBloqueia ? 'Soma das linhas difere do total da NF — aceite a diferença pra liberar'
                : (editableParcelas.length > 0 && !parcelasOk) ? 'Soma das parcelas precisa bater com o total a parcelar'
                : (!permitirEstouroOrcamento && estourosPorItem.size > 0) ? `${estourosPorItem.size} item(s) com soma da NF excedendo saldo — ajuste o pedido, troque a ação ou habilite "Permitir estourar orçamento" em Configurações`
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
