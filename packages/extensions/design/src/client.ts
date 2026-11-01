import Specificity, {type SpecificityObject} from '@bramus/specificity'
import {snapdom} from '@zumer/snapdom'
import {z} from 'zod'
import {toolError, defineExtension, type RegisterExtension} from '@conciv/extension'
import {keepBodyMargins} from '@conciv/extension-page/body-margins'
import {formatHex, formatHex8, parse} from 'culori'
import {
  DESIGN_ERRORS,
  DESIGN_EXTENSION_NAME,
  tabCaptureDef,
  winnerDef,
  type TabCaptureInput,
  type ViewportResult,
  type WinnerInput,
  type WinnerResult,
} from './shared/defs.js'
import {
  CAPTURE_READY,
  CAPTURE_REQUEST,
  designConfig,
  propertyAliases,
  SOURCE_ATTR,
  TOLERANCES,
} from './shared/tolerances.js'
import type {Box, Glyph, LiveComponent, LiveStyles, SourceLoc, Winner} from './shared/types.js'

const captureRequest = z.object({type: z.literal(CAPTURE_REQUEST)})
const captureReady = z.object({type: z.literal(CAPTURE_READY)})
const captureReply = z.union([z.object({blob: z.instanceof(Blob)}), z.object({error: z.string()})])

function insideCaptureFrame(): boolean {
  try {
    return window.frameElement?.hasAttribute('data-conciv-capture') === true
  } catch {
    return false
  }
}

async function answer(port: MessagePort): Promise<void> {
  try {
    const capture = await snapdom(document.documentElement, {dpr: 1, embedFonts: true, plugins: [keepBodyMargins]})
    port.postMessage({blob: await capture.toBlob({format: 'png'})})
  } catch (error) {
    port.postMessage({error: error instanceof Error ? error.message : String(error)})
  } finally {
    port.close()
  }
}

function answerCaptureRequests(): void {
  if (typeof window === 'undefined' || !insideCaptureFrame()) return
  window.addEventListener('message', (event) => {
    const port = event.ports[0]
    if (event.source !== window.parent || port === undefined) return
    if (!captureRequest.safeParse(event.data).success) return
    void answer(port)
  })
  window.parent.postMessage({type: CAPTURE_READY}, location.origin)
}

function frameAnswering(input: {frame: HTMLIFrameElement; signal: AbortSignal}): Promise<void> {
  return new Promise<void>((resolve) => {
    const listen = (event: MessageEvent): void => {
      if (event.source !== input.frame.contentWindow || !captureReady.safeParse(event.data).success) return
      window.removeEventListener('message', listen)
      resolve()
    }
    window.addEventListener('message', listen)
    input.signal.addEventListener('abort', () => window.removeEventListener('message', listen), {once: true})
  })
}

function requestFrameCapture(frame: HTMLIFrameElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const target = frame.contentWindow
    if (target === null) return reject(new Error('The capture frame has no window.'))
    const channel = new MessageChannel()
    const signal = AbortSignal.timeout(TOLERANCES.frameSettleMs)
    signal.addEventListener('abort', () => {
      channel.port1.close()
      reject(toolError('frame-timeout', {message: DESIGN_ERRORS['frame-timeout'].message}))
    })
    channel.port1.addEventListener('message', (event) => {
      channel.port1.close()
      const reply = captureReply.safeParse(event.data)
      if (!reply.success) return reject(new Error('The capture frame sent an unreadable reply.'))
      if ('error' in reply.data) return reject(new Error(reply.data.error))
      resolve(reply.data.blob)
    })
    channel.port1.start()
    target.postMessage({type: CAPTURE_REQUEST}, location.origin, [channel.port2])
  })
}

const FRAME_SELECTOR = 'iframe[data-conciv-capture]'

type FrameInput = {url: string; width: number; height: number}

function currentFrame(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(FRAME_SELECTOR)
}

