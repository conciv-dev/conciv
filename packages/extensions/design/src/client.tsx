import Specificity, {type SpecificityObject} from '@bramus/specificity'
import {snapdom} from '@zumer/snapdom'
import {
  createCache,
  createMirror,
  createSandboxedIframe,
  rebuildIntoSandboxedIframe,
  snapshot,
  stringifyRule,
} from 'rrweb-snapshot'
import {createRoot, onMount, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import ScanSearch from 'lucide-solid/icons/scan-search'
import {defineExtension, getExtensionApi, type RegisterExtension} from '@conciv/extension'
import type {HostWiring} from '@conciv/extension/host'
import {ComposerActions} from '@conciv/ui-kit-chat'
import {keepBodyMargins} from '@conciv/extension-page/body-margins'
import {formatHex, formatHex8, parse} from 'culori'
import {uniq} from 'es-toolkit'
import {
  DESIGN_EXTENSION_NAME,
  measureDef,
  renderDef,
  winnerDef,
  type MeasureInput,
  type MeasureResult,
  type RenderInput,
  type RenderResult,
  type WinnerInput,
  type WinnerResult,
} from './shared/defs.js'
import {designConfig, PANE_ATTR, propertyAliases, SOURCE_ATTR, TOLERANCES} from './shared/tolerances.js'
import type {
  Box,
  Glyph,
  LiveBorder,
  LiveComponent,
  LiveStyles,
  MirrorLimits,
  SourceLoc,
  Winner,
} from './shared/types.js'
import {XrayPane} from './xray/router.js'
import {secondOpinion} from './client/takumi.js'

declare global {
  interface Window {
    CropTarget?: {fromElement(element: Element): Promise<unknown>}
  }
  interface MediaStreamTrack {
    cropTo?(target: unknown): Promise<void>
  }
  interface DisplayMediaStreamOptions {
    preferCurrentTab?: boolean
  }
}

type Size = {width: number; height: number}
type PageWindow = Window & typeof globalThis
type MirrorSlot = {width: number; frame: Promise<HTMLIFrameElement>}

const WIDGET_ROOT_SELECTOR = '[data-conciv-root]'
const EFFECTS_SELECTOR = '[data-conciv-effects]'
const OVERLAY_SELECTOR = `${WIDGET_ROOT_SELECTOR}, ${EFFECTS_SELECTOR}, [${PANE_ATTR}]`
const MIRROR_ATTR = 'data-conciv-mirror'
const MIRROR_BLOCKED = `${OVERLAY_SELECTOR}, iframe, video, audio, object, embed`
const OFFSCREEN_STYLE = 'position:fixed;left:-100000px;top:0;pointer-events:none'
const LIVE_EXCLUDE = [WIDGET_ROOT_SELECTOR, EFFECTS_SELECTOR, `[${PANE_ATTR}]`, `[${MIRROR_ATTR}]`]
const MIRROR_EXCLUDE = ['style', 'link']
const SCRATCH_SIZE = 4096
const SCRATCH_PAD = 4
const NORMAL_LINE_HEIGHT = 1.2
const DATA_URL_COMMA = ','
const CANVAS_FALLBACK = '#ffffff'
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

const TAKUMI_WASM = 'takumi_paint_wasm_bg.wasm'

const mirrorSlot: {current: MirrorSlot | null} = {current: null}
const engineBase: {current: (() => string) | null} = {current: null}
const region: {stream: MediaStream | null} = {stream: null}

const CLIENT_TOOLS = [
  measureDef.client(measureStep),
  renderDef.client(renderStep),
  winnerDef.client(winnerStep),
] as const

type PaneState = {open: boolean; engaged: boolean; picking: boolean; grab: Grab | null}
type Grab = HostWiring['grab']

function Component(): JSX.Element {
  const host = getExtensionApi(DESIGN_EXTENSION_NAME)
  const grab = host.useGrab()
  const slot = host.useSlot()
  const toggle = design.useContext((context) => context.toggle)
  const registerGrab = design.useContext((context) => context.registerGrab)
  onMount(() => registerGrab(grab))
  return (
    <Show when={slot === 'composer'}>
      <ComposerActions.ActionButton priority={18} tooltip="Design x-ray" onClick={() => toggle()}>
        <ScanSearch class="size-5 block" aria-hidden="true" />
      </ComposerActions.ActionButton>
    </Show>
  )
}

function Surface(): JSX.Element {
  const host = getExtensionApi(DESIGN_EXTENSION_NAME)
  const {YieldFocus} = host
  const toast = host.useToast()
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const scheme = host.useColorScheme()
  const pane = design.useContext((context) => context)
  onMount(() => {
    engineBase.current = apiBase
  })
  return (
    <Show when={pane.state.engaged}>
      <YieldFocus when={pane.state.open && !pane.state.picking}>
        <Show when={pane.state.open}>
          <XrayPane
            apiBase={apiBase()}
            session={sessionId()}
            dark={scheme() === 'dark'}
            hidden={pane.state.picking}
            tab={{capturePixels, pick: pane.pick, find: pageElement, toast}}
            onClose={pane.close}
          />
        </Show>
      </YieldFocus>
    </Show>
  )
}

export const design = defineExtension({
  name: DESIGN_EXTENSION_NAME,
  configSchema: designConfig,
  tools: CLIENT_TOOLS,
  Component,
  Surface,
}).client(() =>
  createRoot((dispose) => {
    const [state, setState] = createStore<PaneState>({open: false, engaged: false, picking: false, grab: null})
    const toggle = (): void => setState({engaged: true, picking: false, open: !state.open})
    const close = (): void => setState({open: false, picking: false})
    const registerGrab = (grab: Grab): void => setState('grab', grab)
    const pick = async (): Promise<string | null> => {
      const grab = state.grab
      if (grab === null) return null
      setState('picking', true)
      const grabbed = await grab.comment().catch(() => null)
      setState('picking', false)
      return grabbed?.rect ? componentPathAt(grabbed.rect) : null
    }
    return {value: {capturePixels, state, toggle, close, registerGrab, pick}, dispose}
  }),
)

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof design> {}
}

