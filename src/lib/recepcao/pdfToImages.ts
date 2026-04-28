// Converte um PDF em array de imagens base64 (1 por página).
// Usa pdfjs-dist via dynamic import — só carrega quando o usuário solta PDF.
//
// Estratégia: render cada página em um <canvas> com escala 2x (boa pra vision)
// e exporta como JPEG ~85% (menor que PNG, suficiente para OCR).

const SCALE = 2.0
const JPEG_QUALITY = 0.85

export interface PdfPageImage {
  pagina: number
  base64: string  // sem prefixo data:image/jpeg;base64,
  width: number
  height: number
}

export async function pdfFileToImages(file: File): Promise<PdfPageImage[]> {
  // Dynamic import — não inclui no bundle inicial
  const pdfjs = await import('pdfjs-dist')
  // Worker do pdfjs (mesma versão do main)
  const workerMod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise

  const out: PdfPageImage[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')!
    // Fundo branco pra evitar transparência preta
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const base64 = dataUrl.split(',')[1] ?? ''
    out.push({ pagina: n, base64, width: canvas.width, height: canvas.height })
    canvas.remove()
  }
  return out
}
