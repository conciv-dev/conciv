import {Motion, type CSSRgbString} from 'ai-motion'
import {Effect, FiberMap, Option, type Scope} from 'effect'
import {createComponent} from 'solid-js'
import {render} from 'solid-js/web'
import {prefersReducedMotion} from '@conciv/ui-kit-system'
import {
  AGENT_BLUE,
  AGENT_PURPLE,
  HINT_CLASS,
  HINT_SHOWN_CLASS,
  MASK_CLASS,
  SHAKE_CLASS,
  SIMULATOR_CSS,
  VISIBLE_CLASS,
  AimedCursors,
} from './cursor.js'
import {CursorLook, cannotAnimate, makeCursors, pageAt, windowAt, type Cursors, type Point} from './cursors.js'
import {
  initialSimulatorState,
  isQueueStopped,
  transitionSimulator,
  type SimulatorEffect,
  type SimulatorEvent,
} from './simulator-machine.js'

const TASK_TIMEOUT_MS = 60_000
const MOVE_MS = 300
const AFTER_RIPPLE_MS = 100
const AFTER_CLICK_MS = 200
const AFTER_INPUT_MS = 100
const STOP_CONFIRM_MS = 3000
const HIDE_MS = 800
const BLOCKED_EVENTS = ['click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'keydown', 'keyup']
const XHTML = 'http://www.w3.org/1999/xhtml'
export const MOUSE_POINTER = {pointerId: 1, pointerType: 'mouse', isPrimary: true}
const PRIMARY_BUTTON = 0
const GLOW_COLORS: [CSSRgbString, CSSRgbString, CSSRgbString, CSSRgbString] = [
  AGENT_BLUE,
  AGENT_PURPLE,
  'rgb(255, 87, 51)',
  'rgb(255, 214, 0)',
]
const DARK_CLASSES = ['dark', 'dark-mode', 'theme-dark', 'night', 'night-mode']
const THEME_ATTRIBUTES = ['data-theme', 'data-color-mode', 'data-bs-theme', 'data-mui-color-scheme']
const DARK_SCHEMES = ['dark', 'only dark']
const APP_ROOTS = ['#app', '#root', '#__next']
const DARK_LUMINANCE = 128
const LIGHT_TEXT_LUMINANCE = 200
const TRANSPARENT_BLACK = 'rgba(0, 0, 0, 0)'
const LUMA = {r: 0.299, g: 0.587, b: 0.114}
const APP_ROOT_MIN_SHARE = 0.5
const DECIMAL = 10
const GLOW_CANCELED = 'canceled'

type Rgb = {r: number; g: number; b: number}

type Run = {
  style: HTMLStyleElement
  layer: HTMLElement
  glow: Motion | null
  dispose: () => void
  cursors: Set<string>
}

type Timer = 'timeout' | 'confirm' | 'hide'

type Signal = Exclude<SimulatorEffect['type'], 'show' | 'aim' | 'stop-session' | 'release-queue'>

type Handles = {
  root: ParentNode | null
  run: Run | null
  cursor: string
  lastClicked: Element | null
  pacing: boolean
}

export type Beat = 'click' | 'input' | 'point'

type Aimed = {element: Element; agent: string}

type SimulatorOptions = {
  session: () => string | null
  onStop: (sessionId: string) => void
  running: (sessionId: string) => boolean
  taskTimeoutMs: () => number | undefined
}

export type Simulator = {
  mount: (root: ParentNode) => () => void
  startTask: (agent: string) => void
  touchTask: () => void
  endRun: (sessionId: string) => void
  acceptQueue: (queueId: string, plane: AbortSignal | undefined) => void
  queueStopped: (queueId: string) => boolean
  finishQueue: (queueId: string) => void
  arriveAt: (options: Aimed & {beat: Beat}) => Effect.Effect<void>
  landQueued: <Result, Failure>(options: {
    beat: Beat
    act: Effect.Effect<Result, Failure>
  }) => Effect.Effect<Result, Failure>
  pointAt: (options: Aimed) => void
  simulateClick: (options: Aimed) => void
  simulateFill: (options: {element: HTMLInputElement | HTMLTextAreaElement; value: string; agent: string}) => void
}

function warnUnlessCanceled(reason: unknown): void {
  if (reason === GLOW_CANCELED) return
  console.warn('[conciv] agent glow fade failed', reason)
}

export function isHtml(element: Element): element is HTMLElement {
  return element.namespaceURI === XHTML
}

function div(className: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  return element
}

function block(event: Event): void {
  event.stopPropagation()
  event.preventDefault()
}

function hint(options: {cursors: Cursors; cursor: string}): Element | null {
  return options.cursors.element(options.cursor)?.querySelector(`.${HINT_CLASS}`) ?? null
}

function shake(options: {cursors: Cursors; cursor: string}): void {
  const element = options.cursors.element(options.cursor)
  if (!element) return
  element.classList.remove(SHAKE_CLASS)
  element.getBoundingClientRect()
  element.classList.add(SHAKE_CLASS)
}

function interrupt<Key>(fibers: FiberMap.FiberMap<Key>, key: Key): void {
  Option.getOrUndefined(FiberMap.getUnsafe(fibers, key))?.interruptUnsafe()
}

function mountRun(options: {root: ParentNode; cursors: Cursors; onClick: () => void}): Run {
  const style = document.createElement('style')
  style.textContent = SIMULATOR_CSS
  const layer = div(MASK_CLASS)
  layer.setAttribute('role', 'status')
  layer.setAttribute('aria-label', 'Agent is using this page')
  for (const type of BLOCKED_EVENTS) layer.addEventListener(type, block)
  layer.addEventListener('click', options.onClick)
  options.root.prepend(style, layer)
  const dispose = render(() => createComponent(AimedCursors, {look: CursorLook.AGENT, cursors: options.cursors}), layer)
  return {style, layer, glow: createGlow(layer), dispose, cursors: new Set()}
}

function unmountRun(options: {run: Run; cursors: Cursors}): void {
  const {run, cursors} = options
  for (const cursor of run.cursors) cursors.drop(cursor)
  run.dispose()
  run.glow?.dispose()
  run.layer.remove()
  run.style.remove()
}

function createGlow(layer: HTMLElement): Motion | null {
  if (prefersReducedMotion()) return null
  try {
    const glow = new Motion({
      mode: isPageDark() ? 'dark' : 'light',
      colors: GLOW_COLORS,
      skipGreeting: true,
      styles: {position: 'absolute', inset: '0'},
    })
    layer.prepend(glow.element)
    glow.autoResize(layer)
    return glow
  } catch (error) {
    console.warn('[conciv] agent glow unavailable', error)
    return null
  }
}

function aimAtCenter(options: {run: Run; cursors: Cursors; agent: string}): void {
  const {run, cursors, agent} = options
  run.cursors.add(agent)
  void cursors.aim({
    id: agent,
    at: windowAt({x: window.innerWidth / 2, y: window.innerHeight / 2}),
    look: CursorLook.AGENT,
  })
}

function aborted(plane: AbortSignal | undefined): Effect.Effect<void> {
  if (plane === undefined) return Effect.never
  return Effect.callback((resume, signal) => {
    plane.addEventListener('abort', () => resume(Effect.void), {once: true, signal})
  })
}

function pace(ms: number): Effect.Effect<void> {
  return Effect.suspend(() => (cannotAnimate() ? Effect.void : Effect.sleep(ms)))
}

export function makeSimulator(options: SimulatorOptions): Effect.Effect<Simulator, never, Scope.Scope> {
  return Effect.gen(function* () {
    const timers = yield* FiberMap.make<Timer>()
    const queues = yield* FiberMap.make<string>()
    const runTimer = yield* FiberMap.runtime(timers)()
    const runQueue = yield* FiberMap.runtime(queues)()
    const machine = {state: initialSimulatorState}
    const handles: Handles = {root: null, run: null, cursor: '', lastClicked: null, pacing: false}
    const cursors = makeCursors()
    yield* Effect.addFinalizer(() => Effect.sync(cursors.dispose))

    const dispatch = (event: SimulatorEvent): void => {
      const next = transitionSimulator(machine.state, event)
      machine.state = next.state
      next.effects.forEach(perform)
    }

    const later = (timer: Timer, ms: number, event: SimulatorEvent): void => {
      runTimer(timer, Effect.sleep(ms).pipe(Effect.andThen(Effect.sync(() => dispatch(event)))))
    }

    const show = (agent: string): void => {
      const root = handles.root
      if (!root) return
      handles.cursor = agent
      interrupt(timers, 'hide')
      const run = handles.run ?? mountRun({root, cursors, onClick: () => dispatch({type: 'mask.clicked'})})
      handles.run = run
      if (!prefersReducedMotion()) {
        run.glow?.start()
        run.glow?.fadeIn().catch(warnUnlessCanceled)
      }
      run.layer.classList.add(VISIBLE_CLASS)
      aimAtCenter({run, cursors, agent})
    }

    const aim = (agent: string): void => {
      handles.cursor = agent
      if (handles.run && !handles.run.cursors.has(agent)) aimAtCenter({run: handles.run, cursors, agent})
    }

    const hide = (): void => {
      const run = handles.run
      if (!run) return
      run.glow?.fadeOut().catch(warnUnlessCanceled)
      run.glow?.pause()
      if (cannotAnimate()) return dispatch({type: 'hide.done'})
      later('hide', HIDE_MS, {type: 'hide.done'})
    }

    const unmount = (): void => {
      interrupt(timers, 'hide')
      if (handles.run) unmountRun({run: handles.run, cursors})
      handles.run = null
    }

    const signals: Record<Signal, () => void> = {
      hide,
      'unmount-run': unmount,
      'arm-confirm': () => {
        later('confirm', STOP_CONFIRM_MS, {type: 'confirm.expired'})
        hint({cursors, cursor: handles.cursor})?.classList.add(HINT_SHOWN_CLASS)
        shake({cursors, cursor: handles.cursor})
      },
      disarm: () => {
        interrupt(timers, 'confirm')
        hint({cursors, cursor: handles.cursor})?.classList.remove(HINT_SHOWN_CLASS)
      },
      'start-timeout': () => later('timeout', options.taskTimeoutMs() ?? TASK_TIMEOUT_MS, {type: 'task.ended'}),
      'cancel-timeout': () => interrupt(timers, 'timeout'),
    }

    const perform = (effect: SimulatorEffect): void => {
      if (effect.type === 'show') return show(effect.agent)
      if (effect.type === 'aim') return aim(effect.agent)
      if (effect.type === 'stop-session') return options.onStop(effect.sessionId)
      if (effect.type === 'release-queue') return interrupt(queues, effect.queueId)
      signals[effect.type]()
    }

    const detach = (): void => {
      dispatch({type: 'detached'})
      handles.root = null
    }

    yield* Effect.addFinalizer(() => Effect.sync(detach))

    const finishQueue = (queueId: string): void => {
      const session = machine.state.taskSession
      dispatch({type: 'queue.finished', queueId, running: session !== null && options.running(session)})
    }

    const moveTo = (aimed: Aimed) => moveCursor({...aimed, cursors, layer: handles.run?.layer})

    const ripple = (agent: string): void => cursors.press(agent)

    const simulateClick = (aimed: Aimed): void => {
      const {element, agent} = aimed
      if (handles.lastClicked) leave(handles.lastClicked)
      handles.lastClicked = element
      const {point, arrived} = moveTo(aimed)
      const paced = handles.pacing
      void arrived.then(() => {
        if (!paced) ripple(agent)
      })
      dispatchPress({target: hitTarget({element, point, layer: handles.run?.layer}), element, point})
    }

    return {
      mount: (root) => {
        detach()
        handles.root = root
        dispatch({type: 'attached'})
        return detach
      },
      startTask: (agent) => dispatch({type: 'task.started', agent, session: options.session()}),
      touchTask: () => dispatch({type: 'task.touched'}),
      endRun: (sessionId) => dispatch({type: 'run.ended', sessionId}),
      acceptQueue: (queueId, plane) => {
        dispatch({type: 'queue.accepted', queueId})
        runQueue(queueId, aborted(plane).pipe(Effect.andThen(Effect.sync(() => finishQueue(queueId)))))
        if (plane?.aborted === true) finishQueue(queueId)
      },
      queueStopped: (queueId) => isQueueStopped(machine.state, queueId),
      finishQueue,
      arriveAt: Effect.fnUntraced(function* (aimed: Aimed & {beat: Beat}) {
        const {arrived} = moveTo(aimed)
        yield* Effect.all([Effect.promise(() => arrived), pace(MOVE_MS)], {concurrency: 'unbounded', discard: true})
        if (aimed.beat === 'point') return
        ripple(aimed.agent)
        yield* pace(AFTER_RIPPLE_MS)
      }),
      landQueued: ({beat, act}) =>
        Effect.sync(() => {
          handles.pacing = true
        }).pipe(
          Effect.andThen(act),
          Effect.ensuring(
            Effect.sync(() => {
              handles.pacing = false
            }).pipe(Effect.andThen(pace(beat === 'click' ? AFTER_CLICK_MS : AFTER_INPUT_MS))),
          ),
        ),
      pointAt: (aimed) => void moveTo(aimed),
      simulateClick,
      simulateFill: ({element, value, agent}) => {
        simulateClick({element, agent})
        setNativeValue({element, value})
        element.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
        element.dispatchEvent(new Event('change', {bubbles: true}))
      },
    }
  })
}

export function measureCenter(element: Element): Point {
  const rect = element.getBoundingClientRect()
  return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
}

type Layered = {layer: HTMLElement | undefined}

function hitAt(options: {element: Element; point: Point} & Layered): Element | null {
  const {element, point, layer} = options
  if (layer) layer.style.pointerEvents = 'none'
  const hit = element.ownerDocument.elementFromPoint(point.x, point.y)
  if (layer) layer.style.pointerEvents = ''
  return hit
}

function isReachable(options: {element: Element} & Layered): boolean {
  const {element, layer} = options
  const view = element.ownerDocument.defaultView
  if (!view) return true
  const point = measureCenter(element)
  if (point.x < 0 || point.y < 0 || point.x > view.innerWidth || point.y > view.innerHeight) return false
  const hit = hitAt({element, point, layer})
  return hit !== null && element.contains(hit)
}

function scrollIntoViewIfNeeded(options: {element: Element} & Layered): void {
  if (!isReachable(options)) options.element.scrollIntoView({behavior: 'instant', block: 'center', inline: 'nearest'})
}

function moveCursor(options: Aimed & Layered & {cursors: Cursors}): {point: Point; arrived: Promise<void>} {
  const {element, agent, layer, cursors} = options
  scrollIntoViewIfNeeded({element, layer})
  const frame = element.ownerDocument.defaultView?.frameElement
  if (frame) scrollIntoViewIfNeeded({element: frame, layer})
  const point = measureCenter(element)
  return {point, arrived: cursors.aim({id: agent, at: pageAt({target: element, point}), look: CursorLook.AGENT})}
}

function hitTarget(options: {element: Element; point: Point} & Layered): Element {
  const {element} = options
  const hit = hitAt(options)
  return hit && isHtml(hit) && element.contains(hit) ? hit : element
}

function leave(last: Element): void {
  const init = {composed: true, view: last.ownerDocument.defaultView}
  last.dispatchEvent(new PointerEvent('pointerout', {...init, bubbles: true}))
  last.dispatchEvent(new PointerEvent('pointerleave', {...init, bubbles: false}))
  last.dispatchEvent(new MouseEvent('mouseout', {...init, bubbles: true}))
  last.dispatchEvent(new MouseEvent('mouseleave', {...init, bubbles: false}))
  if (isHtml(last)) last.blur()
}

function dispatchPress(options: {target: Element; element: Element; point: Point}): void {
  const {target, element, point} = options
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: target.ownerDocument.defaultView,
    clientX: point.x,
    clientY: point.y,
  }
  const pointer = {...base, ...MOUSE_POINTER}
  const mouse = {...base, button: PRIMARY_BUTTON}
  target.dispatchEvent(new PointerEvent('pointerover', pointer))
  target.dispatchEvent(new PointerEvent('pointerenter', {...pointer, bubbles: false}))
  target.dispatchEvent(new MouseEvent('mouseover', mouse))
  target.dispatchEvent(new MouseEvent('mouseenter', {...mouse, bubbles: false}))
  target.dispatchEvent(new PointerEvent('pointerdown', pointer))
  target.dispatchEvent(new MouseEvent('mousedown', mouse))
  if (isHtml(element)) element.focus({preventScroll: true})
  target.dispatchEvent(new PointerEvent('pointerup', pointer))
  target.dispatchEvent(new MouseEvent('mouseup', mouse))
  if (isHtml(target)) return target.click()
  target.dispatchEvent(new MouseEvent('click', mouse))
}