export default design

async function measureStep(input: MeasureInput): Promise<MeasureResult> {
  const size = {width: input.width ?? innerWidth, height: input.height ?? innerHeight}
  releaseMirror()
  if (size.width === innerWidth) return measureLive(size)
  return measureMirror(size)
}

async function measureLive(size: Size): Promise<MeasureResult> {
  const components = collectComponents({root: document, size})
  const masks = canvasBoxes({root: document, size})
  const shot = size.height <= innerHeight ? await regionShot(size) : null
  const blob =
    shot ?? (await snapdomShot({doc: document, size, exclude: LIVE_EXCLUDE, viewport: size.height <= innerHeight}))
  return {
    image: await base64(blob),
    ...size,
    route: locationRoute(),
    components,
    capturePath: shot === null ? 'snapdom-live' : 'region',
    source: 'dom',
    masks,
    opinion: false,
  }
}

async function measureMirror(size: Size): Promise<MeasureResult> {
  const doc = mirrorDocument(await mirrorAt(size.width))
  const measured = collectComponents({root: doc, size})
  const masks = canvasBoxes({root: doc, size})
  const opinion = await secondOpinion({doc, ...size, components: measured, wasm: takumiWasm()})
  const blob = await snapdomShot({doc, size, exclude: MIRROR_EXCLUDE, viewport: false})
  return {
    image: await base64(blob),
    ...size,
    route: locationRoute(),
    components: opinion === null ? measured : withOpinions({components: measured, ...opinion}),
    capturePath: 'snapdom-mirror',
    source: 'mirror',
    masks,
    limits: mirrorLimits(doc),
    opinion: opinion !== null,
  }
}

function takumiWasm(): string | null {
  const base = engineBase.current
  return base === null ? null : `${base()}/api/ext/${DESIGN_EXTENSION_NAME}/takumi/${TAKUMI_WASM}`
}

function withOpinions(input: {
  components: LiveComponent[]
  boxes: Map<string, Box>
  confidence: number
}): LiveComponent[] {
  const {boxes, confidence} = input
  return input.components.map((component) => {
    const box = boxes.get(component.path)
    const children = withOpinions({...input, components: component.children})
    return box === undefined ? {...component, children} : {...component, children, opinion: {box, confidence}}
  })
}

function releaseMirror(): void {
  const slot = mirrorSlot.current
  mirrorSlot.current = null
  if (slot === null) return
  void slot.frame.then(
    (frame) => frame.parentElement?.remove(),
    () => undefined,
  )
}

function mirrorAt(width: number): Promise<HTMLIFrameElement> {
  const slot = mirrorSlot.current
  if (slot !== null && slot.width === width) return slot.frame
  releaseMirror()
  const frame = buildMirror(width)
  mirrorSlot.current = {width, frame}
  return frame
}

