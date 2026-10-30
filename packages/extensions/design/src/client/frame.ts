import {toolError} from '@conciv/extension'
import {DESIGN_ERRORS} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'

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
  if (input.fresh) document.body.appendChild(input.frame)
  try {
    await untilAbort({promise: load, signal})
    const doc = readDocument(input.frame)
    if (!doc) throw toolError('frame-blocked', {message: DESIGN_ERRORS['frame-blocked'].message})
    await untilAbort({promise: doc.fonts.ready, signal})
    await untilAbort({promise: quietFrames({doc, signal}), signal})
  } catch (error) {
    if (!signal.aborted) throw error
    throw toolError('frame-timeout', {message: DESIGN_ERRORS['frame-timeout'].message})
  }
}

export function removeCaptureFrame(): void {
  currentFrame()?.remove()
}

export async function ensureCaptureFrame(input: FrameInput): Promise<HTMLIFrameElement> {
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