function sameFrame(input: {frame: HTMLIFrameElement} & FrameInput): boolean {
  return (
    input.frame.getAttribute('src') === input.url &&
    input.frame.width === String(input.width) &&
    input.frame.height === String(input.height)
  )
}

function untilAbort<T>(input: {promise: Promise<T>; signal: AbortSignal}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(input.signal.reason)
    if (input.signal.aborted) return abort()
    input.signal.addEventListener('abort', abort, {once: true})
    input.promise.then(resolve, reject).finally(() => input.signal.removeEventListener('abort', abort))
  })
}

function loaded(frame: HTMLIFrameElement): Promise<void> {
  return new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), {once: true}))
}

function readDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument
  } catch {
    return null
  }
}

function quietFrames(input: {doc: Document; signal: AbortSignal}): Promise<void> {
  return new Promise<void>((resolve) => {
    const seen = {records: 0, quiet: 0}
    const observer = new MutationObserver((records) => {
      seen.records += records.length
    })
    observer.observe(input.doc.body ?? input.doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    const tick = (): void => {
      if (input.signal.aborted) {
        observer.disconnect()
        return
      }
      seen.quiet = seen.records === 0 ? seen.quiet + 1 : 0
      seen.records = 0
      if (seen.quiet < 2) {
        requestAnimationFrame(tick)
        return
      }
      observer.disconnect()
      resolve()
    }
    requestAnimationFrame(tick)
  })
}

async function settle(input: {frame: HTMLIFrameElement; fresh: boolean}): Promise<void> {
  const signal = AbortSignal.timeout(TOLERANCES.frameSettleMs)
  const load = input.fresh ? loaded(input.frame) : Promise.resolve()
  const answering = input.fresh ? frameAnswering({frame: input.frame, signal}) : Promise.resolve()
  if (input.fresh) document.body.appendChild(input.frame)
  try {
    await untilAbort({promise: load, signal})
    const doc = readDocument(input.frame)
    if (!doc) throw toolError('frame-blocked', {message: DESIGN_ERRORS['frame-blocked'].message})
    await untilAbort({promise: doc.fonts.ready, signal})
    await untilAbort({promise: quietFrames({doc, signal}), signal})
    await untilAbort({promise: answering, signal})
  } catch (error) {
    if (!signal.aborted) throw error
    throw toolError('frame-timeout', {message: DESIGN_ERRORS['frame-timeout'].message})
  }
}

function captureFrameAt(size: {width: number; height: number}): HTMLIFrameElement | null {
  const frame = currentFrame()
  if (frame === null) return null
  return frame.width === String(size.width) && frame.height === String(size.height) ? frame : null
}

function removeCaptureFrame(): void {
  currentFrame()?.remove()
}

async function ensureCaptureFrame(input: FrameInput): Promise<HTMLIFrameElement> {
  const existing = currentFrame()
  if (existing && sameFrame({frame: existing, ...input})) {
    await settle({frame: existing, fresh: false})
    return existing
  }
  removeCaptureFrame()
  const frame = document.createElement('iframe')
  frame.setAttribute('inert', '')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.setAttribute('data-conciv-capture', '1')
  frame.setAttribute('style', 'position:fixed;left:-10000px;top:0;border:0')
  frame.width = String(input.width)
  frame.height = String(input.height)
  frame.src = input.url
  try {
    await settle({frame, fresh: true})
    return frame
  } catch (error) {
    frame.remove()
    throw error
  }
}

const NORMAL_LINE_HEIGHT = 1.2

type Viewport = {width: number; height: number}
type PageWindow = Window & typeof globalThis

function readSource(el: Element): SourceLoc | null {
  const raw = el.getAttribute(SOURCE_ATTR)
  if (!raw) return null
  const parts = raw.split(':')
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(':')
  if (!file || !Number.isFinite(line) || !Number.isFinite(column)) return null
  return {file, line, column}
}

function clipped(input: {rect: DOMRect; viewport: Viewport}): Box {
  const {rect, viewport} = input
  const left = Math.max(0, Math.round(rect.left))
  const top = Math.max(0, Math.round(rect.top))
  const right = Math.min(viewport.width, Math.round(rect.right))
  const bottom = Math.min(viewport.height, Math.round(rect.bottom))
  return {x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top)}
}

