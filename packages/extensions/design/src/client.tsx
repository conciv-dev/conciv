import Specificity, {type SpecificityObject} from '@bramus/specificity'
import {snapdom} from '@zumer/snapdom'
import {createCache, createMirror, rebuildIntoSandboxedIframe, snapshot} from 'rrweb-snapshot'
import {createRoot, onMount, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import ScanSearch from 'lucide-solid/icons/scan-search'
import {defineExtension, getExtensionApi, type RegisterExtension} from '@conciv/extension'
import type {HostWiring} from '@conciv/extension/host'
import {ComposerActions} from '@conciv/ui-kit-chat'
import {keepBodyMargins} from '@conciv/extension-page/body-margins'
import {formatHex, formatHex8, parse} from 'culori'
import {uniq} from 'es-toolkit'
import type {z} from 'zod'
import {DESIGN_TOOLS, type Box, type LiveComponent} from './shared/defs.js'
import {designConfig} from './shared/tolerances.js'
import {XrayPane} from './xray/router.js'
import {secondOpinion} from './client/takumi.js'
import {pageQueries} from './client/queries.js'

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

const [, , , measureDef] = DESIGN_TOOLS
const DESIGN_EXTENSION_NAME = 'design'
const PLACEHOLDER_KINDS = ['icon', 'logo', 'image', 'avatar'] as const satisfies readonly NonNullable<
  LiveComponent['placeholder']
>[]
const TOLERANCES = designConfig.tolerances
const SOURCE_ATTR = designConfig.attributes.source
const PLACEHOLDER_ATTR = designConfig.attributes.placeholder
const PANE_ATTR = designConfig.attributes.pane
const propertyAliases = designConfig.propertyAliases

type MeasureInput = z.output<(typeof measureDef)['inputSchema']>
type MeasureResult = Omit<z.output<NonNullable<(typeof measureDef)['outputSchema']>>, 'components'> & {
  components: LiveComponent[]
}
type Winner = {
  selector: string | null
  declaration: string
  value: string
  important: boolean
  inline: boolean
  inherited: boolean
  sheet: {href: string | null; viteDevId: string | null; emotion: boolean; styled: boolean; adopted: boolean}
  conditions: string[]
  rulePath: string
}
type Measuring = Omit<MeasureResult, 'queries' | 'sheets'>
type Framework = NonNullable<MeasureResult['framework']>
type MirrorLimits = NonNullable<MeasureResult['limits']>
type LiveStyles = LiveComponent['styles']
type LiveBorder = LiveStyles['border']
type Gradient = NonNullable<LiveStyles['gradient']>
type Glyph = LiveComponent['glyphs'][number]
type SourceLoc = NonNullable<LiveComponent['source']>

type Size = {width: number; height: number}
type PageWindow = Window & typeof globalThis
type MirrorSlot = Size & {frame: Promise<HTMLIFrameElement>}

const WIDGET_ROOT_SELECTOR = '[data-conciv-root]'
const EFFECTS_SELECTOR = '[data-conciv-effects]'
const OVERLAY_SELECTOR = `${WIDGET_ROOT_SELECTOR}, ${EFFECTS_SELECTOR}, [${PANE_ATTR}]`
const MIRROR_ATTR = 'data-conciv-mirror'
const MIRROR_BLOCKED = `${OVERLAY_SELECTOR}, iframe, video, audio, object, embed`
const OFFSCREEN_STYLE = 'position:fixed;left:-100000px;top:0;pointer-events:none'
const MIRROR_EXCLUDE = ['style', 'link']
const LIVE_EXCLUDE = [WIDGET_ROOT_SELECTOR, EFFECTS_SELECTOR, `[${PANE_ATTR}]`, `[${MIRROR_ATTR}]`, ...MIRROR_EXCLUDE]
const NORMAL_LINE_HEIGHT = 1.2
const DATA_URL_COMMA = ','
const CANVAS_FALLBACK = '#ffffff'
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const
const PX_UNIT = 'px'
const REACT_FIBER = '__reactFiber'
const VITE_DEV_ID = '[data-vite-dev-id]'
const VITE_ERROR_OVERLAY = 'vite-error-overlay'
const OVERLAY_MESSAGE = '.message-body'
const OVERLAY_FALLBACK = 'the dev server shows an error overlay'
const DRAWN_SHAPES = 'path, polygon, circle'
const DATA_URL = 'data:'
const LINEAR_GRADIENT = 'linear-gradient('
const RGB_TOKEN = 'rgb'
const HEX_TOKEN = '#'
const TOKEN_ENDS = [' ', ',', ')']
const IDLE_TIMEOUT_MS = 500
const LONG_TASK = 'longtask'

const TAKUMI_WASM = 'takumi_paint_wasm_bg.wasm'

const mirrorSlot: {current: MirrorSlot | null} = {current: null}
const engineBase: {current: (() => string) | null} = {current: null}
const region: {stream: MediaStream | null} = {stream: null}

const CLIENT_TOOLS = [measureDef.client(measureStep)] as const

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
  const pageError = overlayError()
  const measured =
    size.width === innerWidth
      ? await measureLive({size, selectors: input.selectors ?? []})
      : await measureMirror({size, selectors: input.selectors ?? []})
  const queried = {...measured, ...(await pageQueries(document))}
  return pageError === null ? queried : {...queried, pageError}
}

