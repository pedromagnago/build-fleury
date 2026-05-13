// Recepção de Documentos — extração SERVER-SIDE de PDF + parser DANFE.
//
// Motivação: o pdfjs-dist v5 no client (Vite + browser) tem bug recorrente
// "undefined is not a function (near '...value of readableStream...')" que
// não se resolveu nem com disableStream:true, nem com o legacy build. Mover
// pra Deno (edge function) elimina TODA a camada de bundling/polyfill que
// estava causando o problema.
//
// Estratégia:
//   1. Cliente manda PDF em base64
//   2. unpdf (fork serverless do pdfjs) extrai texto coord-based
//   3. Parser DANFE inline tenta extrair itens deterministicamente
//   4. Retorna estrutura pronta { itens, fornecedor, documento } ou só texto
//      pra fallback IA no cliente
//
// Body: { pdf_base64: string }
// Retorno:
//   - sucesso DANFE: { kind: 'danfe', danfe: {...}, paginas, total_chars, custo_cents: 0 }
//   - sucesso texto: { kind: 'texto', texto: '...', paginas, total_chars, custo_cents: 0 }
//   - erro: { kind: 'erro', erro: string, paginas?, paginas_com_erro? }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// unpdf — extracted/headless pdfjs maintained by Unjs (Nuxt team). Roda em Deno/CF Workers/etc.
import { getDocumentProxy, extractText } from 'npm:unpdf@0.12.1'

// ─── Parser DANFE (cópia portada do client) ──────────────────────────────

interface DanfeItem {
  ordem: number
  codigo: string
  descricao: string
  ncm: string | null
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
}

const RE_INICIO_ITENS = /DADOS\s+DOS\s+PRODUTOS\s*\/\s*SERVI[ÇC]OS/i
const RE_FIM_ITENS = /C[ÁA]LCULO\s+DO\s+ISSQN|DADOS\s+ADICIONAIS|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES/i
const RE_INICIO_ITEM = /^\s*(\d{6,})\s+/
const RE_LINHA_ITEM = /(?:^|\s)(\d{6,})[\s\t]+(.+?)[\s\t]+(\d{8})[\s\t]+\d{2,4}[\s\t]+\d{4}[\s\t]+([A-Z0-9]{1,5})[\s\t]+([\d.,]+)[\s\t]+([\d.,]+)[\s\t]+([\d.,]+)(?:[\s\t]|$)/