async function buildMirror(width: number): Promise<HTMLIFrameElement> {
  const source = createMirror()
  const tree = snapshot(document, {
    mirror: source,
    blockSelector: MIRROR_BLOCKED,
    maskAllInputs: true,
    inlineStylesheet: true,
  })
  if (tree === null) throw new Error('the page could not be snapshotted for the mirror')
  const host = offscreenHost()
  const rebuilt = createMirror()
  const {iframe} = rebuildIntoSandboxedIframe(tree, {
    root: host,
    mirror: rebuilt,
    cache: createCache(),
    hackCss: false,
    iframeAttributes: {
      width: String(width),
      height: String(innerHeight),
      style: 'border:0',
      tabindex: '-1',
      'aria-hidden': 'true',
    },
  })
  const widget = document.querySelector(WIDGET_ROOT_SELECTOR)
  const placeholder = widget === null ? null : rebuilt.getNode(source.getId(widget))
  placeholder?.parentNode?.removeChild(placeholder)
  await mirrorDocument(iframe).fonts.ready
  return iframe
}

function offscreenHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute(MIRROR_ATTR, '')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('style', OFFSCREEN_STYLE)
  document.body.append(host)
  return host
}

function mirrorDocument(frame: HTMLIFrameElement): Document {
  const doc = frame.contentDocument
  if (doc === null) throw new Error('the mirror frame has no document')
  return doc
}

function mirrorLimits(doc: Document): MirrorLimits {
  const mirrored = new Set([...doc.fonts].map((face) => face.family))
  const fonts = [...document.fonts]
    .filter((face) => face.status === 'loaded' && !mirrored.has(face.family))
    .map((face) => face.family)
  const inline = [...document.querySelectorAll<HTMLElement>('[style]')].filter(
    (el) => el.closest(WIDGET_ROOT_SELECTOR) === null && (el.style.width !== '' || el.style.height !== ''),
  )
  return {canvases: document.querySelectorAll('canvas').length, fonts: uniq(fonts), inlineWidths: inline.length}
}

function componentPathAt(rect: {x: number; y: number; width: number; height: number}): string | null {
  const hit = document
    .elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    .find((element) => element.closest(OVERLAY_SELECTOR) === null)
  const owner = hit?.closest(`[${SOURCE_ATTR}]`)
  return owner === null || owner === undefined ? null : componentPath(owner)
}

function componentPath(element: Element): string {
  const parent = element.parentNode
  if (element === document.documentElement || parent === null) return ''
  if (parent instanceof ShadowRoot) return `${componentPath(parent.host)}/s/${childPosition({parent, element})}`
  if (!(parent instanceof Element)) return ''
  return `${componentPath(parent)}/${childPosition({parent, element})}`
}

function childPosition(input: {parent: ParentNode; element: Element}): number {
  return [...input.parent.children].indexOf(input.element) + 1
}

function pageElement(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

function canvasBoxes(input: {root: Document; size: Size}): Box[] {
  return [...input.root.querySelectorAll('canvas')]
    .map((canvas) => clipped({rect: canvas.getBoundingClientRect(), size: input.size}))
    .filter((box) => box.w > 0 && box.h > 0)
}

async function capturePixels(): Promise<boolean> {
  if (window.CropTarget === undefined) return false
  region.stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false, preferCurrentTab: true})
  return true
}

async function regionShot(size: Size): Promise<Blob | null> {
  const track = await croppedTrack()
  if (track === null) return null
  const overlays = [...document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)]
  const visibility = overlays.map((overlay) => overlay.style.visibility)
  overlays.forEach((overlay) => overlay.style.setProperty('visibility', 'hidden'))
  try {
    const video = await videoFrame(track)
    if (video === null) return null
    const scale = video.videoWidth / innerWidth
    const canvas = new OffscreenCanvas(size.width, size.height)
    canvas
      .getContext('2d')
      ?.drawImage(video, 0, 0, size.width * scale, size.height * scale, 0, 0, size.width, size.height)
    video.srcObject = null
    return canvas.convertToBlob({type: 'image/png'})
  } finally {
    overlays.forEach((overlay, index) => overlay.style.setProperty('visibility', visibility[index] ?? ''))
  }
}

async function croppedTrack(): Promise<MediaStreamTrack | null> {
  const track = region.stream?.getVideoTracks().find((candidate) => candidate.readyState === 'live')
  const crop = window.CropTarget
  if (track?.cropTo === undefined || crop === undefined) return null
  await track.cropTo(await crop.fromElement(document.documentElement))
  return track
}

function videoFrame(track: MediaStreamTrack): Promise<HTMLVideoElement | null> {
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = new MediaStream([track])
  const signal = AbortSignal.timeout(TOLERANCES.captureFrameMs)
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(null), {once: true})
    video.requestVideoFrameCallback(() => resolve(video))
    video.play().catch(() => resolve(null))
  })
}

