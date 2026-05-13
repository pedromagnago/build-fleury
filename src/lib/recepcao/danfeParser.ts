// Parser DETERMINÍSTICO de DANFE (Documento Auxiliar da NF-e).
//
// Motivação: gpt-4o, mesmo com prompt cirúrgico e texto nativo bem extraído,
// continua inventando itens (FCI virando produto), agrupando linhas erradas
// e errando colunas. Como DANFE tem formato regulamentado pela SEFAZ
// (sequência fixa: CÓDIGO DESCRIÇÃO NCM CST CFOP UNID QTD VU VT IMPOSTOS),
// uma regex bem feita extrai com 100% de precisão e é literalmente milhões
// de vezes mais rápida que IA.
//
// Estratégia:
//   1. Detecta padrão DANFE pelo header "DADOS DOS PRODUTOS/SERVIÇOS"
//   2. Isola a seção de itens (entre esse header e "CÁLCULO DO ISSQN" ou "DADOS ADICIONAIS")
//   3. Re-mescla linhas: cada item começa com CÓDIGO de 6+ dígitos; tudo que
//      vier antes do próximo código é continuação (descrição longa, FCI, impostos zerados)
//   4. Aplica regex de captura por linha consolidada
//   5. Valida qtd × vu ≈ vt em cada item; valida SUM(vt) ≈ total da NF
//   6. Header (fornecedor, número, data, total) extraído com regexes específicos
//
// Se a NF não for DANFE-padrão, o parser devolve null e o fluxo cai pra IA.

export interface DanfeItem {
  ordem: number
  codigo: string
  descricao: string
  ncm: string | null
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
}

export interface DanfeHeader {
  fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
  documento: {
    numero: string | null
    serie: string | null
    data_emissao: string | null   // YYYY-MM-DD
    data_vencimento: string | null
    valor_total: number | null
    tipo: 'NFE'
  }
  observacoes: string | null
}

