import {describe, expect, it} from 'vitest'
import {grabToFile, parseGrabPayload} from '@conciv/grab/grab-attachment'
import type {Grab, ImagePreview} from '@conciv/grab'
import {fitImagePreview} from '../src/grab-fit.js'

function noiseDataUrl(size: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('the test browser gave no 2d context')
  const pixels = context.createImageData(size, size)
  let seed = 0x2f6e_2b1
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    pixels.data[index] = seed & 0xff
    pixels.data[index + 1] = (seed >>> 8) & 0xff
    pixels.data[index + 2] = (seed >>> 16) & 0xff
    pixels.data[index + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function imagePreview(dataUrl: string, size: number): ImagePreview {
  return {kind: 'image', dataUrl, width: size, height: size}
}

function grabWith(preview: ImagePreview): Grab {
  return {
    text: 'the payment card at src/card.tsx:42:3',
    preview,
    source: {componentName: 'PaymentCardCell', filePath: 'src/card.tsx', lineNumber: 42},
    rect: {x: 0, y: 0, width: preview.width, height: preview.height},
  }
}

describe('fitImagePreview', () => {
  it('returns a preview that already fits untouched', async () => {
    const preview = imagePreview(noiseDataUrl(8), 8)

    const fitted = await fitImagePreview(preview, 1_000_000)

    expect(fitted).toEqual(preview)
    expect(fitted.dataUrl).toBe(preview.dataUrl)
  })

  it('refits an oversized preview so it survives a payload round-trip as a smaller image', async () => {
    const original = imagePreview(noiseDataUrl(320), 320)
    const budget = 20_000
    expect(byteLength(original.dataUrl)).toBeGreaterThan(budget)

    const fitted = await fitImagePreview(original, budget)

    expect(byteLength(fitted.dataUrl)).toBeLessThanOrEqual(budget)
    expect(fitted.width).toBe(320)
    expect(fitted.height).toBe(320)

    const payload = parseGrabPayload(await grabToFile(grabWith(fitted)).text())

    expect(payload?.preview).toEqual(fitted)
  })

  it('keeps an image rather than dropping it when nothing can reach the budget', async () => {
    const original = imagePreview(noiseDataUrl(320), 320)

    const fitted = await fitImagePreview(original, 1)

    expect(fitted.kind).toBe('image')
    expect(fitted.dataUrl.startsWith('data:image/')).toBe(true)
    expect(byteLength(fitted.dataUrl)).toBeLessThan(byteLength(original.dataUrl))
  })

  it('returns the original preview when the data url cannot be decoded', async () => {
    const broken = imagePreview('data:image/png;base64,notreallyanimage', 320)

    const fitted = await fitImagePreview(broken, 10)

    expect(fitted).toEqual(broken)
  })
})