async function snapdomShot(input: {doc: Document; size: Size; exclude: string[]; viewport: boolean}): Promise<Blob> {
  const {doc, size} = input
  const capture = await snapdom(doc.documentElement, {
    ...(input.viewport ? {clip: 'viewport'} : {}),
    dpr: 1,
    exclude: input.exclude,
    excludeMode: 'remove',
    embedFonts: true,
    plugins: [keepBodyMargins],
  })
  return composited({blob: await capture.toBlob({format: 'png'}), doc, ...size})
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

function canvasBackground(doc: Document): string {
  const view = doc.defaultView
  if (view === null) return CANVAS_FALLBACK
  const root = view.getComputedStyle(doc.documentElement).backgroundColor
  if (painted(root)) return root
  const body = doc.body ? view.getComputedStyle(doc.body).backgroundColor : ''
  if (painted(body)) return body
  return CANVAS_FALLBACK
}

function painted(color: string): boolean {
  const parsed = parse(color)
  return parsed !== undefined && (parsed.alpha ?? 1) > 0
}

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

function locationRoute(): string {
  return location.pathname + location.search
}

async function renderStep(input: RenderInput): Promise<RenderResult> {
  const host = offscreenHost()
  try {
    const frame = createSandboxedIframe({
      root: host,
      iframeAttributes: {width: String(SCRATCH_SIZE), height: String(SCRATCH_SIZE), style: 'border:0'},
    })
    const doc = mirrorDocument(frame)
    const style = doc.createElement('style')
    style.textContent = ['body{margin:0}', ...fontFaces()].join('\n')
    doc.head.append(style)
    const spans = input.renders.map((render) => {
      const span = doc.createElement('span')
      span.textContent = render.text
      span.setAttribute('style', scratchStyle(render))
      doc.body.append(span)
      return span
    })
    await Promise.all(input.renders.map((render) => doc.fonts.load(`${render.weight} ${render.size}px ${render.font}`)))
    await doc.fonts.ready
    const capture = await snapdom(doc.body, {dpr: 1, exclude: MIRROR_EXCLUDE, excludeMode: 'remove', embedFonts: true})
    const bitmap = await createImageBitmap(await capture.toBlob({format: 'png'}))
    const images = await Promise.all(
      spans.map((span, index) =>
        cropped({bitmap, rect: span.getBoundingClientRect(), background: input.renders[index]?.background ?? ''}),
      ),
    )
    bitmap.close()
    return {images}
  } finally {
    host.remove()
  }
}

function fontFaces(): string[] {
  return [...document.styleSheets].flatMap((sheet) =>
    [...(readRules(sheet) ?? [])]
      .filter((rule) => rule instanceof CSSFontFaceRule)
      .map((rule) => stringifyRule(rule, sheet.href)),
  )
}

function scratchStyle(render: RenderInput['renders'][number]): string {
  return [
    'display:block',
    'width:max-content',
    'white-space:pre',
    'line-height:normal',
    `padding:${SCRATCH_PAD}px`,
    `margin-bottom:${SCRATCH_PAD}px`,
    `font-family:${render.font}`,
    `font-size:${render.size}px`,
    `font-weight:${render.weight}`,
    `color:${render.color}`,
    `background:${render.background}`,
  ].join(';')
}

async function cropped(input: {bitmap: ImageBitmap; rect: DOMRect; background: string}): Promise<string> {
  const x = Math.floor(input.rect.left)
  const y = Math.floor(input.rect.top)
  const w = Math.max(1, Math.ceil(input.rect.right) - x)
  const h = Math.max(1, Math.ceil(input.rect.bottom) - y)
  const canvas = new OffscreenCanvas(w, h)
  const context = canvas.getContext('2d')
  if (context !== null) {
    context.fillStyle = input.background
    context.fillRect(0, 0, w, h)
    context.drawImage(input.bitmap, x, y, w, h, 0, 0, w, h)
  }
  return base64(await canvas.convertToBlob({type: 'image/png'}))
}

function collectComponents(input: {root: Document; size: Size}): LiveComponent[] {
  const view = input.root.defaultView
  if (view === null) return []
  return collectUnder({el: input.root.documentElement, size: input.size, view, path: ''})
}

type Walk = {el: Element; size: Size; view: PageWindow; path: string}

function collectUnder(input: Walk): LiveComponent[] {
  const {el, path} = input
  const light = [...el.children].map((child, position) => ({child, at: `${path}/${position + 1}`}))
  const shadow = [...(el.shadowRoot?.children ?? [])].map((child, position) => ({
    child,
    at: `${path}/s/${position + 1}`,
  }))
  return [...light, ...shadow].flatMap(({child, at}) =>
    child.hasAttribute(SOURCE_ATTR)
      ? [componentTree({...input, el: child, path: at})]
      : collectUnder({...input, el: child, path: at}),
  )
}

function componentTree(input: Walk): LiveComponent {
  const {el, size, view} = input
  const nodes = ownTextNodes(el)
  const box = clipped({rect: el.getBoundingClientRect(), size})
  const style = view.getComputedStyle(el)
  return {
    source: readSource(el),
    tag: el.tagName.toLowerCase(),
    text: nodes
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
    box,
    textBox: measureTextBox({nodes, size}),
    glyphs: measureGlyphs({el, view, bounds: box}),
    axis: readAxis(el),
    columns: readColumns(style),
    styles: readStyles(style),
    role: el.getAttribute('role'),
    hints: readHints(el),
    index: siblingIndex(el),
    path: input.path,
    children: collectUnder(input),
  }
}

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

function clipped(input: {rect: DOMRect; size: Size}): Box {
  const {rect, size} = input
  const left = Math.max(0, Math.round(rect.left))
  const top = Math.max(0, Math.round(rect.top))
  const right = Math.min(size.width, Math.round(rect.right))
  const bottom = Math.min(size.height, Math.round(rect.bottom))
  return {x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top)}
}