function parseNumberBr(s: string | undefined | null): number | null {
  if (!s) return null
  const clean = String(s).trim().replace(/\s/g, '')
  let normalized: string
  if (clean.includes(',')) {
    normalized = clean.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, '')
  } else {
    normalized = clean
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

function parseDateBr(s: string | undefined | null): string | null {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

function limparDescricao(s: string): string {
  return s
    .replace(/\s*-\s*FCI:.*$/i, '')
    .replace(/\s+FCI:.*$/i, '')
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDanfeItens(texto: string): { itens: DanfeItem[]; notas: string[] } {
  const notas: string[] = []
  const inicio = texto.search(RE_INICIO_ITENS)
  if (inicio === -1) return { itens: [], notas: ['seção "DADOS DOS PRODUTOS/SERVIÇOS" não encontrada'] }
  let secao = texto.slice(inicio)
  const fim = secao.search(RE_FIM_ITENS)
  if (fim > 0) secao = secao.slice(0, fim)

  const linhas = secao.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)
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
  if (blocos.length === 0) return { itens: [], notas: ['nenhuma linha começando com código de 6 dígitos encontrada'] }

  const itens: DanfeItem[] = []
  let ordem = 0
  for (const bloco of blocos) {
    const blocoNormalizado = bloco.replace(/[\t ]+/g, ' ')
    const m = blocoNormalizado.match(RE_LINHA_ITEM)
    if (!m) { notas.push(`linha não casou: "${bloco.slice(0, 120)}..."`); continue }
    ordem++
    itens.push({
      ordem,
      codigo: m[1]!,
      descricao: limparDescricao(m[2]!),
      ncm: m[3] ?? null,
      unidade: m[4] ?? null,
      quantidade: parseNumberBr(m[5]),
      valor_unitario: parseNumberBr(m[6]),
      valor_total: parseNumberBr(m[7]),
    })
  }
  return { itens, notas }
}

/** Formata CNPJ de 14 dígitos pra "XX.XXX.XXX/XXXX-XX". */
function formatarCNPJ(d: string): string {
  if (d.length !== 14) return d
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

/** Extrai a CHAVE DE ACESSO de 44 dígitos da DANFE.
 * Suporta os formatos típicos:
 *   - "4226 0332 0119 2300 0135 5500 1000 0305 4411 9448 5952" (11 grupos de 4)
 *   - "42260332..." (44 dígitos seguidos)
 *   - "4226.0332.0119..." (com pontos)
 * O CNPJ do emitente fica nas posições 7..20 (zero-based 6..20).
 */
function extrairChaveAcesso(texto: string): string | null {
  // Procura primeiro o padrão de 11 grupos de 4 dígitos com separadores
  const m1 = texto.match(/(\d{4}[\s.\-]?){10}\d{4}/)
  if (m1) {
    const digitos = m1[0].replace(/[^\d]/g, '')
    if (digitos.length === 44) return digitos
  }
  // Fallback: 44 dígitos seguidos sem separadores
  const m2 = texto.match(/\b(\d{44})\b/)
  if (m2) return m2[1]!
  return null
}

/** Sufixos que identificam razão social brasileira. Usado pra preferir
 * candidatos com sufixo válido em vez de qualquer linha em CAIXA ALTA. */
const RE_RAZAO_SUFIXO = /^(.{3,80}?)\s+(LTDA|S\.?\/?A|EIRELI|ME|EPP|MEI|S\.?A\.?)\b/i

function parseFornecedor(texto: string): { nome: string | null; cnpj: string | null; ie: string | null } {
  // 1) CNPJ via CHAVE DE ACESSO (fonte mais confiável — emitente está nos chars 6..20).
  let cnpj: string | null = null
  const chave = extrairChaveAcesso(texto)
  if (chave) {
    cnpj = formatarCNPJ(chave.slice(6, 20))
  }
  // 2) Fallback: primeiro CNPJ literal do texto
  if (!cnpj) {
    const m = texto.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)
    if (m) cnpj = m[1]!
  }

  // 3) Razão social: olha o BLOCO ANTES de "DESTINATÁRIO" (área do emitente)
  // e procura linha com sufixo de razão social (LTDA/SA/EIRELI/ME/EPP).
  // É muito mais confiável que pegar "primeira linha em CAIXA ALTA".
  const idxDestinatario = texto.search(/DESTINAT[ÁA]RIO/i)
  const blocoEmitente = idxDestinatario > 0 ? texto.slice(0, idxDestinatario) : texto.slice(0, 3000)
  const linhasEmitente = blocoEmitente.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)

  let nome: string | null = null
  // Estratégia A: razão social com sufixo formal
  for (const linha of linhasEmitente) {
    // Pula linhas obviamente ruins (rótulos, números, endereços)
    if (/^N[ºo°]\s|^DATA|^CEP|^CNPJ|NATUREZA\s+DA\s+OPERA|^PROTOCOLO|^CHAVE/i.test(linha)) continue
    if (/^\d/.test(linha)) continue
    const m = linha.match(RE_RAZAO_SUFIXO)
    if (m) {
      nome = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim().toUpperCase()
      break
    }
  }

  // Estratégia B (fallback): primeira linha em CAIXA ALTA "decente"
  if (!nome) {
    const candidatos = linhasEmitente
      .filter(l => l.length >= 6 && l === l.toUpperCase())
      .filter(l => /[A-Z]{3,}/.test(l))
      .filter(l => !/DANFE|NF-?E|CNPJ|CHAVE|NATUREZA|INSCRI[ÇC][ÃA]O|CONTROLE|S[ÉE]RIE|FOLHA|EMITENTE|DESTINAT[ÁA]RIO|FATURA|C[ÁA]LCULO|TRANSPORTADOR|PRODUTO|UF|CFOP|NCM|VENDA\s+PARA|ENTREGA\s+FUTURA|REMETENTE|RETIRADA|PROTOCOLO|RAZ[ÃA]O\s+SOCIAL|NOME\/RAZ/i.test(l))
      .filter(l => !/^\d/.test(l))
      .filter(l => !/CEP:|R\s|RUA\s|AV\.|AVENIDA|QUADRA|SETOR/i.test(l))
    nome = candidatos[0] ?? null
  }

  return { nome, cnpj, ie: null }
}

function parseDocumento(texto: string) {
  const matchN = texto.match(/N[ºo°]\s*([\d.]+)/i)
  const numero = matchN ? matchN[1]!.replace(/\./g, '') : null
  const matchS = texto.match(/S[ée]rie:?\s*(\d+)/i)
  const serie = matchS ? matchS[1]! : null
  const matchData = texto.match(/DATA\s+DA?\s+EMISS[ÃA]O[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})/i)
    ?? texto.match(/(\d{2}\/\d{2}\/\d{4})\s*DATA\s+DA?\s+EMISS[ÃA]O/i)
    ?? texto.match(/EMISS[ÃA]O[:\s]+(\d{2}\/\d{2}\/\d{4})/i)
  const data_emissao = matchData ? parseDateBr(matchData[1]) : null
  const matchValor = texto.match(/VALOR\s+TOTAL\s+DA\s+NOTA[\s\S]{0,80}?([\d.,]+\d{2})/i)
    ?? texto.match(/V\.\s*TOTAL\s+DA\s+NOTA[\s\S]{0,80}?([\d.,]+\d{2})/i)
  const valor_total = matchValor ? parseNumberBr(matchValor[1]) : null
  return { numero, serie, data_emissao, data_vencimento: null, valor_total, tipo: 'NFE' as const }
}

