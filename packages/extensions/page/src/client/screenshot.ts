import type {SnapdomPlugin} from '@zumer/snapdom'
import type {PageScreenshot} from '../shared/defs.js'

const WEBP_QUALITY = 0.8
const DATA_URL_COMMA = ','
const WIDGET_ROOT_SELECTOR = '[data-conciv-root]'

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

const keepBodyMargins: SnapdomPlugin = {
  name: 'keep-body-margins',
  afterClone: (context) => {
    const root = context.clone
    const body = root?.querySelector(':scope > body')
    if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) return
    body.style.removeProperty('margin-top')
    body.style.removeProperty('margin-bottom')
    root.style.display = 'flow-root'
  },
}

export async function screenshot(): Promise<PageScreenshot> {
  const {snapdom} = await import('@zumer/snapdom')
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [WIDGET_ROOT_SELECTOR],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: [keepBodyMargins],
  })
  const blob = await capture.toBlob({format: 'webp', quality: WEBP_QUALITY})
  const bitmap = await createImageBitmap(blob)
  const {width, height} = bitmap
  bitmap.close()
  return {image: await base64(blob), width, height}
}
