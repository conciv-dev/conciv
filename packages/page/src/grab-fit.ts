import type {ImagePreview} from '@conciv/grab'

const FIT_MIME = 'image/webp'

const FIT_QUALITY = 0.8

const FIT_SCALE_STEP = 0.75

const MIN_FIT_SCALE = 0.05

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

async function decoded(dataUrl: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.src = dataUrl
  try {
    await image.decode()
  } catch {
    return null
  }
  return image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null
}

function reencoded(image: HTMLImageElement, scale: number): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (context === null) return null
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL(FIT_MIME, FIT_QUALITY)
    return dataUrl.startsWith('data:image/') ? dataUrl : null
  } catch {
    return null
  }
}

function smallestWithin(image: HTMLImageElement, maxBytes: number): string | null {
  let scale = 1
  let smallest: string | null = null
  while (scale >= MIN_FIT_SCALE) {
    const candidate = reencoded(image, scale)
    if (candidate !== null) smallest = candidate
    if (candidate !== null && byteLength(candidate) <= maxBytes) return candidate
    scale *= FIT_SCALE_STEP
  }
  return smallest
}

export async function fitImagePreview(preview: ImagePreview, maxBytes: number): Promise<ImagePreview> {
  if (byteLength(preview.dataUrl) <= maxBytes) return preview
  const image = await decoded(preview.dataUrl)
  if (image === null) return preview
  const fitted = smallestWithin(image, maxBytes)
  if (fitted === null) return preview
  return {...preview, dataUrl: fitted}
}