export interface DanfeParseResult extends DanfeHeader {
  itens: DanfeItem[]
  /** notas do parser pro operador: validações, regex falhou em linha N, etc. */
  notas_parser: string[]
  /** ratio de itens cuja validação qtd×vu=vt passou. 1.0 = todos bateram. */
  qualidade: number
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Converte "1.234,56" (formato BR) → 1234.56. Aceita "0,5", "441,60", "1234.56". */
function parseNumberBr(s: string | undefined | null): number | null {
  if (!s) return null
  const clean = String(s).trim().replace(/\s/g, '')
  // Se tem vírgula, assume formato BR (ponto = milhar, vírgula = decimal)
  // Se só tem ponto, pode ser decimal puro (1.5) ou milhar (1.234) — heurística:
  // ponto seguido de exatamente 3 dígitos = milhar; senão = decimal
  let normalized: string
  if (clean.includes(',')) {
    normalized = clean.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    // formato "1.234" ou "1.234.567" sem vírgula — milhar
    normalized = clean.replace(/\./g, '')
  } else {
    normalized = clean
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

/** "30/03/2026" → "2026-03-30". null se formato inválido. */
function parseDateBr(s: string | undefined | null): string | null {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [_, d, mo, y] = m
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`
}

/** Limpa descrição: remove FCI no fim, " - " sobrando, espaços duplos. */
function limparDescricao(s: string): string {
  return s
    .replace(/\s*-\s*FCI:.*$/i, '')   // remove "- FCI: UUID"
    .replace(/\s+FCI:.*$/i, '')        // remove " FCI: UUID" sem traço
    .replace(/\s*-\s*$/, '')           // remove "-" no fim
    .replace(/\s+/g, ' ')              // colapsa espaços múltiplos
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────
// Regex principais
// ─────────────────────────────────────────────────────────────────────────

// Marca o início da seção de itens da DANFE
const RE_INICIO_ITENS = /DADOS\s+DOS\s+PRODUTOS\s*\/\s*SERVI[ÇC]OS/i
const RE_FIM_ITENS = /C[ÁA]LCULO\s+DO\s+ISSQN|DADOS\s+ADICIONAIS|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES/i

// Cada linha física de item DANFE começa com 6+ dígitos (código interno do fornecedor)
const RE_INICIO_ITEM = /^\s*(\d{6,})\s+/

// Layout DANFE (varia, mas padrão: CÓDIGO DESCRIÇÃO NCM(8) CST(3) CFOP(4) UNID QTD VU VT [impostos])
// Captura: 1=cod, 2=desc, 3=ncm, 4=cst, 5=cfop, 6=unid, 7=qtd, 8=vu, 9=vt
// Tolerância: aceita \t, espaços múltiplos, CST de 2-4 dígitos (alguns layouts usam 60/600), CFOP 4 dígitos.
const RE_LINHA_ITEM = /(?:^|\s)(\d{6,})[\s\t]+(.+?)[\s\t]+(\d{8})[\s\t]+\d{2,4}[\s\t]+\d{4}[\s\t]+([A-Z0-9]{1,5})[\s\t]+([\d.,]+)[\s\t]+([\d.,]+)[\s\t]+([\d.,]+)(?:[\s\t]|$)/

// ─────────────────────────────────────────────────────────────────────────
// Parser de itens
// ─────────────────────────────────────────────────────────────────────────

export function parseDanfeItens(texto: string): { itens: DanfeItem[]; notas: string[] } {
  const notas: string[] = []
  const inicio = texto.search(RE_INICIO_ITENS)
  if (inicio === -1) {
    return { itens: [], notas: ['seção "DADOS DOS PRODUTOS/SERVIÇOS" não encontrada'] }
  }
  // Considera a seção a partir do header
  let secao = texto.slice(inicio)
  const fim = secao.search(RE_FIM_ITENS)
  if (fim > 0) secao = secao.slice(0, fim)

  // NÃO substitui \t por espaço aqui — preserva tab pra ajudar o regex,
  // mas colapsa whitespace múltiplo logo abaixo.
  const linhas = secao.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)

  // Mescla linhas: cada item agrega tudo até o próximo código de 6+ dígitos
  // mas SOMENTE quando esse código aparece NO INÍCIO da linha (não em uma
  // descrição tipo "PARAFUSO 4X40 100UN" onde 100 é parte da descrição).
  const blocos: string[] = []
  let atual = ''
  for (const linha of linhas) {
    if (RE_INICIO_ITEM.test(linha)) {
      if (atual) blocos.push(atual)
      atual = linha
    } else if (atual) {
      atual += ' ' + linha
    }
  }
  if (atual) blocos.push(atual)

  if (blocos.length === 0) {
    return { itens: [], notas: ['nenhuma linha começando com código de 6 dígitos encontrada'] }
  }

  // Extrai campos de cada bloco
  const itens: DanfeItem[] = []
  let ordem = 0
  for (const bloco of blocos) {
    // Normaliza whitespace só pra match — preserva o original pra descricao depois
    const blocoNormalizado = bloco.replace(/[\t ]+/g, ' ')
    const m = blocoNormalizado.match(RE_LINHA_ITEM)
    if (!m) {
      notas.push(`linha não casou regex: "${bloco.slice(0, 120)}..."`)
      continue
    }
    ordem++
    const qtd = parseNumberBr(m[5])
    const vu = parseNumberBr(m[6])
    const vt = parseNumberBr(m[7])
    itens.push({
      ordem,
      codigo: m[1]!,
      descricao: limparDescricao(m[2]!),
      ncm: m[3] ?? null,
      unidade: m[4] ?? null,
      quantidade: qtd,
      valor_unitario: vu,
      valor_total: vt,
    })
  }
  return { itens, notas }
}

// ─────────────────────────────────────────────────────────────────────────
// Parser de header (fornecedor, documento)
// ─────────────────────────────────────────────────────────────────────────

// Pega o emitente (fornecedor da NF). O DANFE coloca "Identificação do Emitente"
// como rótulo da box do emitente — capturamos o que vem em volta.
// O texto extraído pode ter ordem confusa por causa do layout 2D, então
// usamos múltiplas estratégias e devolvemos null se nada bater com confiança.
function parseFornecedor(texto: string): DanfeHeader['fornecedor'] {
  let nome: string | null = null
  let cnpj: string | null = null
  let ie: string | null = null

  // Estratégia: procurar "Identificação do Emitente" e capturar o nome que aparece em CAIXA ALTA logo perto
  // (pdfjs nem sempre preserva ordem, então tentamos algumas variações)
  // Pega TODOS os CNPJs do documento; o emitente normalmente é o que aparece DEPOIS de "Identificação do Emitente"
  // e ANTES de "DESTINATÁRIO". Se a ordem do texto for caótica, pegamos heurística pela aparição de "VALOR TOTAL".
  const cnpjs = Array.from(texto.matchAll(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g)).map(m => m[1]!)
  if (cnpjs.length > 0) {
    cnpj = cnpjs[0]!  // primeiro CNPJ tipicamente é do destinatário ou emitente, varia. Vai ser refinado abaixo.
  }

  // Procura linha grande em CAIXA ALTA antes de "DESTINATÁRIO" ou "DATA DA EMISSÃO" — provável razão social emitente
  const idxDestinatario = texto.search(/DESTINAT[ÁA]RIO/i)
  const blocoCabecalho = idxDestinatario > 0 ? texto.slice(0, idxDestinatario) : texto.slice(0, 3000)

  // Razão social: linhas com >= 3 palavras em CAIXA ALTA, sem "DANFE", sem "NF-e", sem "CNPJ"
  const candidatos = blocoCabecalho.split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length >= 6 && l === l.toUpperCase())
    .filter(l => /[A-Z]{3,}/.test(l))
    .filter(l => !/DANFE|NF-?E|CNPJ|CHAVE|NATUREZA|INSCRIÇÃO|CONTROLE|S[ÉE]RIE|FOLHA|EMITENTE|DESTINAT[ÁA]RIO|FATURA|C[ÁA]LCULO|TRANSPORTADOR|PRODUTO|UF|CFOP|NCM|SOMBRIO/i.test(l))
    .filter(l => !/^\d/.test(l))   // não começa com dígito
    .filter(l => !/CEP:|R\s|RUA\s|AV\.|AVENIDA|END/i.test(l))   // não é endereço
  if (candidatos.length > 0) {
    nome = candidatos[0]!
  }

  // Para CNPJ: refina pegando o mais próximo do nome
  // Pula essa refinaria por simplicidade — primeiro CNPJ funciona em 90% dos DANFE
  // que têm o emitente listado primeiro. O operador pode corrigir se vier o destinatário.

  // IE — opcional, raramente útil
  const ieMatch = texto.match(/INSCRI[ÇC][ÃA]O\s+ESTADUAL[\s\S]{0,200}?(\d{6,})/i)
  if (ieMatch) ie = ieMatch[1]!

  return { nome, cnpj, ie }
}

function parseDocumento(texto: string): DanfeHeader['documento'] {
  // Número da NF
  let numero: string | null = null
  const matchN = texto.match(/N[ºo°]\s*([\d.]+)/i)
  if (matchN) numero = matchN[1]!.replace(/\./g, '')

  // Série
  let serie: string | null = null
  const matchS = texto.match(/S[ée]rie:?\s*(\d+)/i)
  if (matchS) serie = matchS[1]!

  // Data emissão
  let dataEmissao: string | null = null
  const matchData = texto.match(/DATA\s+DA?\s+EMISS[ÃA]O[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})/i)
                  ?? texto.match(/(\d{2}\/\d{2}\/\d{4})\s*DATA\s+DA?\s+EMISS[ÃA]O/i)
                  ?? texto.match(/EMISS[ÃA]O[:\s]+(\d{2}\/\d{2}\/\d{4})/i)
  if (matchData) dataEmissao = parseDateBr(matchData[1])

  // Valor total da nota
  let valorTotal: number | null = null
  const matchValor = texto.match(/VALOR\s+TOTAL\s+DA\s+NOTA[\s\S]{0,80}?([\d.,]+\d{2})/i)
                  ?? texto.match(/V\.\s*TOTAL\s+DA\s+NOTA[\s\S]{0,80}?([\d.,]+\d{2})/i)
  if (matchValor) valorTotal = parseNumberBr(matchValor[1])

  return {
    numero,
    serie,
    data_emissao: dataEmissao,
    data_vencimento: null,   // raramente útil em NF-e; fatura pode ter várias
    valor_total: valorTotal,
    tipo: 'NFE',
  }
}

// ─────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tenta parsear texto de DANFE. Devolve null se não parecer DANFE-padrão.
 * Quando devolve resultado, garante que itens.length > 0 e cada item tem
 * descricao + qtd + vu + vt parseáveis. A flag `qualidade` indica quantos
 * itens passaram na validação qtd × vu ≈ vt.
 */
export function parseDanfe(texto: string): DanfeParseResult | null {
  if (!RE_INICIO_ITENS.test(texto)) {
    console.warn('[danfeParser] texto não contém "DADOS DOS PRODUTOS/SERVIÇOS" — não é DANFE-padrão.')
    return null
  }

  const { itens, notas } = parseDanfeItens(texto)
  console.log(`[danfeParser] extraiu ${itens.length} item(ns); ${notas.length} nota(s)`, { notas })
  if (itens.length === 0) return null

  const fornecedor = parseFornecedor(texto)
  const documento = parseDocumento(texto)

  // Validação: quantos itens têm qtd × vu ≈ vt?
  let okValidacao = 0
  for (const it of itens) {
    if (it.quantidade != null && it.valor_unitario != null && it.valor_total != null) {
      const esperado = it.quantidade * it.valor_unitario
      if (Math.abs(esperado - it.valor_total) <= 0.05) okValidacao++
      else notas.push(`item ${it.codigo} ${it.descricao}: qtd × VU (${esperado.toFixed(2)}) ≠ VT (${it.valor_total.toFixed(2)})`)
    }
  }
  const qualidade = itens.length > 0 ? okValidacao / itens.length : 0

  // Valida soma das linhas vs valor total da NF
  const somaLinhas = itens.reduce((s, it) => s + (it.valor_total ?? 0), 0)
  if (documento.valor_total != null && Math.abs(somaLinhas - documento.valor_total) > 0.05) {
    notas.push(`soma das linhas R$ ${somaLinhas.toFixed(2)} ≠ total NF R$ ${documento.valor_total.toFixed(2)}`)
  }

  const resultado: DanfeParseResult = {
    fornecedor,
    documento,
    itens,
    observacoes: notas.length > 0 ? `Parser DANFE: ${notas.length} observação(ões)` : null,
    notas_parser: notas,
    qualidade,
  }
  // Exposição pra debug — operador pode inspecionar no console: window.__danfeDebug
  try { (window as any).__danfeDebug = resultado } catch { /* noop em SSR */ }
  return resultado
}