function toHex(color: string): string {
  const parsed = parse(color)
  if (parsed === undefined) return color
  if (parsed.alpha !== undefined && parsed.alpha < 1) return formatHex8(parsed)
  return formatHex(parsed)
}

function readStyles(style: CSSStyleDeclaration): LiveStyles {
  const fontSize = Number.parseFloat(style.fontSize)
  const lineHeight = Number.parseFloat(style.lineHeight)
  return {
    background: toHex(style.backgroundColor),
    color: toHex(style.color),
    fontSize,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * NORMAL_LINE_HEIGHT,
    fontWeight: Number(style.fontWeight),
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
  }
}

function readAxis(el: Element): LiveComponent['axis'] {
  const parent = el.parentElement
  const view = el.ownerDocument.defaultView
  if (parent === null || view === null) return null
  const style = view.getComputedStyle(parent)
  if (style.display.includes('grid')) return 'row'
  if (style.display.includes('flex') && style.flexDirection.startsWith('row')) return 'row'
  return 'column'
}

function ownTextNodes(el: Element): Text[] {
  return [...el.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  )
}

function measureTextBox(input: {nodes: Text[]; viewport: Viewport}): Box | null {
  const first = input.nodes[0]
  if (first === undefined) return null
  const rects = input.nodes.map((node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect()
  })
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return clipped({rect: new DOMRect(left, top, right - left, bottom - top), viewport: input.viewport})
}

function glyphNodes(input: {el: Element; view: PageWindow}): Text[] {
  const {el, view} = input
  return [...el.childNodes].flatMap((node): Text[] => {
    if (node instanceof view.Text) return (node.textContent ?? '').trim() === '' ? [] : [node]
    if (!(node instanceof view.Element) || node.hasAttribute(SOURCE_ATTR)) return []
    return glyphNodes({el: node, view})
  })
}

function glyphBox(input: {rect: DOMRect; bounds: Box}): Box | null {
  const {rect, bounds} = input
  const left = Math.max(bounds.x, Math.floor(rect.left) - TOLERANCES.glyphHalo)
  const top = Math.max(bounds.y, Math.floor(rect.top) - TOLERANCES.glyphHalo)
  const right = Math.min(bounds.x + bounds.w, Math.ceil(rect.right) + TOLERANCES.glyphHalo)
  const bottom = Math.min(bounds.y + bounds.h, Math.ceil(rect.bottom) + TOLERANCES.glyphHalo)
  if (right <= left || bottom <= top) return null
  return {x: left, y: top, w: right - left, h: bottom - top}
}

function placeholderFields(input: {el: Element; view: PageWindow}): (HTMLInputElement | HTMLTextAreaElement)[] {
  const {el, view} = input
  const own =
    (el instanceof view.HTMLInputElement || el instanceof view.HTMLTextAreaElement) &&
    el.value === '' &&
    el.placeholder !== ''
      ? [el]
      : []
  const nested = [...el.children].flatMap((child) =>
    child.hasAttribute(SOURCE_ATTR) ? [] : placeholderFields({el: child, view}),
  )
  return [...own, ...nested]
}

function placeholderGlyph(input: {field: HTMLInputElement | HTMLTextAreaElement}): Glyph[] {
  const {field} = input
  const outer = field.getBoundingClientRect()
  const rect = new DOMRect(
    outer.left + field.clientLeft,
    outer.top + field.clientTop,
    field.clientWidth,
    field.clientHeight,
  )
  const box = {x: Math.ceil(rect.left), y: Math.ceil(rect.top), w: Math.floor(rect.width), h: Math.floor(rect.height)}
  return [{text: field.placeholder, boxes: [box]}]
}

