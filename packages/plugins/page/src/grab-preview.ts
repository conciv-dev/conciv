import type {ImagePreview, DomPreview} from '@conciv/grab'
import {capturePlugins} from './screenshot.js'
import {pageErrors} from './errors/errors.js'

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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'load',
      () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(pageErrors.PREVIEW_UNREADABLE())),
      {once: true},
    )
    reader.addEventListener('error', () => reject(pageErrors.PREVIEW_UNREADABLE({cause: reader.error ?? undefined})), {
      once: true,
    })
    reader.readAsDataURL(blob)
  })
}

async function elementImage(el: Element): Promise<ImagePreview> {
  const {snapdom} = await import('@zumer/snapdom')
  const capture = await snapdom(el, {dpr: 1, embedFonts: true, plugins: capturePlugins})
  const blob = await capture.toBlob({format: 'webp', quality: FIT_QUALITY})
  const bitmap = await createImageBitmap(blob)
  const {width, height} = bitmap
  bitmap.close()
  return {kind: 'image', dataUrl: await readDataUrl(blob), width, height}
}

export async function capturePreview(el: Element): Promise<ImagePreview | DomPreview> {
  await nextFrame()
  return elementImage(el).catch(() => captureElement(el))
}

async function captureElement(el: Element): Promise<DomPreview> {
  await nextFrame()
  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true)
  const rules: string[] = []
  const runs: TextRun[] = []
  if (!isStyledElement(clone)) return {kind: 'dom', html: '', width: rect.width, height: rect.height}
  inlineComputedStyles(el, clone, {id: crypto.randomUUID().slice(0, 8), rules}, runs)
  await correctFallbackMetrics(runs)
  neutralizeLayout(clone)

  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
  const node = document.createElement('div')
  if (rules.length > 0) {
    const style = document.createElement('style')
    style.textContent = rules.join('')
    node.appendChild(style)
  }
  node.appendChild(clone)
  return {kind: 'dom', html: node.outerHTML, width: rect.width, height: rect.height}
}

const SKIP_PROPS: readonly string[] = ['cursor', 'pointer-events', 'user-select', '-webkit-user-select']

function isTextRun(node: Element): boolean {
  return node.children.length === 0 && (node.textContent ?? '').trim() !== ''
}

function computedCssText(cs: CSSStyleDeclaration): string {
  let cssText = ''
  for (const prop of cs) {
    if (SKIP_PROPS.includes(prop) || prop.startsWith('--')) continue
    cssText += `${prop}:${cs.getPropertyValue(prop)};`
  }
  return cssText
}

function inlineComputedStyles(src: Element, dst: StyledElement, pseudo: PseudoRules, runs: TextRun[]): void {
  dst.style.cssText = computedCssText(getComputedStyle(src))
  capturePseudo(src, dst, pseudo)
  if (isStyledElement(src) && isTextRun(src)) runs.push({source: src, clone: dst})
  const sk = src.children
  const dk = dst.children
  for (let i = 0; i < sk.length; i++) {
    const childSrc = sk[i]
    const childDst = dk[i]
    if (childSrc && childDst && isStyledElement(childDst)) inlineComputedStyles(childSrc, childDst, pseudo, runs)
  }
}

type PseudoRules = {id: string; rules: string[]}

function capturePseudo(src: Element, dst: StyledElement, {id, rules}: PseudoRules): void {
  for (const pseudo of ['::before', '::after']) {
    const pcs = getComputedStyle(src, pseudo)
    const content = pcs.content
    if (!content || content === 'none' || content === 'normal') continue
    const cls = `conciv-grab-pseudo-${id}-${rules.length}`
    dst.classList.add(cls)
    let t = ''
    for (const prop of pcs) t += `${prop}:${pcs.getPropertyValue(prop)};`
    rules.push(`.${cls}${pseudo}{${t}}`)
  }
}

function neutralizeLayout(root: StyledElement): void {
  root.style.position = 'static'
  root.style.margin = '0'
  root.style.top = 'auto'
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = 'auto'
  root.style.transform = 'none'
}

const MEASURED_PROPS = [
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-stretch',
  'font-variant',
  'font-feature-settings',
  'font-variation-settings',
  'font-kerning',
  'font-optical-sizing',
  'font-synthesis-weight',
  'font-synthesis-style',
  'word-spacing',
  'text-transform',
]

