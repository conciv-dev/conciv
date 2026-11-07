import {Motion, type CSSRgbString} from 'ai-motion'
import {createComponent} from 'solid-js'
import {render} from 'solid-js/web'
import {
  AGENT_BLUE,
  AGENT_PURPLE,
  HINT_CLASS,
  HINT_SHOWN_CLASS,
  MASK_CLASS,
  SHAKE_CLASS,
  SIMULATOR_CSS,
  VISIBLE_CLASS,
} from './simulator-look.js'
import {
  AimedCursors,
  CursorLook,
  aimCursor,
  cursorElement,
  dropCursor,
  pageAt,
  pressCursor,
  reducedMotion,
  windowAt,
  type Point,
} from './agent-cursor.js'

const TASK_TIMEOUT_MS = 60_000
const STOP_CONFIRM_MS = 3000
const HIDE_MS = 800
const MOVE_MS = 300
const AFTER_RIPPLE_MS = 100
const AFTER_CLICK_MS = 200
const AFTER_INPUT_MS = 100
const SCROLL_SETTLE_MS = 1500
const BLOCKED_EVENTS = ['click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'keydown', 'keyup']
const XHTML = 'http://www.w3.org/1999/xhtml'
const MOUSE_POINTER = {pointerId: 1, pointerType: 'mouse', isPrimary: true}
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

type Rgb = {r: number; g: number; b: number}

type Run = {
  style: HTMLStyleElement
  layer: HTMLElement
  glow: Motion | null
  dispose: () => void
  cursors: Set<string>
}

type Simulator = {
  root: ShadowRoot | null
  run: Run | null
  shown: boolean
  timeout: ReturnType<typeof setTimeout> | undefined
  lastClicked: Element | null
  armed: ReturnType<typeof setTimeout> | undefined
  session: () => string | null
  taskSession: string | null
  cursor: string
  onStop: (sessionId: string) => void
}

const sim: Simulator = {
  root: null,
  run: null,
  shown: false,
  timeout: undefined,
  lastClicked: null,
  armed: undefined,
  session: () => null,
  taskSession: null,
  cursor: '',
  onStop: ignore,
}

function ignore(): void {}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isHtml(element: Element): element is HTMLElement {
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

function hint(): Element | null {
  return cursorElement(sim.cursor)?.querySelector(`.${HINT_CLASS}`) ?? null
}

function disarm(): void {
  clearTimeout(sim.armed)
  sim.armed = undefined
  hint()?.classList.remove(HINT_SHOWN_CLASS)
}

function shake(): void {
  const cursor = cursorElement(sim.cursor)
  if (!cursor) return
  cursor.classList.remove(SHAKE_CLASS)
  cursor.getBoundingClientRect()
  cursor.classList.add(SHAKE_CLASS)
}

function stop(): void {
  const session = sim.taskSession
  if (session !== null) sim.onStop(session)
}

function onMaskClick(): void {
  if (sim.armed !== undefined) {
    disarm()
    return stop()
  }
  sim.armed = setTimeout(disarm, STOP_CONFIRM_MS)
  hint()?.classList.add(HINT_SHOWN_CLASS)
  shake()
}

export function mountSimulator(options: {
  root: ShadowRoot
  session: () => string | null
  onStop: (sessionId: string) => void
}): void {
  clearTimeout(sim.timeout)
  disarm()
  Object.assign(sim, {root: options.root, session: options.session, onStop: options.onStop, shown: false})
}

function mountRun(root: ShadowRoot): Run {
  const style = document.createElement('style')
  style.textContent = SIMULATOR_CSS
  const layer = div(MASK_CLASS)
  layer.setAttribute('role', 'status')
  layer.setAttribute('aria-label', 'Agent is using this page')
  for (const type of BLOCKED_EVENTS) layer.addEventListener(type, block)
  layer.addEventListener('click', onMaskClick)
  root.prepend(style, layer)
  const dispose = render(() => createComponent(AimedCursors, {look: CursorLook.AGENT}), layer)
  return {style, layer, glow: createGlow(layer), dispose, cursors: new Set()}
}

function unmountRun(run: Run): void {
  for (const cursor of run.cursors) dropCursor(cursor)
  run.dispose()
  run.glow?.dispose()
  run.layer.remove()
  run.style.remove()
}

function createGlow(layer: HTMLElement): Motion | null {
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

function aimAtCenter(options: {run: Run; agent: string}): void {
  const {run, agent} = options
  run.cursors.add(agent)
  void aimCursor({
    id: agent,
    at: windowAt({x: window.innerWidth / 2, y: window.innerHeight / 2}),
    look: CursorLook.AGENT,
  })
}

function show(agent: string): void {
  if (!sim.root) return
  sim.cursor = agent
  if (sim.shown && sim.run) {
    if (!sim.run.cursors.has(agent)) aimAtCenter({run: sim.run, agent})
    return
  }
  sim.shown = true
  sim.run ??= mountRun(sim.root)
  sim.run.glow?.start()
  sim.run.glow?.fadeIn().catch(ignore)
  sim.run.layer.classList.add(VISIBLE_CLASS)
  aimAtCenter({run: sim.run, agent})
}

function hide(): void {
  const run = sim.run
  if (!sim.shown || !run) return
  sim.shown = false
  disarm()
  run.glow?.fadeOut().catch(ignore)
  run.glow?.pause()
  setTimeout(() => {
    if (sim.shown || sim.run !== run) return
    sim.run = null
    unmountRun(run)
  }, HIDE_MS)
}

export function startTask(agent: string): void {
  sim.taskSession = sim.session()
  show(agent)
}

export function touchTask(): void {
  clearTimeout(sim.timeout)
  if (sim.shown) sim.timeout = setTimeout(endTask, TASK_TIMEOUT_MS)
}

export function endTask(): void {
  clearTimeout(sim.timeout)
  hide()
}

export function endRun(sessionId: string): void {
  if (sim.taskSession === sessionId) endTask()
}

function ripple(agent: string): void {
  pressCursor({id: agent})
}

function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect()
  return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
}

function hitAt(options: {element: Element; point: Point}): Element | null {
  const {element, point} = options
  const layer = sim.run?.layer
  if (layer) layer.style.pointerEvents = 'none'
  const hit = element.ownerDocument.elementFromPoint(point.x, point.y)
  if (layer) layer.style.pointerEvents = ''
  return hit
}

function isReachable(element: Element): boolean {
  const view = element.ownerDocument.defaultView
  if (!view) return true
  const point = centerOf(element)
  if (point.x < 0 || point.y < 0 || point.x > view.innerWidth || point.y > view.innerHeight) return false
  const hit = hitAt({element, point})
  return hit !== null && element.contains(hit)
}

function scrollEnded(doc: Document): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      doc.removeEventListener('scrollend', done, true)
      resolve()
    }
    const timer = setTimeout(done, SCROLL_SETTLE_MS)
    doc.addEventListener('scrollend', done, true)
  })
}