function measureGlyphs(input: {el: Element; view: PageWindow; bounds: Box}): Glyph[] {
  const texts = glyphNodes(input).flatMap((node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    const boxes = [...range.getClientRects()].flatMap((rect) => glyphBox({rect, bounds: input.bounds}) ?? [])
    return boxes.length === 0 ? [] : [{text: node.textContent ?? '', boxes}]
  })
  const placeholders = placeholderFields(input).flatMap((field) => placeholderGlyph({field}))
  return [...texts, ...placeholders]
}

function siblingIndex(el: Element): number {
  const parent = el.parentElement
  if (parent === null) return 1
  return [...parent.children].indexOf(el) + 1
}

function componentTree(input: {el: Element; viewport: Viewport; view: PageWindow}): LiveComponent {
  const {el, viewport} = input
  const nodes = ownTextNodes(el)
  const box = clipped({rect: el.getBoundingClientRect(), viewport})
  return {
    source: readSource(el),
    tag: el.tagName.toLowerCase(),
    text: nodes
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
    box,
    textBox: measureTextBox({nodes, viewport}),
    glyphs: measureGlyphs({el, view: input.view, bounds: box}),
    axis: readAxis(el),
    styles: readStyles(input.view.getComputedStyle(el)),
    index: siblingIndex(el),
    children: collectUnder({el, viewport, view: input.view}),
  }
}

function collectUnder(input: {el: Element; viewport: Viewport; view: PageWindow}): LiveComponent[] {
  return [...input.el.children].flatMap((child) =>
    child.hasAttribute(SOURCE_ATTR)
      ? [componentTree({el: child, viewport: input.viewport, view: input.view})]
      : collectUnder({el: child, viewport: input.viewport, view: input.view}),
  )
}

function collectComponents({root}: {root: Document}): LiveComponent[] {
  const view = root.defaultView
  if (view === null) return []
  const viewport = {width: view.innerWidth, height: view.innerHeight}
  return collectUnder({el: root.documentElement, viewport, view})
}

type ClientCapture = {image: string; width: number; height: number; route: string; components: LiveComponent[]}

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

function needsFrame(input: {requested: TabCaptureInput; viewport: Size}): boolean {
  const {requested, viewport} = input
  if (requested.width !== undefined && requested.width !== viewport.width) return true
  return requested.height !== undefined && requested.height !== viewport.height
}

async function captureStep(input: TabCaptureInput): Promise<ClientCapture | ViewportResult> {
  const viewport = {width: innerWidth, height: innerHeight}
  if (input.clear === true) removeCaptureFrame()
  if (input.probe === true || input.clear === true) return viewport
  if (needsFrame({requested: input, viewport})) {
    return captureInFrame({width: input.width ?? viewport.width, height: input.height ?? viewport.height})
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

type Sheet = Winner['sheet']

type Origin = {sheet: Sheet; conditions: string[]; layer: string | null; parent: string | null}

type Entry = {rule: CSSStyleRule; selector: string; origin: Origin}

type Realm = {doc: Document; view: Window & typeof globalThis}

type Scan = {entries: Entry[]; layers: string[]; realm: Realm}

type Candidate = {winner: Winner; layer: number; specificity: SpecificityObject; order: number}

const INLINE_SHEET: Sheet = {href: null, viteDevId: null, emotion: false, styled: false, adopted: false}

const ZERO: SpecificityObject = {a: 0, b: 0, c: 0}

function readRules(sheet: CSSStyleSheet | null): CSSRuleList | null {
  if (sheet === null) return null
  try {
    return sheet.cssRules
  } catch {
    return null
  }
}

function sheetOwner(input: {sheet: CSSStyleSheet; realm: Realm}): Element | null {
  const owner = input.sheet.ownerNode
  if (owner instanceof input.realm.view.Element) return owner
  if (input.sheet.parentStyleSheet === null) return null
  return sheetOwner({sheet: input.sheet.parentStyleSheet, realm: input.realm})
}

function describeSheet(input: {sheet: CSSStyleSheet; adopted: boolean; realm: Realm}): Sheet {
  const owner = sheetOwner(input)
  return {
    href: input.sheet.href,
    viteDevId: owner?.getAttribute('data-vite-dev-id') ?? null,
    emotion: owner?.hasAttribute('data-emotion') ?? false,
    styled: owner?.hasAttribute('data-styled') ?? false,
    adopted: input.adopted,
  }
}

function nest(input: {parent: string; child: string}): string {
  return input.child
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      if (trimmed.includes('&')) return trimmed.split('&').join(`:is(${input.parent})`)
      return `:is(${input.parent}) ${trimmed}`
    })
    .join(', ')
}

