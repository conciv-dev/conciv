import {parse} from 'culori'
import {snapdom} from '@zumer/snapdom'
import {toolError} from '@conciv/extension'
import {DESIGN_ERRORS, type CaptureInput, type ViewportResult} from '../shared/defs.js'
import type {LiveComponent} from '../shared/types.js'
import {keepBodyMargins} from './body-margins.js'
import {collectComponents} from './components.js'
import {requestFrameCapture} from './frame-capture.js'
import {ensureCaptureFrame, removeCaptureFrame} from './frame.js'

export type ClientCapture = {image: string; width: number; height: number; route: string; components: LiveComponent[]}

const DATA_URL_COMMA = ','
const WIDGET_ROOT_SELECTOR = '[data-conciv-root]'
const CANVAS_FALLBACK = '#ffffff'

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

type Size = {width: number; height: number}

function locationRoute(where: Location): string {
  return where.pathname + where.search
}

function frameRoute(frame: HTMLIFrameElement): string | null {
  const where = frame.contentDocument?.location
  return where ? locationRoute(where) : null
}

async function frameAtRoute(size: Size): Promise<HTMLIFrameElement> {
  const input = {url: location.href, ...size}
  const frame = await ensureCaptureFrame(input)
  if (frameRoute(frame) === locationRoute(location)) return frame
  removeCaptureFrame()
  return ensureCaptureFrame(input)
}

function painted(color: string): boolean {
  const parsed = parse(color)
  return parsed !== undefined && (parsed.alpha ?? 1) > 0
}

function canvasBackground(doc: Document): string {
  const view = doc.defaultView
  if (view === null) return CANVAS_FALLBACK
  const root = view.getComputedStyle(doc.documentElement).backgroundColor
  if (painted(root)) return root
  const body = doc.body ? view.getComputedStyle(doc.body).backgroundColor : ''
  if (painted(body)) return body
  return CANVAS_FALLBACK
}

async function composited(input: {blob: Blob; doc: Document} & Size): Promise<Blob> {
  const bitmap = await createImageBitmap(input.blob)
  const canvas = new OffscreenCanvas(input.width, input.height)
  const context = canvas.getContext('2d')
  if (context !== null) {
    context.fillStyle = canvasBackground(input.doc)
    context.fillRect(0, 0, input.width, input.height)
    context.drawImage(bitmap, 0, 0)
  }
  bitmap.close()
  return canvas.convertToBlob({type: 'image/png'})
}

async function captureInFrame(size: Size): Promise<ClientCapture> {
  const frame = await frameAtRoute(size)
  const doc = frame.contentDocument
  if (doc === null) throw toolError('frame-blocked', {message: DESIGN_ERRORS['frame-blocked'].message})
  const components = collectComponents({root: doc})
  const blob = await composited({blob: await requestFrameCapture(frame), doc, ...size})
  return {image: await base64(blob), ...size, route: locationRoute(location), components}
}

export async function captureStep(input: CaptureInput): Promise<ClientCapture | ViewportResult> {
  const viewport = {width: innerWidth, height: innerHeight}
  if (input.clear === true) removeCaptureFrame()
  if (input.probe === true || input.clear === true) return viewport
  if (input.width !== undefined && input.width !== viewport.width) {
    return captureInFrame({width: input.width, height: input.height ?? viewport.height})
  }
  const components = collectComponents({root: document})
  const capture = await snapdom(document.documentElement, {
    clip: 'viewport',
    dpr: 1,
    exclude: [WIDGET_ROOT_SELECTOR],
    excludeMode: 'remove',
    embedFonts: true,
    plugins: [keepBodyMargins],
  })
  const blob = await composited({blob: await capture.toBlob({format: 'png'}), doc: document, ...viewport})
  return {
    image: await base64(blob),
    width: viewport.width,
    height: viewport.height,
    route: locationRoute(location),
    components,
  }
}