function overlayError(): string | null {
  const overlay = document.querySelector(VITE_ERROR_OVERLAY)
  if (overlay === null) return null
  const text = overlay.shadowRoot?.querySelector(OVERLAY_MESSAGE)?.textContent ?? ''
  const lines = text.split('\n').map((line) => line.trim())
  return lines.find((line) => line !== '') ?? OVERLAY_FALLBACK
}

async function measureLive(input: {size: Size; selectors: string[]}): Promise<Measuring> {
  const {size} = input
  const longestTask = watchLongTasks()
  const components = await collectComponents({root: document, size})
  const masks = canvasBoxes({root: document, size})
  const shot = size.height <= innerHeight ? await regionShot(size) : null
  const blob =
    shot ?? (await snapdomShot({doc: document, size, exclude: LIVE_EXCLUDE, viewport: size.height <= innerHeight}))
  const image = await base64(blob)
  const longest = longestTask()
  return {
    image,
    ...size,
    route: locationRoute(),
    components,
    capturePath: shot === null ? 'snapdom-live' : 'region',
    source: 'dom',
    masks,
    opinion: false,
    overflowX: sidewaysScroll(document),
    framework: pageFramework(),
    matches: matchesOf({doc: document, selectors: input.selectors}),
    ...(longest === null ? {} : {longestTask: longest}),
  }
}

function watchLongTasks(): () => number | null {
  if (!PerformanceObserver.supportedEntryTypes.includes(LONG_TASK)) return () => null
  const longest = {ms: 0}
  const record = (entries: PerformanceEntryList): void => {
    longest.ms = Math.max(longest.ms, ...entries.map((entry) => entry.duration))
  }
  const observer = new PerformanceObserver((list) => record(list.getEntries()))
  observer.observe({type: LONG_TASK})
  return () => {
    record(observer.takeRecords())
    observer.disconnect()
    return Math.round(longest.ms)
  }
}

async function measureMirror(input: {size: Size; selectors: string[]}): Promise<Measuring> {
  const {size} = input
  const doc = mirrorDocument(await mirrorAt(size))
  const measured = await collectComponents({root: doc, size})
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
    overflowX: sidewaysScroll(doc),
    framework: pageFramework(),
    matches: matchesOf({doc, selectors: input.selectors}),
  }
}

function matchesOf(input: {doc: Document; selectors: string[]}): {selector: string; paths: string[]}[] {
  return input.selectors.map((selector) => ({
    selector,
    paths: [...matching({doc: input.doc, selector})].map((el) => elementPath({doc: input.doc, el})),
  }))
}

function matching(input: {doc: Document; selector: string}): Element[] {
  try {
    return [...input.doc.querySelectorAll(input.selector)]
  } catch {
    return []
  }
}

function elementPath(input: {doc: Document; el: Element}): string {
  const {doc, el} = input
  if (el === doc.documentElement) return ''
  const parent = el.parentNode
  if (parent instanceof ShadowRoot)
    return `${elementPath({doc, el: parent.host})}/s/${[...parent.children].indexOf(el) + 1}`
  if (!(parent instanceof Element)) return ''
  return `${elementPath({doc, el: parent})}/${[...parent.children].indexOf(el) + 1}`
}