const EPSILON_PX = 0.5

const PROBE_STEP_PX = 1

export type StyledElement = HTMLElement | SVGElement

export function isStyledElement(node: Node): node is StyledElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}

export type TextRun = {source: StyledElement; clone: StyledElement}

type Candidate = {run: TextRun; base: number; css: string; steppedCss: string; text: string}

type Probe = {live: HTMLElement; fallback: HTMLElement; stepped: HTMLElement}

type Measurer = {doc: Document; close: () => void}

function unquoted(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

function splitFamilies(value: string): string[] {
  return value
    .split(',')
    .map(unquoted)
    .filter((name) => name !== '')
}

function webfontFamilies(): Set<string> {
  const families = new Set<string>()
  document.fonts.forEach((face) => families.add(unquoted(face.family)))
  return families
}

function measureLetterSpacing(styles: CSSStyleDeclaration): number {
  const parsed = Number.parseFloat(styles.letterSpacing)
  return Number.isFinite(parsed) ? parsed : 0
}

function measurementCss(styles: CSSStyleDeclaration, letterSpacing: number): string {
  const declarations = MEASURED_PROPS.map((prop) => `${prop}:${styles.getPropertyValue(prop)}`).join(';')
  return `position:absolute;top:0;left:0;white-space:nowrap;visibility:hidden;${declarations};letter-spacing:${letterSpacing}px`
}

function probeSpan(doc: Document, css: string, text: string): HTMLElement {
  const span = doc.createElement('span')
  span.style.cssText = css
  span.textContent = text
  return span
}

async function openMeasurer(): Promise<Measurer | null> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:200px;border:0;visibility:hidden'
  frame.srcdoc = '<!doctype html><html><head></head><body style="margin:0"></body></html>'
  document.body.appendChild(frame)
  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), {once: true})
  })
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return null
  }
  return {doc, close: () => frame.remove()}
}

function collectCandidates(runs: readonly TextRun[]): Candidate[] {
  const webfonts = webfontFamilies()
  return runs.flatMap((run) => {
    const text = run.source.textContent ?? ''
    if (text.trim() === '') return []
    const styles = getComputedStyle(run.source)
    if (!splitFamilies(styles.fontFamily).some((family) => webfonts.has(family))) return []
    const base = measureLetterSpacing(styles)
    return [
      {
        run,
        base,
        text,
        css: measurementCss(styles, base),
        steppedCss: measurementCss(styles, base + PROBE_STEP_PX),
      },
    ]
  })
}

export async function correctFallbackMetrics(runs: readonly TextRun[]): Promise<void> {
  if (runs.length === 0 || document.fonts.size === 0) return
  const candidates = collectCandidates(runs)
  if (candidates.length === 0) return
  const measurer = await openMeasurer()
  if (!measurer) return
  const hostHolder = document.createElement('div')
  hostHolder.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:hidden'
  const frameHolder = measurer.doc.createElement('div')
  const probes: Probe[] = candidates.map((candidate) => ({
    live: probeSpan(document, candidate.css, candidate.text),
    fallback: probeSpan(measurer.doc, candidate.css, candidate.text),
    stepped: probeSpan(measurer.doc, candidate.steppedCss, candidate.text),
  }))
  for (const probe of probes) {
    hostHolder.appendChild(probe.live)
    frameHolder.appendChild(probe.fallback)
    frameHolder.appendChild(probe.stepped)
  }
  document.body.appendChild(hostHolder)
  measurer.doc.body.appendChild(frameHolder)
  try {
    const widths = probes.map((probe) => ({
      live: probe.live.getBoundingClientRect().width,
      fallback: probe.fallback.getBoundingClientRect().width,
      stepped: probe.stepped.getBoundingClientRect().width,
    }))
    candidates.forEach((candidate, index) => {
      const measured = widths[index]
      if (!measured) return
      if (Math.abs(measured.live - measured.fallback) < EPSILON_PX) return
      const slots = (measured.stepped - measured.fallback) / PROBE_STEP_PX
      if (slots <= 0) return
      candidate.run.clone.style.letterSpacing = `${candidate.base + (measured.live - measured.fallback) / slots}px`
    })
  } finally {
    hostHolder.remove()
    measurer.close()
  }
}
