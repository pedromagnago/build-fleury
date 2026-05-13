// Extrator de texto NATIVO de PDF, preservando ESTRUTURA TABULAR.
//
// Diferente da versão anterior (que usava hasEOL), agora reconstruímos as
// linhas/colunas usando as COORDENADAS X/Y de cada TextItem. Isso preserva a
// tabela do DANFE praticamente como ela é vista, com `\t` entre células e
// `\n` entre linhas — facilitando o parser determinístico downstream.
//
// hasEOL falhava em DANFE porque o pdfjs nem sempre marca EOL no meio de uma
// linha tabular (cada célula vira um TextItem sem EOL).
//
// Estratégia:
//   1. getTextContent() em cada página com disableStream:true (evita o bug
//      "value of readableStream is not a function" do Vite + pdfjs v5)
//   2. Pra cada TextItem: extrai (str, x=transform[4], y=transform[5])
//   3. Ordena top→bottom (y decrescente, pdf origin é bottom-left)
//   4. Agrupa por Y com tolerância de 4px → "linha física"
//   5. Dentro de cada linha, ordena por X e junta com TAB
//   6. Linhas dentro de uma página separadas por \n; páginas separadas por \n\n

const Y_TOLERANCE = 4   // px de tolerância pra considerar items na mesma linha
const MIN_USEFUL_CHARS = 200

export interface PdfTextResult {
  texto: string
  paginas: number
  total_chars: number
  tem_texto_nativo: boolean
  paginas_com_erro: number
}

interface RawItem {
  str: string
  x: number
  y: number
}

export async function pdfFileToText(file: File): Promise<PdfTextResult> {
  const pdfjs: any = await import('pdfjs-dist')
  const workerMod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableStream: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  const paginasTexto: string[] = []
  let paginasComErro = 0

  for (let n = 1; n <= pdf.numPages; n++) {
    try {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const items: RawItem[] = []
      for (const it of (content.items ?? []) as any[]) {
        if (typeof it?.str !== 'string') continue
        const str = it.str
        if (str.length === 0) continue
        const tr: any = it.transform
        const x = tr ? Number(tr[4] ?? 0) : 0
        const y = tr ? Number(tr[5] ?? 0) : 0
        items.push({ str, x, y })
      }
      if (items.length === 0) continue

      // Ordena top→bottom, esquerda→direita pra ter base estável
      items.sort((a, b) => b.y - a.y || a.x - b.x)

      // Agrupa por Y com tolerância
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

      // Reconstroi texto: cells da linha separadas por TAB; linhas por \n
      const linhasTexto = linhas.map(l => {
        // Mescla items adjacentes (gap pequeno = mesma "célula")
        // Heurística: gap < 5px = mesmo grupo, gap >= 5px = nova célula (tab)
        let texto = ''
        let lastEndX: number | null = null
        for (const it of l) {
          if (lastEndX !== null && it.x - lastEndX >= 5) {
            texto += '\t'
          } else if (texto.length > 0) {
            texto += ' '
          }
          texto += it.str
          // estimar fim da string: x + ~6px por char (heurística grosseira)
          lastEndX = it.x + it.str.length * 6
        }
        return texto.replace(/[ \t]+/g, ' ').replace(/\t /g, '\t').replace(/ \t/g, '\t').trim()
      }).filter(l => l.length > 0)

      if (linhasTexto.length > 0) {
        paginasTexto.push(`--- Página ${n} ---\n${linhasTexto.join('\n')}`)
      }
    } catch (err) {
      paginasComErro++
      console.warn(`[pdfText] falha ao extrair texto da página ${n}:`, err)
    }
  }

  const texto = paginasTexto.join('\n\n')
  // Expõe pra debug (operador inspeciona via console: window.__pdfTextoDebug)
  try { (window as any).__pdfTextoDebug = { texto, paginas: pdf.numPages, paginasComErro } } catch { /* noop */ }
  return {
    texto,
    paginas: pdf.numPages,
    total_chars: texto.length,
    tem_texto_nativo: texto.length >= MIN_USEFUL_CHARS,
    paginas_com_erro: paginasComErro,
  }
}
