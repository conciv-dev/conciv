import {ReactiveMap} from '@solid-primitives/map'

export type Point = {x: number; y: number}

export const CursorLook = {AGENT: 'agent'} as const satisfies Record<string, string>
export type CursorLook = (typeof CursorLook)[keyof typeof CursorLook]

export type CursorAt =
  | {zone: 'page'; frames: Element[]; page: Point; port: {width: number; height: number}}
  | {zone: 'chrome'; at: Point}

export type Still = {maybeExecute: () => void; cancel: () => void}

type Located = {point: Point; visible: boolean}

const DEGREES_PER_RADIAN = 180 / Math.PI
const QUARTER_TURN = 90
const FULL_TURN = 360
const FOLLOW = 0.2
const FRAME_MS = 1000 / 60
const MAX_STEP_MS = 100
const REST_PX = 0.5
const SAME_WIDTH_PX = 1

type Sample = {at: CursorAt; located: Located | null; layout: number}

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

export function cannotAnimate(prefersReducedMotion: () => boolean): boolean {
  return document.visibilityState === 'hidden' || prefersReducedMotion()
}

function buildSample(at: CursorAt): Sample {
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

function readPoint(located: Located | null): Point | null {
  return located?.visible ? located.point : null
}

type Frame = {point: Point | null; settled: boolean}

function glide(options: {aim: Aim; now: number; layout: number}): Frame {
  const {aim, now, layout} = options
  const from = readPoint(locateSample({sample: aim.from, layout}))
  const to = readPoint(locateSample({sample: aim.to, layout}))
  if (!to) {
    aim.arrived()
    return {point: null, settled: aim.t >= 1}
  }
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

function settle(entry: Placed): void {
  if (!entry.moving || entry.settling) return
  entry.settling = true
  entry.still?.maybeExecute()
}

function showWhen(entry: Placed, visible: boolean): void {
  if (visible === entry.shown) return
  entry.shown = visible
  entry.element.style.visibility = visible ? '' : 'hidden'
}

function pointTrail(options: {entry: Placed; from: Point; to: Point}): void {
  const {entry, from, to} = options
  const degrees = Math.atan2(from.y - to.y, from.x - to.x) * DEGREES_PER_RADIAN + QUARTER_TURN
  const angle = `${Math.round((degrees + FULL_TURN) % FULL_TURN)}deg`
  if (angle === entry.angle) return
  entry.angle = angle
  entry.glow?.style.setProperty('--cursor-angle', angle)
}

function markMoving(entry: Placed): void {
  entry.still?.cancel()
  entry.settling = false
  if (entry.moving) return
  entry.moving = true
  entry.element.dataset.moving = ''
}

function write(options: {entry: Placed; point: Point | null}): void {
  const {entry, point} = options
  showWhen(entry, point !== null)
  if (!point) return
  const previous = entry.last
  if (previous && previous.x === point.x && previous.y === point.y) return settle(entry)
  entry.last = point
  entry.element.style.transform = `translate(${point.x}px, ${point.y}px)`
  if (!previous) return
  pointTrail({entry, from: previous, to: point})
  markMoving(entry)
}

export type Cursors = {
  aim: (options: {id: string; at: CursorAt; look: CursorLook}) => Promise<void>
  drop: (id: string) => void
  press: (id: string) => void
  element: (id: string) => HTMLElement | null
  aimed: (look: CursorLook) => string[]
  register: (options: {id: string; element: HTMLElement; still?: Still; press?: () => void}) => () => void
  rest: (id: string) => void
  dispose: () => void
}

export function makeCursors(prefersReducedMotion: () => boolean): Cursors {
  const aims = new Map<string, Aim>()
  const placed = new Map<string, Placed>()
  const aimedLooks = new ReactiveMap<string, CursorLook>()
  const pass: {dirty: boolean; seenLayout: number} = {dirty: false, seenLayout: -1}
  const frameLoop: {frame: number | null; layout: number} = {frame: null, layout: 0}
  const watched = new WeakSet<Document>()
  const stop = new AbortController()

  const request = (): void => {
    if (frameLoop.frame !== null) return
    frameLoop.frame = requestAnimationFrame(() => {
      frameLoop.frame = null
      placeCursors()
    })
  }

  const bumpLayout = (): void => {
    frameLoop.layout += 1
    request()
  }

  const settleAim = (id: string): void => aims.get(id)?.arrived()

  const settleEveryAim = (): void => {
    for (const aim of aims.values()) aim.arrived()
  }

  const settleWhenHidden = (): void => {
    if (document.visibilityState === 'hidden') settleEveryAim()
  }

  const watchDocument = (doc: Document): void => {
    if (watched.has(doc)) return
    watched.add(doc)
    const signal = stop.signal
    if (doc === document) doc.addEventListener('visibilitychange', settleWhenHidden, {signal})
    doc.addEventListener('scroll', bumpLayout, {capture: true, passive: true, signal})
    doc.defaultView?.addEventListener('resize', bumpLayout, {passive: true, signal})
  }

  const watchLayout = (at: CursorAt): void => {
    watchDocument(document)
    if (at.zone !== 'page') return
    for (const frame of at.frames) {
      const inner = frameDocument(frame)
      if (inner) watchDocument(inner)
    }
  }

  const computeFrame = (options: {id: string; at: number; layout: number}): Frame => {
    const {id, at, layout} = options
    const aim = aims.get(id)
    return aim ? glide({aim, now: at, layout}) : {point: null, settled: true}
  }

  const placeCursors = (): void => {
    const layout = frameLoop.layout
    if (!pass.dirty && layout === pass.seenLayout) return
    pass.dirty = false
    pass.seenLayout = layout
    const at = performance.now()
    const frames = [...placed].map(([id, entry]) => {
      const frame = computeFrame({id, at, layout})
      if (!frame.settled) pass.dirty = true
      return {entry, frame}
    })
    for (const {entry, frame} of frames) {
      write({entry, point: frame.point})
      if (frame.settled) settle(entry)
    }
    for (const [id, aim] of aims) if (!placed.has(id)) aim.arrived()
    if (pass.dirty) request()
  }

  return {
    aim: ({id, at, look}) => {
      const arrival = Promise.withResolvers<void>()
      const shown = placed.get(id)?.last
      const from = shown && !prefersReducedMotion() ? buildSample(windowAt(shown)) : buildSample(at)
      settleAim(id)
      aims.set(id, {from, to: buildSample(at), t: from.at === at ? 1 : 0, last: 0, arrived: arrival.resolve})
      aimedLooks.set(id, look)
      watchLayout(at)
      pass.dirty = true
      request()
      if (cannotAnimate(prefersReducedMotion)) arrival.resolve()
      return arrival.promise
    },
    drop: (id) => {
      settleAim(id)
      aims.delete(id)
      aimedLooks.delete(id)
      pass.dirty = true
      request()
    },
    press: (id) => {
      if (!prefersReducedMotion()) placed.get(id)?.press?.()
    },
    element: (id) => placed.get(id)?.element ?? null,
    aimed: (look) => [...aimedLooks].flatMap(([id, aimedLook]) => (aimedLook === look ? [id] : [])),
    register: ({id, element, still, press}) => {
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
    },
    rest: (id) => {
      const entry = placed.get(id)
      if (!entry) return
      entry.settling = false
      entry.moving = false
      delete entry.element.dataset.moving
    },
    dispose: () => {
      settleEveryAim()
      stop.abort()
      if (frameLoop.frame !== null) cancelAnimationFrame(frameLoop.frame)
      frameLoop.frame = null
    },
  }
}
