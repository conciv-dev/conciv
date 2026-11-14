import {designConfig} from '../shared/tolerances.js'

export async function loadMirror(input: {
  route: string
  size: {width: number; height: number}
  marker: string
}): Promise<HTMLIFrameElement> {
  const host = offscreenHost(input.marker)
  const frame = document.createElement('iframe')
  frame.setAttribute(CAPTURE_ATTR, '')
  frame.setAttribute('tabindex', '-1')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('style', 'border:0')
  resizeMirror({frame, size: input.size})
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, {once: true}))
  frame.src = input.route
  host.append(frame)
  await loaded
  const doc = frame.contentDocument
  if (doc !== null) await quiet({doc, until: performance.now() + TOLERANCES.settleWait})
  return frame
}

export function resizeMirror(input: {frame: HTMLIFrameElement; size: {width: number; height: number}}): void {
  input.frame.setAttribute('width', String(input.size.width))
  input.frame.setAttribute('height', String(screenHeight(input.size)))
}

function screenHeight(size: {width: number; height: number}): number {
  const screen = TOLERANCES.screens.findLast((entry) => entry.from <= size.width)
  return Math.min(size.height, screen?.height ?? size.height)
}

const CAPTURE_ATTR = 'data-conciv-capture'

const OFFSCREEN_STYLE = 'position:fixed;left:-100000px;top:0;pointer-events:none'

const IDLE_TIMEOUT_MS = 500

const TOLERANCES = designConfig.tolerances

function offscreenHost(marker: string): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute(marker, '')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('style', OFFSCREEN_STYLE)
  document.body.append(host)
  return host
}

async function quiet(input: {doc: Document; until: number}): Promise<void> {
  const view = input.doc.defaultView
  if (view === null) return
  const seen = {count: 0}
  const observer = new view.MutationObserver(() => {
    seen.count += 1
  })
  observer.observe(input.doc, {subtree: true, childList: true, attributes: true, characterData: true})
  try {
    await still({view, seen, until: input.until})
  } finally {
    observer.disconnect()
  }
}

async function still(input: {view: Window; seen: {count: number}; until: number}): Promise<void> {
  const before = input.seen.count
  await idle(input.view)
  if (input.seen.count === before || performance.now() > input.until) return
  return still(input)
}

function idle(view: Window): Promise<void> {
  return new Promise((resolve) => view.requestIdleCallback(() => resolve(), {timeout: IDLE_TIMEOUT_MS}))
}
