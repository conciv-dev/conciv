import {CONCIV_UI_SELECTOR} from '@conciv/extension'
import type {PageScreenshot} from '../shared/defs.js'
import {capturePlugins} from './body-margins.js'

const WEBP_QUALITY = 0.8
const DATA_URL_COMMA = ','

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(DATA_URL_COMMA) + 1))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('The screenshot could not be read.')))
    reader.readAsDataURL(blob)
  })
}

export async function screenshot(): Promise<PageScreenshot> {
  const {snapdom} = await import('@zumer/snapdom')
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [CONCIV_UI_SELECTOR],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: capturePlugins,
  })
  const blob = await capture.toBlob({format: 'webp', quality: WEBP_QUALITY})
  const bitmap = await createImageBitmap(blob)
  const {width, height} = bitmap
  bitmap.close()
  return {image: await base64(blob), width, height}
}