function tentarParseDanfe(texto: string) {
  if (!RE_INICIO_ITENS.test(texto)) return null
  const { itens, notas } = parseDanfeItens(texto)
  if (itens.length === 0) return null
  const fornecedor = parseFornecedor(texto)
  const documento = parseDocumento(texto)
  let okValidacao = 0
  for (const it of itens) {
    if (it.quantidade != null && it.valor_unitario != null && it.valor_total != null) {
      const esperado = it.quantidade * it.valor_unitario
      if (Math.abs(esperado - it.valor_total) <= 0.05) okValidacao++
    }
  }
  const qualidade = itens.length > 0 ? okValidacao / itens.length : 0
  return { fornecedor, documento, itens, observacoes: null, notas_parser: notas, qualidade }
}

// ─── Extração de texto coord-based via unpdf ─────────────────────────────

const Y_TOLERANCE = 4

async function extrairTextoEstruturado(pdfBytes: Uint8Array): Promise<{ texto: string; paginas: number; paginas_com_erro: number; primeiro_erro?: string }> {
  const pdf = await getDocumentProxy(pdfBytes)
  const numPages = pdf.numPages
  const paginasTexto: string[] = []
  let paginasComErro = 0
  let primeiroErro: string | undefined

  for (let n = 1; n <= numPages; n++) {
    try {
      // unpdf expõe extractText, mas pra preservar tabela precisamos das coordenadas.
      // Acessamos o pdf interno (proxy) que dá page.getTextContent().
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const items = (content.items ?? []) as any[]
      type Item = { str: string; x: number; y: number }
      const rich: Item[] = []
      for (const it of items) {
        if (typeof it?.str !== 'string' || it.str.length === 0) continue
        const tr: any = it.transform
        const x = tr ? Number(tr[4] ?? 0) : 0
        const y = tr ? Number(tr[5] ?? 0) : 0
        rich.push({ str: it.str, x, y })
      }
      if (rich.length === 0) continue
      rich.sort((a, b) => b.y - a.y || a.x - b.x)
      const linhas: Item[][] = []
      let linhaAtual: Item[] = []
      let yRef: number | null = null
      for (const it of rich) {
        if (yRef === null || Math.abs(it.y - yRef) <= Y_TOLERANCE) {
          linhaAtual.push(it)
          if (yRef === null) yRef = it.y
        } else {
          if (linhaAtual.length > 0) { linhaAtual.sort((a, b) => a.x - b.x); linhas.push(linhaAtual) }
          linhaAtual = [it]; yRef = it.y
        }
      }
      if (linhaAtual.length > 0) { linhaAtual.sort((a, b) => a.x - b.x); linhas.push(linhaAtual) }

      const linhasTexto = linhas.map(l => {
        let texto = ''
        let lastEndX: number | null = null
        for (const it of l) {
          if (lastEndX !== null && it.x - lastEndX >= 5) texto += '\t'
          else if (texto.length > 0) texto += ' '
          texto += it.str
          lastEndX = it.x + it.str.length * 6
        }
        return texto.replace(/[ \t]+/g, ' ').replace(/\t /g, '\t').replace(/ \t/g, '\t').trim()
      }).filter(l => l.length > 0)

      if (linhasTexto.length > 0) {
        paginasTexto.push(`--- Página ${n} ---\n${linhasTexto.join('\n')}`)
      }
    } catch (err) {
      paginasComErro++
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      if (!primeiroErro) primeiroErro = msg
      console.warn(`[recepcao-pdf-parse] página ${n} falhou: ${msg}`)
    }
  }
  return { texto: paginasTexto.join('\n\n'), paginas: numPages, paginas_com_erro: paginasComErro, ...(primeiroErro ? { primeiro_erro: primeiroErro } : {}) }
}