async function scrollIntoViewIfNeeded(element: Element): Promise<void> {
  if (isReachable(element)) return
  if (reducedMotion()) return element.scrollIntoView({behavior: 'instant', block: 'center', inline: 'nearest'})
  const ended = scrollEnded(element.ownerDocument)
  element.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'})
  await ended
}

async function moveTo(options: {element: Element; agent: string}): Promise<Point> {
  const {element, agent} = options
  await scrollIntoViewIfNeeded(element)
  const frame = element.ownerDocument.defaultView?.frameElement
  if (frame) await scrollIntoViewIfNeeded(frame)
  const point = centerOf(element)
  void aimCursor({id: agent, at: pageAt({target: element, point}), look: CursorLook.AGENT})
  await wait(MOVE_MS)
  return point
}

function hitTarget(options: {element: Element; point: Point}): Element {
  const {element} = options
  const hit = hitAt(options)
  return hit && isHtml(hit) && element.contains(hit) ? hit : element
}

function blurLastClicked(): void {
  const last = sim.lastClicked
  if (!last) return
  const init = {composed: true, view: last.ownerDocument.defaultView}
  last.dispatchEvent(new PointerEvent('pointerout', {...init, bubbles: true}))
  last.dispatchEvent(new PointerEvent('pointerleave', {...init, bubbles: false}))
  last.dispatchEvent(new MouseEvent('mouseout', {...init, bubbles: true}))
  last.dispatchEvent(new MouseEvent('mouseleave', {...init, bubbles: false}))
  if (isHtml(last)) last.blur()
  sim.lastClicked = null
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

export async function pointAt(options: {element: Element; agent: string}): Promise<void> {
  await moveTo(options)
}

export async function simulateClick(options: {element: Element; agent: string}): Promise<void> {
  const {element, agent} = options
  blurLastClicked()
  sim.lastClicked = element
  const point = await moveTo({element, agent})
  ripple(agent)
  await wait(AFTER_RIPPLE_MS)
  dispatchPress({target: hitTarget({element, point}), element, point})
  await wait(AFTER_CLICK_MS)
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

export async function simulateFill(options: {
  element: HTMLInputElement | HTMLTextAreaElement
  value: string
  agent: string
}): Promise<void> {
  const {element, value, agent} = options
  await simulateClick({element, agent})
  setNativeValue({element, value})
  element.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
  element.dispatchEvent(new Event('change', {bubbles: true}))
  await wait(AFTER_INPUT_MS)
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
  try {
    return (
      hasDarkClass() ||
      hasDarkAttribute() ||
      isColorSchemeDark() ||
      isBackgroundDark() ||
      isAppRootDark() ||
      isTextLight()
    )
  } catch {
    return false
  }
}