function register(input: {scan: Scan; name: string}): void {
  if (!input.scan.layers.includes(input.name)) input.scan.layers.push(input.name)
}

function layerName(input: {origin: Origin; name: string}): string {
  if (input.origin.layer === null) return input.name
  return `${input.origin.layer}.${input.name}`
}

function walk(input: {rules: CSSRuleList; origin: Origin; scan: Scan}): void {
  for (const rule of Array.from(input.rules)) visit({rule, origin: input.origin, scan: input.scan})
}

function visitStyle(input: {rule: CSSStyleRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const selector = origin.parent === null ? rule.selectorText : nest({parent: origin.parent, child: rule.selectorText})
  scan.entries.push({rule, selector, origin})
  walk({rules: rule.cssRules, origin: {...origin, parent: selector}, scan})
}

function visitMedia(input: {rule: CSSMediaRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  if (!scan.realm.view.matchMedia(rule.media.mediaText).matches) return
  walk({
    rules: rule.cssRules,
    origin: {...origin, conditions: [...origin.conditions, `@media ${rule.conditionText}`]},
    scan,
  })
}

function visitSupports(input: {rule: CSSSupportsRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  if (!scan.realm.view.CSS.supports(rule.conditionText)) return
  walk({
    rules: rule.cssRules,
    origin: {...origin, conditions: [...origin.conditions, `@supports ${rule.conditionText}`]},
    scan,
  })
}

function visitLayerBlock(input: {rule: CSSLayerBlockRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const layer = layerName({origin, name: rule.name})
  register({scan, name: layer})
  walk({rules: rule.cssRules, origin: {...origin, layer}, scan})
}

function visitLayerStatement(input: {rule: CSSLayerStatementRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  for (const name of rule.nameList) register({scan, name: layerName({origin, name})})
}

function visitImport(input: {rule: CSSImportRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const rules = readRules(rule.styleSheet)
  if (rules === null) return
  if (rule.media.mediaText !== '' && !scan.realm.view.matchMedia(rule.media.mediaText).matches) return
  const layer = rule.layerName === null ? origin.layer : layerName({origin, name: rule.layerName})
  if (layer !== null) register({scan, name: layer})
  walk({rules, origin: {...origin, layer}, scan})
}

function visit(input: {rule: CSSRule; origin: Origin; scan: Scan}): void {
  const {rule, origin, scan} = input
  const {view} = scan.realm
  if (rule instanceof view.CSSStyleRule) return visitStyle({rule, origin, scan})
  if (rule instanceof view.CSSMediaRule) return visitMedia({rule, origin, scan})
  if (rule instanceof view.CSSSupportsRule) return visitSupports({rule, origin, scan})
  if (rule instanceof view.CSSLayerBlockRule) return visitLayerBlock({rule, origin, scan})
  if (rule instanceof view.CSSLayerStatementRule) return visitLayerStatement({rule, origin, scan})
  if (rule instanceof view.CSSImportRule) return visitImport({rule, origin, scan})
}

function scanSheets(realm: Realm): Scan {
  const scan: Scan = {entries: [], layers: [], realm}
  const sheets = [
    ...Array.from(realm.doc.styleSheets).map((sheet) => ({sheet, adopted: false})),
    ...realm.doc.adoptedStyleSheets.map((sheet) => ({sheet, adopted: true})),
  ]
  for (const {sheet, adopted} of sheets) {
    const rules = readRules(sheet)
    if (rules === null) continue
    walk({
      rules,
      origin: {sheet: describeSheet({sheet, adopted, realm}), conditions: [], layer: null, parent: null},
      scan,
    })
  }
  return scan
}

function matches(input: {element: Element; part: string}): boolean {
  try {
    return input.element.matches(input.part)
  } catch {
    return false
  }
}

function partSpecificity(part: string): SpecificityObject {
  try {
    return Specificity.calculate(part)[0]?.toObject() ?? ZERO
  } catch {
    return ZERO
  }
}

function bestPart(input: {element: Element; selector: string}): {part: string; specificity: SpecificityObject} | null {
  const parts = input.selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => matches({element: input.element, part}))
    .map((part) => ({part, specificity: partSpecificity(part)}))
  return parts.reduce<{part: string; specificity: SpecificityObject} | null>((best, next) => {
    if (best === null || Specificity.compare(next.specificity, best.specificity) > 0) return next
    return best
  }, null)
}

function outranks(input: {a: Candidate; b: Candidate}): boolean {
  const {a, b} = input
  if (a.winner.important !== b.winner.important) return a.winner.important
  if (a.winner.inline !== b.winner.inline) return a.winner.inline
  if (a.layer !== b.layer) return a.winner.important ? a.layer < b.layer : a.layer > b.layer
  const bySpecificity = Specificity.compare(a.specificity, b.specificity)
  if (bySpecificity !== 0) return bySpecificity > 0
  return a.order > b.order
}

function declared(input: {style: CSSStyleDeclaration; aliases: string[]}): {alias: string; value: string} | null {
  const alias = input.aliases.find((name) => input.style.getPropertyValue(name) !== '')
  if (alias === undefined) return null
  return {alias, value: input.style.getPropertyValue(alias)}
}

function inlineCandidate(input: {element: Element; aliases: string[]; scan: Scan}): Candidate | null {
  const {view} = input.scan.realm
  if (!(input.element instanceof view.HTMLElement || input.element instanceof view.SVGElement)) return null
  const style = input.element.style
  const hit = declared({style, aliases: input.aliases})
  if (hit === null) return null
  return {
    winner: {
      selector: null,
      declaration: `${hit.alias}: ${hit.value}`,
      value: hit.value,
      important: style.getPropertyPriority(hit.alias) === 'important',
      inline: true,
      inherited: false,
      sheet: INLINE_SHEET,
      conditions: [],
      rulePath: 'style',
    },
    layer: input.scan.layers.length,
    specificity: ZERO,
    order: Number.MAX_SAFE_INTEGER,
  }
}

function ruleCandidates(input: {element: Element; aliases: string[]; scan: Scan}): Candidate[] {
  const {scan} = input
  return scan.entries.flatMap((entry, order) => {
    const hit = declared({style: entry.rule.style, aliases: input.aliases})
    if (hit === null) return []
    const best = bestPart({element: input.element, selector: entry.selector})
    if (best === null) return []
    const {origin} = entry
    const layerPath = origin.layer === null ? [] : [`@layer ${origin.layer}`]
    return [
      {
        winner: {
          selector: best.part,
          declaration: `${hit.alias}: ${hit.value}`,
          value: hit.value,
          important: entry.rule.style.getPropertyPriority(hit.alias) === 'important',
          inline: false,
          inherited: false,
          sheet: origin.sheet,
          conditions: origin.conditions,
          rulePath: [...origin.conditions, ...layerPath, best.part].join(' > '),
        },
        layer: origin.layer === null ? scan.layers.length : scan.layers.indexOf(origin.layer),
        specificity: best.specificity,
        order,
      },
    ]
  })
}

function resolveVar(input: {element: Element; value: string; realm: Realm}): string {
  const start = input.value.indexOf('var(')
  if (start === -1) return input.value
  const close = input.value.indexOf(')', start)
  if (close === -1) return input.value
  const [name = '', ...fallback] = input.value.slice(start + 4, close).split(',')
  const custom = input.realm.view.getComputedStyle(input.element).getPropertyValue(name.trim()).trim()
  const resolved = custom === '' ? fallback.join(',').trim() : custom
  return resolveVar({
    element: input.element,
    realm: input.realm,
    value: `${input.value.slice(0, start)}${resolved}${input.value.slice(close + 1)}`,
  })
}

function normalized(input: {property: string; value: string; realm: Realm}): string {
  const probe = input.realm.doc.createElement('span').style
  probe.setProperty(input.property, input.value)
  return probe.getPropertyValue(input.property)
}

function confirms(input: {element: Element; property: string; value: string; realm: Realm}): boolean {
  const {realm} = input
  const computed = realm.view.getComputedStyle(input.element).getPropertyValue(input.property)
  const value = resolveVar({element: input.element, value: input.value, realm})
  if (value === computed) return true
  const expected = normalized({property: input.property, value: computed, realm})
  return expected !== '' && normalized({property: input.property, value, realm}) === expected
}

type WinnerQuery = {element: Element; property: string; scan: Scan}

function inherits(input: WinnerQuery): Winner | null {
  const parent = input.element.parentElement
  if (parent === null) return null
  const {view} = input.scan.realm
  const own = view.getComputedStyle(input.element).getPropertyValue(input.property)
  if (own !== view.getComputedStyle(parent).getPropertyValue(input.property)) return null
  const winner = winningDeclaration({...input, element: parent})
  if (winner === null) return null
  return {...winner, inherited: true}
}

function winningDeclaration(input: WinnerQuery): Winner | null {
  const {scan} = input
  const aliases = propertyAliases(input.property)
  const inline = inlineCandidate({element: input.element, aliases, scan})
  const candidates = [...ruleCandidates({element: input.element, aliases, scan}), ...(inline === null ? [] : [inline])]
  const best = candidates.reduce<Candidate | null>((top, next) => {
    if (top === null || outranks({a: next, b: top})) return next
    return top
  }, null)
  if (best === null) return inherits(input)
  if (!confirms({element: input.element, property: input.property, value: best.winner.value, realm: scan.realm})) {
    return null
  }
  return best.winner
}

function frameRealm(size: {width: number; height: number}): Realm | null {
  const view = captureFrameAt(size)?.contentDocument?.defaultView
  return view ? {doc: view.document, view} : null
}

function realmAt(size: {width?: number; height?: number}): Realm {
  const tab: Realm = {doc: document, view: window}
  return frameRealm({width: size.width ?? innerWidth, height: size.height ?? innerHeight}) ?? tab
}

function winnerStep(input: WinnerInput): Promise<WinnerResult> {
  const realm = realmAt({width: input.width, height: input.height})
  const element = realm.doc.querySelector(input.selector)
  if (element === null) return Promise.resolve(Object.fromEntries(input.properties.map((property) => [property, null])))
  const scan = scanSheets(realm)
  return Promise.resolve(
    Object.fromEntries(input.properties.map((property) => [property, winningDeclaration({element, property, scan})])),
  )
}

const CLIENT_TOOLS = [tabCaptureDef.client(captureStep), winnerDef.client(winnerStep)] as const

answerCaptureRequests()

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: CLIENT_TOOLS,
}).client(() => ({value: {}}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof design> {}
}

export default design
