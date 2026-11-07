import {createDebouncer, type SolidDebouncer} from '@tanstack/solid-pacer'
import {For, onCleanup, untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import {
  ARROW_CLASS,
  BORDER_CLASS,
  CLICKING_CLASS,
  CURSOR_CLASS,
  FILL_CLASS,
  HINT_CLASS,
  RIPPLE_CLASS,
  SHAKE_CLASS,
} from './simulator-look.js'

export type Point = {x: number; y: number}

export const CursorLook = {AGENT: 'agent'} as const satisfies Record<string, string>
export type CursorLook = (typeof CursorLook)[keyof typeof CursorLook]

export type CursorAt =
  | {zone: 'page'; frames: Element[]; page: Point; port: {width: number; height: number}}
  | {zone: 'chrome'; at: Point}

type Located = {point: Point; visible: boolean}

const STILL_MS = 600
const DEGREES_PER_RADIAN = 180 / Math.PI
const QUARTER_TURN = 90
const FULL_TURN = 360
const FOLLOW = 0.2
const FRAME_MS = 1000 / 60
const MAX_STEP_MS = 100
const REST_PX = 0.5
const SAME_WIDTH_PX = 1
const STOP_HINT = 'Click again to stop me'
const TOOLTIP_LOOK =
  'rounded-chat-surface-sm bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg py-1 px-2 text-[0.6875rem] font-chat max-w-60'

type Sample = {at: CursorAt; located: Located | null; layout: number}

type Still = Pick<SolidDebouncer<() => void>, 'maybeExecute' | 'cancel'>

type Placed = {
  element: HTMLElement
  glow: HTMLElement | null
  last: Point | null
  angle: string
  shown: boolean
  moving: boolean
  settling: boolean
  still: Still | undefined
  press: (() => void) | undefined
}

type Aim = {from: Sample; to: Sample; t: number; last: number; arrived: () => void}

const aims = new Map<string, Aim>()
const placed = new Map<string, Placed>()
const pass: {dirty: boolean; seenLayout: number} = {dirty: false, seenLayout: -1}
const frameLoop: {scheduled: boolean; layout: number} = {scheduled: false, layout: 0}
const watchedDocuments = new WeakSet<Document>()

const [aimedStore, setAimed] = createStore<Record<string, CursorLook | undefined>>({})

export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isIframe(element: Element): element is HTMLIFrameElement {
  return element.localName === 'iframe'
}

export function frameDocument(element: Element): Document | null {
  if (!isIframe(element)) return null
  try {
    return element.contentDocument
  } catch {
    return null
  }
}

function frameChain(doc: Document): Element[] {
  const chain: Element[] = []
  const view: {value: Window | null} = {value: doc.defaultView}
  while (view.value && view.value !== window && view.value.frameElement) {
    chain.unshift(view.value.frameElement)
    view.value = view.value.parent
  }
  return chain
}

function insideViewport(options: {view: Window; point: Point}): boolean {
  const {view, point} = options
  return point.x >= 0 && point.y >= 0 && point.x <= view.innerWidth && point.y <= view.innerHeight
}

function toTop(options: {doc: Document; point: Point}): Located {
  const {doc, point} = options
  const at = {x: point.x, y: point.y}
  const climb: {visible: boolean; view: Window | null} = {visible: true, view: doc.defaultView}
  while (climb.view) {
    climb.visible = climb.visible && insideViewport({view: climb.view, point: {x: at.x, y: at.y}})
    const frame = climb.view === window ? null : climb.view.frameElement
    if (!frame) break
    const rect = frame.getBoundingClientRect()
    at.x += rect.left + frame.clientLeft
    at.y += rect.top + frame.clientTop
    climb.view = climb.view.parent
  }
  return {point: at, visible: climb.visible}
}

function request(): void {
  if (frameLoop.scheduled) return
  frameLoop.scheduled = true
  requestAnimationFrame(() => {
    frameLoop.scheduled = false
    placeCursors()
  })
}

function bumpLayout(): void {
  frameLoop.layout += 1
  request()
}

function watchDocument(doc: Document): void {
  if (watchedDocuments.has(doc)) return
  watchedDocuments.add(doc)
  doc.addEventListener('scroll', bumpLayout, {capture: true, passive: true})
  doc.defaultView?.addEventListener('resize', bumpLayout, {passive: true})
}

function watchLayoutOf(at: CursorAt): void {
  watchDocument(document)
  if (at.zone !== 'page') return
  for (const frame of at.frames) {
    const inner = frameDocument(frame)
    if (inner) watchDocument(inner)
  }
}

function aimedCursors(look: CursorLook): string[] {
  return Object.keys(aimedStore).filter((id) => aimedStore[id] === look)
}

export function dropCursor(id: string): void {
  aims.delete(id)
  setAimed(id, undefined)
  pass.dirty = true
  request()
}

function sampleOf(at: CursorAt): Sample {
  return {at, located: null, layout: -1}
}

export function windowAt(point: Point): CursorAt {
  return {zone: 'chrome', at: {x: point.x / innerWidth, y: point.y / innerHeight}}
}

export function pageAt(options: {target: Element; point: Point}): CursorAt {
  const {target, point} = options
  const doc = target.ownerDocument
  const view = doc.defaultView
  return {
    zone: 'page',
    frames: frameChain(doc),
    page: {x: point.x + (view?.scrollX ?? 0), y: point.y + (view?.scrollY ?? 0)},
    port: {width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0},
  }
}

export function aimCursor(options: {id: string; at: CursorAt; look: CursorLook}): Promise<void> {
  const {id, at, look} = options
  const arrival = Promise.withResolvers<void>()
  const shown = placed.get(id)?.last
  const from = shown && !reducedMotion() ? sampleOf(windowAt(shown)) : sampleOf(at)
  aims.set(id, {from, to: sampleOf(at), t: from.at === at ? 1 : 0, last: 0, arrived: arrival.resolve})
  setAimed(id, look)
  watchLayoutOf(at)
  pass.dirty = true
  request()
  return arrival.promise
}

export function pressCursor(options: {id: string}): void {
  if (!reducedMotion()) placed.get(options.id)?.press?.()
}

export function cursorElement(id: string): HTMLElement | null {
  return placed.get(id)?.element ?? null
}

function registerCursor(options: {id: string; element: HTMLElement; still?: Still; press?: () => void}): () => void {
  const {id, element, still, press} = options
  placed.set(id, {
    element,
    glow: element.querySelector('.pz-glow-light'),
    last: null,
    angle: '',
    shown: false,
    moving: false,
    settling: false,
    still,
    press,
  })
  pass.dirty = true
  request()
  return () => void placed.delete(id)
}

function cursorStill(id: string): void {
  const entry = placed.get(id)
  if (!entry) return
  entry.settling = false
  entry.moving = false
  delete entry.element.dataset.moving
}

function pageDocument(frames: Element[]): Document | null {
  return frames.reduce<Document | null>(
    (doc, frame) => (frame.ownerDocument === doc ? frameDocument(frame) : null),
    document,
  )
}

function inPage(options: {doc: Document; point: Point}): Located {
  return toTop(options)
}

function locateInPage(at: Extract<CursorAt, {zone: 'page'}>): Located | null {
  const doc = pageDocument(at.frames)
  const view = doc?.defaultView
  if (!doc || !view) return null
  if (Math.abs(view.innerWidth - at.port.width) <= SAME_WIDTH_PX) {
    return inPage({doc, point: {x: at.page.x - view.scrollX, y: at.page.y - view.scrollY}})
  }
  return inPage({
    doc,
    point: {
      x: (at.page.x * view.innerWidth) / at.port.width - view.scrollX,
      y: (at.page.y * view.innerHeight) / at.port.height - view.scrollY,
    },
  })
}

function onScreen(point: Point): Located {
  const visible = point.x >= 0 && point.y >= 0 && point.x <= innerWidth && point.y <= innerHeight
  return {point, visible}
}

function locateCursor(at: CursorAt): Located | null {
  if (at.zone === 'page') return locateInPage(at)
  return onScreen({x: at.at.x * innerWidth, y: at.at.y * innerHeight})
}

function locateSample(options: {sample: Sample; layout: number}): Located | null {
  const {sample, layout} = options
  if (sample.layout !== layout) {
    sample.located = locateCursor(sample.at)
    sample.layout = layout
  }
  return sample.located
}

function pointOf(located: Located | null): Point | null {
  return located?.visible ? located.point : null
}

type Frame = {point: Point | null; settled: boolean}

function glide(options: {aim: Aim; now: number; layout: number}): Frame {
  const {aim, now, layout} = options
  const from = pointOf(locateSample({sample: aim.from, layout}))
  const to = pointOf(locateSample({sample: aim.to, layout}))
  if (!to) return {point: null, settled: aim.t >= 1}
  const elapsed = Math.min(MAX_STEP_MS, now - (aim.last || now - FRAME_MS))
  aim.last = now
  const k = 1 - (1 - FOLLOW) ** (elapsed / FRAME_MS)
  const start = from ?? to
  aim.t = aim.t + (1 - aim.t) * k
  if (Math.hypot(to.x - start.x, to.y - start.y) * (1 - aim.t) < REST_PX) aim.t = 1
  if (aim.t < 1) {
    return {point: {x: start.x + (to.x - start.x) * aim.t, y: start.y + (to.y - start.y) * aim.t}, settled: false}
  }
  aim.arrived()
  return {point: to, settled: true}
}

function frameOf(options: {id: string; at: number; layout: number}): Frame {
  const {id, at, layout} = options
  const aim = aims.get(id)
  return aim ? glide({aim, now: at, layout}) : {point: null, settled: true}
}

function settle(entry: Placed): void {
  if (!entry.moving || entry.settling) return
  entry.settling = true
  entry.still?.maybeExecute()
}

function write(options: {entry: Placed; point: Point | null}): void {
  const {entry, point} = options
  const {element} = entry
  const visible = point !== null
  if (visible !== entry.shown) {
    entry.shown = visible
    element.style.visibility = visible ? '' : 'hidden'
  }
  if (!point) return
  const previous = entry.last
  if (previous && previous.x === point.x && previous.y === point.y) return settle(entry)
  entry.last = point
  element.style.transform = `translate(${point.x}px, ${point.y}px)`
  if (!previous) return
  const degrees = Math.atan2(previous.y - point.y, previous.x - point.x) * DEGREES_PER_RADIAN + QUARTER_TURN
  const angle = `${Math.round((degrees + FULL_TURN) % FULL_TURN)}deg`
  if (angle !== entry.angle) {
    entry.angle = angle
    entry.glow?.style.setProperty('--cursor-angle', angle)
  }
  entry.still?.cancel()
  entry.settling = false
  if (entry.moving) return
  entry.moving = true
  element.dataset.moving = ''
}

function placeCursors(): void {
  const layout = frameLoop.layout
  if (!pass.dirty && layout === pass.seenLayout) return
  pass.dirty = false
  pass.seenLayout = layout
  const at = performance.now()
  const frames = [...placed].map(([id, entry]) => {
    const frame = frameOf({id, at, layout})
    if (!frame.settled) pass.dirty = true
    return {entry, frame}
  })
  for (const {entry, frame} of frames) {
    write({entry, point: frame.point})
    if (frame.settled) settle(entry)
  }
  if (pass.dirty) request()
}

type RegisterLook = (options: {element: HTMLElement; press?: () => void}) => void

function replay(options: {element: Element; name: string}): void {
  const {element, name: className} = options
  element.classList.remove(className)
  void element.getBoundingClientRect()
  element.classList.add(className)
}

function AgentLook(props: {register: RegisterLook}) {
  return (
    <div
      ref={(element) => props.register({element, press: () => replay({element, name: CLICKING_CLASS})})}
      class={CURSOR_CLASS}
      onAnimationEnd={(event) => event.currentTarget.classList.remove(SHAKE_CLASS)}
    >
      <div class={ARROW_CLASS} role="img" aria-label="Agent's cursor">
        <div class={RIPPLE_CLASS} />
        <div class={FILL_CLASS} />
        <div class={BORDER_CLASS} />
      </div>
      <div class={`${HINT_CLASS}  ${TOOLTIP_LOOK}`} role="status">
        {STOP_HINT}
      </div>
    </div>
  )
}

function Cursor(props: {id: string; look: CursorLook}) {
  const id = untrack(() => props.id)
  const still = createDebouncer(() => cursorStill(id), {wait: STILL_MS})
  const register: RegisterLook = ({element, press}) => onCleanup(registerCursor({id, element, still, press}))
  return <AgentLook register={register} />
}

export function AimedCursors(props: {look: CursorLook}) {
  return <For each={aimedCursors(props.look)}>{(id) => <Cursor id={id} look={props.look} />}</For>
}
