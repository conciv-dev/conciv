import {designConfig} from '../shared/tolerances.js'

export async function frozen<T>(input: {doc: Document; run: () => Promise<T>}): Promise<T> {
  const restore = await freeze(input.doc)
  try {
    return await input.run()
  } finally {
    restore()
  }
}

type Held = {animation: Animation; time: CSSNumberish | null; state: AnimationPlayState}

const TOLERANCES = designConfig.tolerances

const FREEZE_CSS = `*, *::before, *::after {
  animation-play-state: paused !important;
  transition-property: none !important;
}`

async function freeze(doc: Document): Promise<() => void> {
  const before = new Map(doc.getAnimations().map((animation) => [animation, heldOf(animation)]))
  const style = doc.createElement('style')
  style.textContent = FREEZE_CSS
  ;(doc.head ?? doc.documentElement).append(style)
  const held: Held[] = []
  try {
    await frames({doc, count: TOLERANCES.freezeFrames})
    for (const animation of doc.getAnimations()) {
      held.push(before.get(animation) ?? heldOf(animation))
      pin(animation)
    }
  } catch (error) {
    restored({style, held})
    throw error
  }
  return () => restored({style, held})
}

function heldOf(animation: Animation): Held {
  return {animation, time: animation.currentTime, state: animation.playState}
}

function pin(animation: Animation): void {
  try {
    if (!endless(animation)) return animation.finish()
    animation.currentTime = 0
    animation.pause()
  } catch {
    return
  }
}

function endless(animation: Animation): boolean {
  const timing = animation.effect?.getComputedTiming()
  if (timing === undefined) return true
  const {iterations, duration} = timing
  return !Number.isFinite(iterations) || typeof duration !== 'number' || !Number.isFinite(duration)
}

function restored(input: {style: HTMLStyleElement; held: Held[]}): void {
  input.style.remove()
  for (const {animation, time, state} of input.held.toReversed()) {
    try {
      if (time !== null) animation.currentTime = time
      if (state === 'running') animation.play()
      if (state === 'paused') animation.pause()
    } catch {
      continue
    }
  }
}

async function frames(input: {doc: Document; count: number}): Promise<void> {
  for (const _ of Array.from({length: input.count})) await frame(input.doc)
}

function frame(doc: Document): Promise<void> {
  const view = doc.defaultView
  if (view === null) return Promise.resolve()
  const signal = AbortSignal.timeout(TOLERANCES.captureFrameMs)
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), {once: true})
    view.requestAnimationFrame(() => resolve())
  })
}