export function setNativeValue(options: {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  value: string
}): void {
  const {element, value} = options
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  if (setter) return void setter.call(element, value)
  element.value = value
}

function proposeEdit(options: {host: HTMLElement; inputType: string; data: string | null}): boolean {
  const {host, inputType, data} = options
  const init = {bubbles: true, composed: true, inputType, data}
  if (!host.dispatchEvent(new InputEvent('beforeinput', {...init, cancelable: true}))) return false
  host.textContent = data ?? ''
  host.dispatchEvent(new InputEvent('input', init))
  return true
}

export function typeByEvents(options: {host: HTMLElement; value: string}): void {
  const {host, value} = options
  if (!proposeEdit({host, inputType: 'deleteContent', data: null}) || value === '') return
  proposeEdit({host, inputType: 'insertText', data: value})
}

export function typeByCommands(options: {host: HTMLElement; value: string}): void {
  const {host, value} = options
  const doc = host.ownerDocument
  host.focus({preventScroll: true})
  doc.getSelection()?.selectAllChildren(host)
  doc.execCommand('delete')
  if (value !== '') doc.execCommand('insertText', false, value)
}

function pageBody(): HTMLElement {
  return document.body ?? document.documentElement
}

function hasDarkClass(): boolean {
  return DARK_CLASSES.some(
    (name) => document.documentElement.classList.contains(name) || pageBody().classList.contains(name),
  )
}