function pageFramework(): Framework | null {
  const sourced = [...document.querySelectorAll(`[${SOURCE_ATTR}]`)]
  if (sourced.some((element) => Object.keys(element).some((key) => key.startsWith(REACT_FIBER)))) return 'react'
  if (sourced.length > 0 && document.querySelector(VITE_DEV_ID) !== null) return 'solid'
  return null
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

function mirrorAt(size: Size): Promise<HTMLIFrameElement> {
  const slot = mirrorSlot.current
  if (slot !== null && slot.width === size.width && slot.height === size.height) return slot.frame
  releaseMirror()
  const frame = buildMirror(size)
  mirrorSlot.current = {...size, frame}
  return frame
}

async function buildMirror(size: Size): Promise<HTMLIFrameElement> {
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
      width: String(size.width),
      height: String(size.height),
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
  await idle()
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

async function collectComponents(input: {root: Document; size: Size}): Promise<LiveComponent[]> {
  const view = input.root.defaultView
  if (view === null) return []
  const scan = scanSheets({doc: input.root, view})
  const keys = [...input.root.querySelectorAll(`[${KEY_ATTR}]`)].map((el) => el.getAttribute(KEY_ATTR))
  const repeated = new Set(keys.filter((key, index) => key !== null && keys.indexOf(key) !== index))
  const el = input.root.documentElement
  return collectUnder({el, size: input.size, view, path: '', scan, walked: {count: 0}, repeated})
}

type Walk = {
  el: Element
  size: Size
  view: PageWindow
  path: string
  scan: Scan
  walked: {count: number}
  repeated: Set<string | null>
}

function collectUnder(input: Walk): Promise<LiveComponent[]> {
  const {el, path} = input
  const light = [...el.children].map((child, position) => ({child, at: `${path}/${position + 1}`}))
  const shadow = [...(el.shadowRoot?.children ?? [])].map((child, position) => ({
    child,
    at: `${path}/s/${position + 1}`,
  }))
  return [...light, ...shadow].reduce<Promise<LiveComponent[]>>(async (done, {child, at}) => {
    const collected = await done
    await paced(input.walked)
    const found = child.hasAttribute(SOURCE_ATTR)
      ? [await componentTree({...input, el: child, path: at})]
      : await collectUnder({...input, el: child, path: at})
    return collected.concat(found)
  }, Promise.resolve([]))
}

async function paced(walked: {count: number}): Promise<void> {
  walked.count += 1
  if (walked.count % TOLERANCES.measureChunk === 0) await yieldToPage()
}

function yieldToPage(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in scheduler) return scheduler.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function idle(): Promise<void> {
  if (!('requestIdleCallback' in globalThis)) return Promise.resolve()
  return new Promise((resolve) => requestIdleCallback(() => resolve(), {timeout: IDLE_TIMEOUT_MS}))
}

async function componentTree(input: Walk): Promise<LiveComponent> {
  const {el, size, view} = input
  const nodes = ownTextNodes(el)
  const box = clipped({rect: el.getBoundingClientRect(), size})
  const style = view.getComputedStyle(el)
  return {
    source: readSource(el),
    key: el.getAttribute(KEY_ATTR),
    bounds: pageBounds({rect: el.getBoundingClientRect(), view}),
    scrolls: el.scrollWidth > el.clientWidth + SCROLL_SLACK,
    owner: ownerPath(el),
    instance: instancePath(el),
    repeat: stampRepeat({el, repeated: input.repeated}),
    tag: el.tagName.toLowerCase(),
    text: nodes
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
    box,
    textBox: measureTextBox({nodes, size}),
    glyphs: measureGlyphs({el, view, size}),
    axis: readAxis(el),
    columns: readColumns(style),
    styles: readStyles({style, element: el, scan: input.scan}),
    role: el.getAttribute('role'),
    hints: readHints(el),
    index: siblingIndex(el),
    path: input.path,
    drawn: drawnPicture(el),
    placeholder: PLACEHOLDER_KINDS.find((kind) => kind === el.getAttribute(PLACEHOLDER_ATTR)) ?? null,
    children: await collectUnder(input),
  }
}

function pageBounds(input: {rect: DOMRect; view: PageWindow}): Box {
  const {rect, view} = input
  return {
    x: rect.left + view.scrollX,
    y: rect.top + view.scrollY,
    w: rect.width,
    h: rect.height,
  }
}

function sidewaysScroll(doc: Document): boolean {
  const scroller = doc.scrollingElement
  const view = doc.defaultView
  if (scroller === null || view === null) return false
  return scroller.scrollWidth > view.innerWidth
}

function drawnPicture(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'svg') return el.querySelector(DRAWN_SHAPES) !== null
  if (tag === 'img') return (el.getAttribute('src') ?? '').startsWith(DATA_URL)
  return tag === 'canvas'
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

const FIBER_PREFIX = '__reactFiber$'
const DEV_ID_ATTR = 'data-vite-dev-id'

function ownerPath(el: Element): string | null {
  const fiber = Object.entries(el).find(([name]) => name.startsWith(FIBER_PREFIX))?.[1]
  if (fiber !== undefined) return reactOwner({el, fiber: fields(fiber)})
  const devId = el.closest(`[${DEV_ID_ATTR}]`)?.getAttribute(DEV_ID_ATTR) ?? null
  return devId === null ? null : `${devId}[${siblingIndex(el)}]`
}

function instancePath(el: Element): string | null {
  const fiber = Object.entries(el).find(([name]) => name.startsWith(FIBER_PREFIX))?.[1]
  if (fiber === undefined) return null
  return instanceChain(fields(fiber)).join('/')
}

function stampRepeat(input: {el: Element; repeated: Set<string | null>}): string | null {
  const {el} = input
  const key = el.getAttribute(KEY_ATTR)
  const siblings = [...(el.parentElement?.children ?? [])]
  if (key === null || !input.repeated.has(key)) return null
  const read = listKey(el)
  const kept = el.getAttribute(INSTANCE_ATTR)
  if (read === null && kept !== null) return kept
  const above = el.parentElement?.closest(`[${KEY_ATTR}]`) ?? null
  const prefix = above === null ? '' : `${above.getAttribute(INSTANCE_ATTR) ?? above.getAttribute(KEY_ATTR) ?? ''}/`
  const stamp = `${prefix}${key}/${read ?? String(siblings.indexOf(el))}`
  el.setAttribute(INSTANCE_ATTR, stamp)
  return stamp
}

function listKey(el: Element): string | null {
  const fiber = Object.entries(el).find(([name]) => name.startsWith(FIBER_PREFIX))?.[1]
  return fiber === undefined ? null : fiberListKey(fields(fiber))
}

function fiberListKey(fiber: Record<string, unknown>): string {
  if (typeof fiber.key === 'string') return fiber.key
  const parent = fields(fiber.return)
  if (Object.keys(parent).length === 0 || typeof parent.type === 'string') return String(fiberIndex(fiber))
  return fiberListKey(parent)
}

function instanceChain(fiber: Record<string, unknown>): string[] {
  if (Object.keys(fiber).length === 0) return []
  const reactKey = typeof fiber.key === 'string' ? [fiber.key] : []
  return [...instanceChain(fields(fiber.return)), ...callSite(fiber), ...reactKey]
}

function callSite(fiber: Record<string, unknown>): string[] {
  if (typeof fiber.type !== 'function') return []
  const key = siteKey(fields(fiber.pendingProps)) ?? siteKey(fields(fiber.memoizedProps))
  return [key ?? String(fiberIndex(fiber))]
}

function siteKey(given: Record<string, unknown>): string | null {
  const key = given[KEY_ATTR]
  return typeof key === 'string' ? key : null
}

function reactOwner(input: {el: Element; fiber: Record<string, unknown>}): string {
  const {el, fiber} = input
  return [...componentChain(fields(fiber.return)), `${el.tagName.toLowerCase()}[${fiberIndex(fiber)}]`].join(' > ')
}

function componentChain(fiber: Record<string, unknown>): string[] {
  if (Object.keys(fiber).length === 0) return []
  const above = componentChain(fields(fiber.return))
  const name = componentName(fiber.type)
  if (name === null) return above
  return [...above, `${name}[${typeof fiber.key === 'string' ? fiber.key : fiberIndex(fiber)}]`]
}

function componentName(type: unknown): string | null {
  if (typeof type !== 'function') return null
  if ('displayName' in type && typeof type.displayName === 'string') return type.displayName
  return type.name === '' ? null : type.name
}

function fiberIndex(fiber: Record<string, unknown>): number {
  return typeof fiber.index === 'number' ? fiber.index : 0
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {}
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

function measureGlyphs(input: {el: Element; view: PageWindow; size: Size}): Glyph[] {
  const {view, size} = input
  const page = {x: 0, y: 0, w: size.width, h: size.height}
  const texts = glyphNodes(input).flatMap((node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    const bounds = clipBounds({el: node.parentElement, view, bounds: page})
    const boxes = [...range.getClientRects()].flatMap((rect) => glyphBox({rect, bounds}) ?? [])
    return boxes.length === 0 ? [] : [{text: node.textContent ?? '', boxes}]
  })
  const placeholders = placeholderFields(input).flatMap((field) => placeholderGlyph({field}))
  return [...texts, ...placeholders]
}

function clipBounds(input: {el: Element | null; view: PageWindow; bounds: Box}): Box {
  const {el, view, bounds} = input
  if (el === null || el === el.ownerDocument.body) return bounds
  const style = view.getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  const horizontal = style.overflowX !== 'visible'
  const vertical = style.overflowY !== 'visible'
  const left = horizontal ? Math.max(bounds.x, Math.floor(rect.left)) : bounds.x
  const top = vertical ? Math.max(bounds.y, Math.floor(rect.top)) : bounds.y
  const right = horizontal ? Math.min(bounds.x + bounds.w, Math.ceil(rect.right)) : bounds.x + bounds.w
  const bottom = vertical ? Math.min(bounds.y + bounds.h, Math.ceil(rect.bottom)) : bounds.y + bounds.h
  const narrowed = {x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top)}
  return clipBounds({el: el.parentElement, view, bounds: narrowed})
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

function readStyles(input: {style: CSSStyleDeclaration; element: Element; scan: Scan}): LiveStyles {
  const {style} = input
  const fontSize = Number.parseFloat(style.fontSize)
  const lineHeight = Number.parseFloat(style.lineHeight)
  return {
    background: toHex(style.backgroundColor),
    color: toHex(style.color),
    fontSize,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * NORMAL_LINE_HEIGHT,
    fontWeight: Number(style.fontWeight),
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    position: style.position,
    display: style.display,
    flexDirection: style.flexDirection,
    overflowX: style.overflowX,
    sizing: {width: ownSizing({...input, property: 'width'}), height: ownSizing({...input, property: 'height'})},
    border: readBorder(style),
    gradient: gradientStops(style.backgroundImage),
  }
}

function gradientStops(image: string): Gradient | null {
  const start = image.indexOf(LINEAR_GRADIENT)
  if (start < 0) return null
  const colors = colorTokens(enclosedBody(image.slice(start + LINEAR_GRADIENT.length)))
  const from = colors[0]
  const to = colors.at(-1)
  if (from === undefined || to === undefined || colors.length < 2) return null
  return {from: toHex(from), to: toHex(to)}
}

function enclosedBody(text: string): string {
  const closing = [...text].reduce<{depth: number; at: number}>(
    (state, character, index) => {
      if (state.at >= 0) return state
      const depth = state.depth + (character === '(' ? 1 : 0) - (character === ')' ? 1 : 0)
      return {depth, at: depth === 0 ? index : -1}
    },
    {depth: 1, at: -1},
  )
  return closing.at < 0 ? text : text.slice(0, closing.at)
}

function colorTokens(text: string): string[] {
  const starts = [text.indexOf(RGB_TOKEN), text.indexOf(HEX_TOKEN)].filter((at) => at >= 0)
  if (starts.length === 0) return []
  const at = Math.min(...starts)
  const end = text.startsWith(HEX_TOKEN, at) ? hexEnd({text, at}) : text.indexOf(')', at) + 1
  if (end <= at) return []
  return [text.slice(at, end), ...colorTokens(text.slice(end))]
}

function hexEnd(input: {text: string; at: number}): number {
  const ends = TOKEN_ENDS.map((end) => input.text.indexOf(end, input.at)).filter((at) => at >= 0)
  return ends.length === 0 ? input.text.length : Math.min(...ends)
}

function ownSizing(input: {element: Element; scan: Scan; property: string}): LiveStyles['sizing']['width'] {
  const winner = winningDeclaration({element: input.element, property: input.property, scan: input.scan})
  if (winner === null || winner.inherited) return 'auto'
  return pxLength(winner.value) ? 'fixed' : 'auto'
}

function pxLength(value: string): boolean {
  const trimmed = value.trim()
  return (
    trimmed.endsWith(PX_UNIT) &&
    trimmed.length > PX_UNIT.length &&
    Number.isFinite(Number(trimmed.slice(0, -PX_UNIT.length)))
  )
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

const KEY_ATTR = 'data-conciv-key'
const INSTANCE_ATTR = 'data-conciv-instance'
const SCROLL_SLACK = 2
