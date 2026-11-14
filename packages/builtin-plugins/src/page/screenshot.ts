import {CONCIV_UI_SELECTOR} from '@conciv/extension'
import {capturePlugins} from './capture-plugins.js'

const WEBP_QUALITY = 0.8

export type PageScreenshot = {width: number; height: number; warnings?: string[]; data: Uint8Array<ArrayBuffer>}

function readable(selector: string): boolean {
  try {
    document.querySelector(selector)
    return true
  } catch {
    return false
  }
}

export async function screenshot(input: {exclude?: string[]}): Promise<PageScreenshot> {
  const requested = input.exclude ?? []
  const warnings = requested
    .filter((selector) => !readable(selector))
    .map((selector) => `ignored invalid selector: ${selector}`)
  const {snapdom} = await import('@zumer/snapdom')
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [CONCIV_UI_SELECTOR, ...requested.filter(readable)],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: capturePlugins,
  })
  const blob = await capture.toBlob({format: 'webp', quality: WEBP_QUALITY})
  const bitmap = await createImageBitmap(blob)
  const {width, height} = bitmap
  bitmap.close()
  return {width, height, ...(warnings.length > 0 ? {warnings} : {}), data: new Uint8Array(await blob.arrayBuffer())}
}
