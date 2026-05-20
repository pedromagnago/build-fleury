// Pré-processamento de imagens antes de mandar pra Vision API.
//
// PROBLEMA QUE ISTO RESOLVE:
//   1. Foto de celular vem 3–10 MB. Em base64 (+33%) vira 4–13 MB, e o
//      `supabase.functions.invoke` morre com erro genérico "Failed to send" ao
//      passar do teto de payload da edge function.
//   2. iPhone manda HEIC/HEIF — formato que navegador não decodifica nativo e a
//      Vision API rejeita (só aceita PNG/JPEG/WEBP/GIF).
//   3. Print de tela em PNG 4K fica desnecessariamente pesado pra OCR — 2000 px
//      no lado maior é suficiente pra ler até a fonte mais fina de DANFE.
//
// ESTRATÉGIA:
//   - HEIC/HEIF → converte pra JPEG via heic2any (dynamic import: lib ~600 KB
//     só carrega se o usuário soltar HEIC).
//   - JPEG/PNG/WEBP → redimensiona pra max 2000 px no lado maior, re-encoda em
//     JPEG q=0.85 num <canvas>. Mantém aspect ratio.
//   - Imagens pequenas (< 1 MB e <= 2000 px) passam direto sem re-encode (perda
//     de qualidade desnecessária).

const MAX_DIM = 2000      // px no lado maior
const JPEG_QUALITY = 0.85
const SKIP_IF_UNDER = 1_000_000  // 1 MB — abaixo disso, não comprime

/** Resultado da compressão: bytes finais + flag se mexeu. */
export interface CompressedImage {
  base64: string
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  originalBytes: number
  finalBytes: number
  comprimida: boolean
}

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif') ||
         file.type === 'image/heic' || file.type === 'image/heif'
}

/** Lê um Blob/File e devolve base64 sem prefixo data:. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  // chunked pra evitar stack overflow em arquivos grandes
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(bin)
}

/** Carrega um Blob num <img> e devolve as dimensões + o elemento decodificado. */
async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Falha ao decodificar imagem (formato não suportado pelo navegador)'))
      img.src = url
    })
    if (typeof img.decode === 'function') {
      try { await img.decode() } catch { /* alguns browsers ainda travam em decode() — ignora */ }
    }
    return img
  } finally {
    // OBS: NÃO revogamos aqui — alguns canvas.drawImage assíncronos ainda lêem.
    // O GC do navegador resolve quando a Image sair de escopo.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/**
 * Converte HEIC/HEIF pra JPEG via heic2any. Dynamic import — só carrega a lib
 * (~600 KB) se o usuário realmente soltou um HEIC.
 */
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9,  // perda mínima aqui — a compressão final vem depois
  })
  // heic2any pode devolver Blob ou Blob[] (HEIC multi-frame). Pegamos o primeiro frame.
  return Array.isArray(result) ? result[0]! : result
}

/**
 * Processa um arquivo de imagem (incluindo HEIC) e devolve base64 + metadados,
 * pronto pra mandar como image_url na Vision API.
 */
export async function processImageForVision(file: File): Promise<CompressedImage> {
  const originalBytes = file.size
  let workingBlob: Blob = file

  // 1. HEIC → JPEG
  if (isHeic(file)) {
    workingBlob = await convertHeicToJpeg(file)
  }

  // 2. Decode pra ler dimensões
  const img = await loadImageElement(workingBlob)
  const { naturalWidth: w0, naturalHeight: h0 } = img

  // 3. Skip se já é pequeno e não foi HEIC
  if (!isHeic(file) && originalBytes < SKIP_IF_UNDER && Math.max(w0, h0) <= MAX_DIM) {
    const base64 = await blobToBase64(workingBlob)
    const mime = (file.type === 'image/png' ? 'image/png'
                : file.type === 'image/webp' ? 'image/webp'
                : 'image/jpeg') as CompressedImage['mime']
    return {
      base64, mime, width: w0, height: h0,
      originalBytes, finalBytes: originalBytes, comprimida: false,
    }
  }

  // 4. Redimensiona mantendo aspect ratio
  const scale = Math.min(1, MAX_DIM / Math.max(w0, h0))
  const w = Math.round(w0 * scale)
  const h = Math.round(h0 * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // Fundo branco — JPEG não tem alpha, evita pixels pretos em PNG transparente
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('canvas.toBlob retornou null')),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
  canvas.remove()

  const base64 = await blobToBase64(blob)
  return {
    base64, mime: 'image/jpeg', width: w, height: h,
    originalBytes, finalBytes: blob.size, comprimida: true,
  }
}

/** Processa várias imagens em paralelo (limita concorrência pra não estourar memória). */
export async function processImagesForVision(files: File[]): Promise<CompressedImage[]> {
  // Concorrência 3: balanceia tempo vs picos de memória em devices fracos
  const out: CompressedImage[] = new Array(files.length)
  const CONC = 3
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONC, files.length) }, async () => {
      while (true) {
        const i = cursor++
        if (i >= files.length) return
        out[i] = await processImageForVision(files[i]!)
      }
    }),
  )
  return out
}

/** Aceita lista de bases64 (página de PDF rasterizada, etc.) e comprime cada uma.
 *  Útil porque pdfFileToImages já entrega base64 — só queremos garantir tamanho. */
export async function compressBase64Images(
  pages: Array<{ base64: string; width: number; height: number; pagina: number }>,
): Promise<Array<{ base64: string; mime: 'image/jpeg'; width: number; height: number; pagina: number; originalBytes: number; finalBytes: number }>> {
  const out: Array<{ base64: string; mime: 'image/jpeg'; width: number; height: number; pagina: number; originalBytes: number; finalBytes: number }> = []
  for (const p of pages) {
    // Se já está abaixo do limite, mantém
    const originalBytes = Math.floor(p.base64.length * 3 / 4)
    if (Math.max(p.width, p.height) <= MAX_DIM && originalBytes < SKIP_IF_UNDER) {
      out.push({ ...p, mime: 'image/jpeg', originalBytes, finalBytes: originalBytes })
      continue
    }
    // Caso contrário, redesenha em canvas menor
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Falha ao decodificar página ${p.pagina}`))
      img.src = `data:image/jpeg;base64,${p.base64}`
    })
    const scale = Math.min(1, MAX_DIM / Math.max(p.width, p.height))
    const w = Math.round(p.width * scale)
    const h = Math.round(p.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/jpeg', JPEG_QUALITY)
    })
    canvas.remove()
    const base64 = await blobToBase64(blob)
    out.push({
      base64, mime: 'image/jpeg', width: w, height: h, pagina: p.pagina,
      originalBytes, finalBytes: blob.size,
    })
  }
  return out
}
