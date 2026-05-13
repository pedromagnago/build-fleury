// Extrator de texto NATIVO de PDF.
// Quando o PDF tem texto embutido (gerado por sistema, não escaneado), extrair
// o texto direto é dramaticamente mais preciso e barato do que rasterizar e
// mandar pra IA Vision. NF-e impressa em PDF normalmente tem texto nativo.
//
// Estratégia: usa pdfjs (mesmo lib do pdfToImages) e roda getTextContent() em
// cada página, agrupando itens por posição Y (linha) e ordenando por X (coluna)
// pra preservar a estrutura tabular o mais possível.

const Y_TOLERANCE = 2.0   // px — itens com diferença de Y abaixo disso são "mesma linha"
const MIN_USEFUL_CHARS = 200  // abaixo disso, consideramos que o PDF é provavelmente escaneado

export interface PdfTextResult {
  texto: string
  paginas: number
  total_chars: number
  /** true se o PDF parece ter texto nativo extraível (>= MIN_USEFUL_CHARS). false sugere PDF escaneado. */
  tem_texto_nativo: boolean
}

export async function pdfFileToText(file: File): Promise<PdfTextResult> {
  const pdfjs = await import('pdfjs-dist')
  const workerMod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise

  const partes: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    // items: { str, transform: [a,b,c,d,e,f] } — e=x, f=y (em pdf coord; y cresce pra cima)
    type Item = { str: string; x: number; y: number }
    const items: Item[] = (content.items as any[])
      .filter(it => typeof it.str === 'string' && it.str.length > 0)
      .map(it => ({
        str: it.str as string,
        x: Number(it.transform?.[4] ?? 0),
        y: Number(it.transform?.[5] ?? 0),
      }))
    // Agrupa por linha (Y próximo) e ordena por X dentro da linha
    items.sort((a, b) => b.y - a.y || a.x - b.x)  // y desc (topo da página primeiro), x asc
    const linhas: string[] = []
    let linhaAtual: Item[] = []
    let yRef: number | null = null
    for (const it of items) {
      if (yRef === null || Math.abs(it.y - yRef) <= Y_TOLERANCE) {
        linhaAtual.push(it)
        if (yRef === null) yRef = it.y
      } else {
        // Fecha a linha anterior — ordena por X e junta com separador visível (\t)
        linhaAtual.sort((a, b) => a.x - b.x)
        linhas.push(linhaAtual.map(i => i.str).join('\t'))
        linhaAtual = [it]
        yRef = it.y
      }
    }
    if (linhaAtual.length > 0) {
      linhaAtual.sort((a, b) => a.x - b.x)
      linhas.push(linhaAtual.map(i => i.str).join('\t'))
    }
    if (linhas.length > 0) {
      partes.push(`--- Página ${n} ---\n${linhas.join('\n')}`)
    }
  }
  const texto = partes.join('\n\n')
  const totalChars = texto.length
  return {
    texto,
    paginas: pdf.numPages,
    total_chars: totalChars,
    tem_texto_nativo: totalChars >= MIN_USEFUL_CHARS,
  }
}
