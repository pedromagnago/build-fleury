// Extrator de texto NATIVO de PDF.
// Quando o PDF tem texto embutido (gerado por sistema, não escaneado), extrair
// o texto direto é dramaticamente mais preciso e barato do que rasterizar e
// mandar pra IA Vision. NF-e impressa em PDF normalmente tem texto nativo.
//
// Estratégia: usa pdfjs e roda getTextContent() em cada página. Para preservar
// a estrutura de linhas, usa o flag `hasEOL` que cada TextItem do pdfjs já
// expõe — bem mais robusto que tentar agrupar por coordenada Y, e não depende
// de o `transform` ser array (foi onde a versão anterior quebrava com
// "value of readableStream is not a function").
//
// Páginas que falham são puladas (try/catch local) — uma página problemática
// não derruba a extração das outras.

const MIN_USEFUL_CHARS = 200  // abaixo disso, consideramos que o PDF é provavelmente escaneado

export interface PdfTextResult {
  texto: string
  paginas: number
  total_chars: number
  /** true se o PDF parece ter texto nativo extraível (>= MIN_USEFUL_CHARS). false sugere PDF escaneado. */
  tem_texto_nativo: boolean
  /** páginas que falharam ao extrair texto (não devem ser tantas; se for igual ao total, é PDF escaneado) */
  paginas_com_erro: number
}

export async function pdfFileToText(file: File): Promise<PdfTextResult> {
  const pdfjs: any = await import('pdfjs-dist')
  const workerMod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  // disableStream + useWorkerFetch:false são workaround conhecido pro erro
  // "value of readableStream is not a function" que ocorre em pdfjs-dist v5+
  // bundleado por Vite (a stream interna do pdfjs entra em conflito com o
  // polyfill de stream do bundle).
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableStream: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  const partesPagina: string[] = []
  let paginasComErro = 0

  for (let n = 1; n <= pdf.numPages; n++) {
    try {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const items = (content.items ?? []) as any[]
      let textoPagina = ''
      for (const it of items) {
        if (typeof it?.str !== 'string') continue   // pula TextMarkedContent / marcadores
        textoPagina += it.str
        // hasEOL é true quando o pdfjs detecta fim de linha; usar isso é muito mais
        // confiável que coordenadas Y (que variam por fonte/embedding).
        if (it.hasEOL) textoPagina += '\n'
        else textoPagina += ' '
      }
      // Normaliza espaços múltiplos sem mexer em quebras de linha
      textoPagina = textoPagina.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
      if (textoPagina.length > 0) {
        partesPagina.push(`--- Página ${n} ---\n${textoPagina}`)
      }
    } catch (err) {
      // Página problemática não bloqueia o resto — só registra
      paginasComErro++
      console.warn(`[pdfText] falha ao extrair texto da página ${n}:`, err)
    }
  }

  const texto = partesPagina.join('\n\n')
  const totalChars = texto.length
  return {
    texto,
    paginas: pdf.numPages,
    total_chars: totalChars,
    tem_texto_nativo: totalChars >= MIN_USEFUL_CHARS,
    paginas_com_erro: paginasComErro,
  }
}
