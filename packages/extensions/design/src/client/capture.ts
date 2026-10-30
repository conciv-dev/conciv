import {snapdom, type SnapdomPlugin} from '@zumer/snapdom'
import {toolError} from '@conciv/extension'
import type {CaptureInput, ViewportResult} from '../shared/defs.js'
import type {LiveComponent} from '../shared/types.js'
import {collectComponents} from './components.js'

export type ClientCapture = {image: string; width: number; height: number; route: string; components: LiveComponent[]}

const DATA_URL_COMMA = ','
const WIDGET_ROOT_SELECTOR = '[data-conciv-root]'

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(DATA_URL_COMMA) + 1))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('The capture could not be read.')))
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

export async function captureStep(input: CaptureInput): Promise<ClientCapture | ViewportResult> {
  const viewport = {width: innerWidth, height: innerHeight}
  if (input.probe === true || input.clear === true) return viewport
  if (input.width !== undefined && input.width !== viewport.width) throw toolError('frame-unsupported')
  const components = collectComponents({root: document})
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [WIDGET_ROOT_SELECTOR],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: [keepBodyMargins],
  })
  const blob = await capture.toBlob({format: 'png'})
  return {
    image: await base64(blob),
    width: viewport.width,
    height: viewport.height,
    route: location.pathname + location.search,
    components,
  }
}