function ownTextNodes(el: Element): Text[] {
  return [...el.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  )
}

function measureTextBox(input: {nodes: Text[]; size: Size}): Box | null {
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
  return clipped({rect: new DOMRect(left, top, right - left, bottom - top), size: input.size})
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

function readAxis(el: Element): LiveComponent['axis'] {
  const parent = el.parentElement
  const view = el.ownerDocument.defaultView
  if (parent === null || view === null) return null
  const style = view.getComputedStyle(parent)
  if (style.display.includes('grid')) return 'row'
  if (style.display.includes('flex') && style.flexDirection.startsWith('row')) return 'row'
  return 'column'
}

function readColumns(style: CSSStyleDeclaration): number | null {
  if (!style.display.includes('grid') || style.gridTemplateColumns === 'none') return null
  const tracks = style.gridTemplateColumns.split(' ').reduce(
    (state, token) => {
      if (state.named || token.startsWith('[')) return {...state, named: !token.endsWith(']')}
      return token === '' ? state : {...state, count: state.count + 1}
    },
    {count: 0, named: false},
  )
  return tracks.count
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
    fontFamily: style.fontFamily,
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    border: readBorder(style),
  }
}

function readBorder(style: CSSStyleDeclaration): LiveBorder {
  const sides = BORDER_SIDES.map((side) => ({
    side,
    width: Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0,
    style: style.getPropertyValue(`border-${side}-style`),
    color: toHex(style.getPropertyValue(`border-${side}-color`)),
  }))
  const visible = sides.filter((side) => side.width > 0 && side.style !== 'none' && side.style !== 'hidden')
  const widest = visible.reduce<(typeof sides)[number] | undefined>(
    (best, side) => (best === undefined || side.width > best.width ? side : best),
    undefined,
  )
  return widest ?? sides[0] ?? {side: 'top', width: 0, style: 'none', color: '#000000'}
}

function readHints(el: Element): string[] {
  const label = el.getAttribute('aria-label')
  return [...el.classList, ...(label === null ? [] : [label])]
}

function toHex(color: string): string {
  const parsed = parse(color)
  if (parsed === undefined) return color
  if (parsed.alpha !== undefined && parsed.alpha < 1) return formatHex8(parsed)
  return formatHex(parsed)
}

function siblingIndex(el: Element): number {
  const parent = el.parentElement
  if (parent === null) return 1
  return [...parent.children].indexOf(el) + 1
}

async function winnerStep(input: WinnerInput): Promise<WinnerResult> {
  const realm = await realmAt(input.width)
  const element = realm.doc.querySelector(input.selector)
  if (element === null) return Object.fromEntries(input.properties.map((property) => [property, null]))
  const scan = scanSheets(realm)
  return Object.fromEntries(
    input.properties.map((property) => [property, winningDeclaration({element, property, scan})]),
  )
}

async function realmAt(width: number | undefined): Promise<Realm> {
  if (width === undefined || width === innerWidth) return {doc: document, view: window}
  const view = mirrorDocument(await mirrorAt(width)).defaultView
  if (view === null) return {doc: document, view: window}
  return {doc: view.document, view}
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