function hasDarkAttribute(): boolean {
  return THEME_ATTRIBUTES.some(
    (name) =>
      pageBody().getAttribute(name)?.toLowerCase() === 'dark' ||
      document.documentElement.getAttribute(name)?.toLowerCase() === 'dark',
  )
}

function isColorSchemeDark(): boolean {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (DARK_SCHEMES.includes(meta?.content.toLowerCase() ?? '')) return true
  const scheme = getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim().toLowerCase()
  return DARK_SCHEMES.includes(scheme)
}

function isTransparent(color: string): boolean {
  return color === 'transparent' || color.startsWith(TRANSPARENT_BLACK)
}

function parseRgb(color: string): Rgb | null {
  const open = color.indexOf('(')
  const close = color.indexOf(')', open)
  if (open === -1 || close === -1 || !['rgb', 'rgba'].includes(color.slice(0, open))) return null
  const [r, g, b] = color
    .slice(open + 1, close)
    .split(',')
    .map((part) => Number.parseInt(part, DECIMAL))
  if (r === undefined || g === undefined || b === undefined || [r, g, b].some(Number.isNaN)) return null
  return {r, g, b}
}

function luminance(color: string): number | null {
  if (!color || isTransparent(color)) return null
  const rgb = parseRgb(color)
  if (!rgb) return null
  return LUMA.r * rgb.r + LUMA.g * rgb.g + LUMA.b * rgb.b
}

function isColorDark(color: string): boolean {
  const value = luminance(color)
  return value !== null && value < DARK_LUMINANCE
}

function isBackgroundDark(): boolean {
  const htmlColor = getComputedStyle(document.documentElement).backgroundColor
  const bodyColor = getComputedStyle(pageBody()).backgroundColor
  if (isColorDark(bodyColor)) return true
  return isTransparent(bodyColor) && isColorDark(htmlColor)
}

function isAppRootDark(): boolean {
  const minArea = window.innerWidth * window.innerHeight * APP_ROOT_MIN_SHARE
  return APP_ROOTS.some((selector) => {
    const element = document.querySelector(selector)
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return rect.width * rect.height >= minArea && isColorDark(getComputedStyle(element).backgroundColor)
  })
}

function isTextLight(): boolean {
  const value = luminance(getComputedStyle(pageBody()).color)
  return value !== null && value > LIGHT_TEXT_LUMINANCE
}

function isPageDark(): boolean {
  return (
    hasDarkClass() ||
    hasDarkAttribute() ||
    isColorSchemeDark() ||
    isBackgroundDark() ||
    isAppRootDark() ||
    isTextLight()
  )
}