// Fallback: se extração coord-based falhar, tenta o extractText simples do unpdf
async function extrairTextoSimples(pdfBytes: Uint8Array): Promise<string> {
  const r = await extractText(pdfBytes, { mergePages: true })
  return typeof r.text === 'string' ? r.text : Array.isArray(r.text) ? r.text.join('\n') : ''
}

// ─── HTTP handler ────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { pdf_base64 } = await req.json()
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return new Response(JSON.stringify({ kind: 'erro', erro: 'pdf_base64 ausente ou inválido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Decodifica base64 → Uint8Array
    const binStr = atob(pdf_base64)
    const bytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)

    // 1) Tenta extração coord-based (preserva tabela)
    let textoResult = await extrairTextoEstruturado(bytes)
    let texto = textoResult.texto

    // Se ficou muito pouco texto, tenta extração simples como fallback
    if (texto.length < 200) {
      console.log(`[recepcao-pdf-parse] coord-based devolveu ${texto.length} chars; tentando extractText simples`)
      try {
        texto = await extrairTextoSimples(bytes)
      } catch (err) {
        console.warn(`[recepcao-pdf-parse] extractText fallback falhou: ${err instanceof Error ? err.message : err}`)
      }
    }

    if (texto.length < 200) {
      return new Response(JSON.stringify({
        kind: 'erro',
        erro: 'PDF não retornou texto suficiente — provavelmente é PDF escaneado (imagem). Use Vision como fallback no client.',
        paginas: textoResult.paginas,
        paginas_com_erro: textoResult.paginas_com_erro,
        primeiro_erro: textoResult.primeiro_erro ?? null,
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // 2) Tenta parser DANFE deterministico
    const danfe = tentarParseDanfe(texto)
    if (danfe && danfe.itens.length >= 1 && danfe.qualidade >= 0.5) {
      return new Response(JSON.stringify({
        kind: 'danfe',
        danfe,
        paginas: textoResult.paginas,
        total_chars: texto.length,
        custo_cents: 0,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // 3) Devolve só texto pra IA processar no client
    return new Response(JSON.stringify({
      kind: 'texto',
      texto,
      paginas: textoResult.paginas,
      total_chars: texto.length,
      custo_cents: 0,
      danfe_tentado: danfe ? { itens: danfe.itens.length, qualidade: danfe.qualidade, notas: danfe.notas_parser } : null,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('[recepcao-pdf-parse] erro:', msg, err instanceof Error ? err.stack : '')
    return new Response(JSON.stringify({ kind: 'erro', erro: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
