import {expect} from 'vitest'

const FRAME_P95_BUDGET_MS = 20
const FRAME_JANK_BUDGET = 2
const MIN_SAMPLED_WINDOW_MS = 300
const JANK_FRAME_MS = 33
const SETTLE_PASSES = 3
const TAIL_FRAMES = 30

type FrameGaps = {sampledMs: number; p50: number; p95: number; max: number; over33: number}

export type CalmWatch = {
  checkpoint: () => Promise<void>
  endWhenDrawn: (text: string) => Promise<void>
  endWhenScrolledToEnd: () => Promise<void>
  expectSmooth: () => void
}

function threadViewport(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>('[role="log"][aria-live="off"]')
  if (!viewport) throw new Error('the calm watch could not find the thread viewport')
  return viewport
}

function hasText(root: Node, text: string): boolean {
  return root.textContent?.includes(text) ?? false
}

function textDrawn(viewport: HTMLElement, text: string): Promise<void> {
  return new Promise((resolve) => {
    if (hasText(viewport, text)) return resolve()
    const observer = new MutationObserver(() => {
      if (!hasText(viewport, text)) return
      observer.disconnect()
      resolve()
    })
    observer.observe(viewport, {childList: true, subtree: true, characterData: true})
  })
}

function atEnd(viewport: HTMLElement): boolean {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 1
}

function scrolledToEnd(viewport: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const settled = (): void => {
      if (!atEnd(viewport)) return
      viewport.removeEventListener('scrollend', settled)
      resolve()
    }
    viewport.addEventListener('scrollend', settled)
  })
}

async function framesAfter(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

function hasFiniteIterations(animation: Animation): boolean {
  return animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function settleMotion(viewport: HTMLElement): Promise<void> {
  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    await nextFrames()
    const running = viewport.getAnimations({subtree: true}).filter(hasFiniteIterations)
    if (running.length === 0) return
    await Promise.allSettled(running.map((animation) => animation.finished))
  }
}

function pickPercentile(sorted: ReadonlyArray<number>, fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

function tenths(value: number): number {
  return Math.round(value * 10) / 10
}

function summariseGaps(gaps: ReadonlyArray<number>): FrameGaps {
  const sorted = gaps.toSorted((left, right) => left - right)
  return {
    sampledMs: tenths(gaps.reduce((total, gap) => total + gap, 0)),
    p50: tenths(pickPercentile(sorted, 0.5)),
    p95: tenths(pickPercentile(sorted, 0.95)),
    max: tenths(sorted.at(-1) ?? 0),
    over33: gaps.filter((gap) => gap > JANK_FRAME_MS).length,
  }
}

export function watchCalm(measurement: string): CalmWatch {
  const gaps: number[] = []
  const frame = {previous: performance.now(), handle: 0}
  const tick = (): void => {
    const now = performance.now()
    gaps.push(now - frame.previous)
    frame.previous = now
    frame.handle = requestAnimationFrame(tick)
  }
  const resume = (): void => {
    frame.previous = performance.now()
    frame.handle = requestAnimationFrame(tick)
  }
  const pause = (): void => cancelAnimationFrame(frame.handle)
  resume()
  const endAfter = async (event: Promise<void>): Promise<void> => {
    await event
    await framesAfter(TAIL_FRAMES)
    pause()
  }
  return {
    checkpoint: async () => {
      pause()
      try {
        await settleMotion(threadViewport())
      } finally {
        resume()
      }
    },
    endWhenDrawn: (text) => endAfter(textDrawn(threadViewport(), text)),
    endWhenScrolledToEnd: () => endAfter(scrolledToEnd(threadViewport())),
    expectSmooth: () => {
      pause()
      const measured = summariseGaps(gaps)
      console.info(`${measurement} frame gaps`, JSON.stringify(measured))
      expect(measured.sampledMs).toBeGreaterThanOrEqual(MIN_SAMPLED_WINDOW_MS)
      expect(measured.p95).toBeLessThanOrEqual(FRAME_P95_BUDGET_MS)
      expect(measured.over33).toBeLessThanOrEqual(FRAME_JANK_BUDGET)
    },
  }
}
