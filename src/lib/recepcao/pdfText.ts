// Extrator de texto NATIVO de PDF, preservando ESTRUTURA TABULAR.
//
// IMPORTANTE: usa o build LEGACY do pdfjs-dist (`legacy/build/pdf.mjs`).
// O build "main" v5+ usa features modernas (ReadableStream, AsyncIterator)
// que conflitam com o polyfill do Vite, gerando o erro recorrente
// "undefined is not a function (near '...value of readableStream...')".
// O legacy é compilado pra es5/es2017 e é totalmente compatível com Vite.
//
// Estratégia coord-based:
//   1. getTextContent() em cada página com disableStream:true
//   2. Cada TextItem traz transform[4]=x e transform[5]=y
//   3. Agrupa por Y (tolerância 4px) → linhas físicas
//   4. Dentro de cada linha, ordena por X; gap >= 5px → coluna separada (\t)
//   5. Output: linhas \n, células \t

const Y_TOLERANCE = 4
const MIN_USEFUL_CHARS = 200

export interface PdfTextResult {
  texto: string
  paginas: number
  total_chars: number
  tem_texto_nativo: boolean
  paginas_com_erro: number
  /** primeiro erro capturado (se houver) — pra debug do operador via window.__pdfTextoDebug */
  primeiro_erro?: string
}

interface RawItem { str: string; x: number; y: number }

export async function pdfFileToText(file: File): Promise<PdfTextResult> {
  // LEGACY build: evita os bugs de ReadableStream/AsyncIterator do build moderno
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerMod: any = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableStream: true,
    disableAutoFetch: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  const paginasTexto: string[] = []
  let paginasComErro = 0
  let primeiroErro: string | undefined

  for (let n = 1; n <= pdf.numPages; n++) {
    try {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const items: RawItem[] = []
      for (const it of (content.items ?? []) as any[]) {
        if (typeof it?.str !== 'string' || it.str.length === 0) continue
        const tr: any = it.transform
        const x = tr ? Number(tr[4] ?? 0) : 0
        const y = tr ? Number(tr[5] ?? 0) : 0
        items.push({ str: it.str, x, y })
      }
      if (items.length === 0) continue

      // Ordena top→bottom (y decrescente em PDF), esquerda→direita
      items.sort((a, b) => b.y - a.y || a.x - b.x)

      // Agrupa por Y
      const linhas: RawItem[][] = []
      let linhaAtual: RawItem[] = []
      let yRef: number | null = null
      for (const it of items) {
        if (yRef === null || Math.abs(it.y - yRef) <= Y_TOLERANCE) {
          linhaAtual.push(it)
          if (yRef === null) yRef = it.y
        } else {
          if (linhaAtual.length > 0) {
            linhaAtual.sort((a, b) => a.x - b.x)
            linhas.push(linhaAtual)
          }
          linhaAtual = [it]
          yRef = it.y
        }
      }
      if (linhaAtual.length > 0) {
        linhaAtual.sort((a, b) => a.x - b.x)
        linhas.push(linhaAtual)
      }

      const linhasTexto = linhas.map(l => {
        let texto = ''
        let lastEndX: number | null = null
        for (const it of l) {
          if (lastEndX !== null && it.x - lastEndX >= 5) {
            texto += '\t'
          } else if (texto.length > 0) {
            texto += ' '
          }
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
      console.warn(`[pdfText] página ${n} falhou: ${msg}`, err)
    }
  }

  const texto = paginasTexto.join('\n\n')
  try { (window as any).__pdfTextoDebug = { texto, paginas: pdf.numPages, paginasComErro, primeiroErro } } catch { /* noop */ }
  return {
    texto,
    paginas: pdf.numPages,
    total_chars: texto.length,
    tem_texto_nativo: texto.length >= MIN_USEFUL_CHARS,
    paginas_com_erro: paginasComErro,
    ...(primeiroErro ? { primeiro_erro: primeiroErro } : {}),
  }
}
