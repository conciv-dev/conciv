import {createSignal, Index, onMount} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import {useThreadAutoScroll, type ThreadAutoScroll} from '../src/behaviors/use-thread-auto-scroll.js'

const BASE_LINES = 20
const GROWTH_LINES = 6

type Harness = {viewport: HTMLElement; scroll: ThreadAutoScroll; stream: () => void}

function mountThread(): Harness {
  let harness: Harness | undefined
  render(() => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const [lines, setLines] = createSignal(BASE_LINES)
    const scroll = useThreadAutoScroll(viewport, {autoScroll: () => true})
    onMount(() => {
      const div = viewport()
      if (!div) throw new Error('viewport did not mount')
      scroll.scrollToBottom('instant')
      harness = {viewport: div, scroll, stream: () => setLines(lines() + GROWTH_LINES)}
    })
    return (
      <div ref={setViewport} style={{height: '120px', overflow: 'auto', width: '320px'}}>
        <Index each={Array.from({length: lines()}, (_, index) => index)}>
          {(line) => <div style={{height: '20px'}}>line {line()}</div>}
        </Index>
      </div>
    )
  })
  if (!harness) throw new Error('harness did not mount')
  return harness
}

const settle = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

function distanceFromBottom(viewport: HTMLElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
}

function touch(viewport: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend'): void {
  viewport.dispatchEvent(new TouchEvent(type, {bubbles: true}))
}

async function streamedWhilePinned(): Promise<Harness> {
  const harness = mountThread()
  await settle()
  expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
  harness.stream()
  await settle()
  expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
  return harness
}

describe('thread auto-scroll user detach', () => {
  it('stops re-pinning to the bottom once a touch drag starts', async () => {
    const harness = await streamedWhilePinned()
    touch(harness.viewport, 'touchstart')
    touch(harness.viewport, 'touchmove')
    const detachedAt = harness.viewport.scrollTop
    harness.stream()
    await settle()
    expect(harness.viewport.scrollTop).toBe(detachedAt)
    expect(harness.scroll.isAtBottom()).toBe(false)
  })

  it('stops re-pinning to the bottom after an upward wheel gesture', async () => {
    const harness = await streamedWhilePinned()
    harness.viewport.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: -40}))
    const detachedAt = harness.viewport.scrollTop
    harness.stream()
    await settle()
    expect(harness.viewport.scrollTop).toBe(detachedAt)
  })

  it('keeps following the stream through a downward wheel gesture at the bottom', async () => {
    const harness = await streamedWhilePinned()
    harness.viewport.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: 40}))
    harness.stream()
    await settle()
    expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
    expect(harness.scroll.isAtBottom()).toBe(true)
  })

  it('follows the stream again when a touch drag ends at the bottom', async () => {
    const harness = await streamedWhilePinned()
    touch(harness.viewport, 'touchstart')
    touch(harness.viewport, 'touchmove')
    touch(harness.viewport, 'touchend')
    harness.stream()
    await settle()
    expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
    expect(harness.scroll.isAtBottom()).toBe(true)
  })

  it('stops re-pinning to the bottom after a scroll key', async () => {
    const harness = await streamedWhilePinned()
    harness.viewport.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowUp'}))
    const detachedAt = harness.viewport.scrollTop
    harness.stream()
    await settle()
    expect(harness.viewport.scrollTop).toBe(detachedAt)
  })

  it('follows the stream again after the reader returns to the bottom', async () => {
    const harness = await streamedWhilePinned()
    touch(harness.viewport, 'touchstart')
    touch(harness.viewport, 'touchmove')
    harness.stream()
    await settle()
    expect(harness.scroll.isAtBottom()).toBe(false)
    touch(harness.viewport, 'touchend')
    harness.viewport.scrollTop = harness.viewport.scrollHeight
    await settle()
    expect(harness.scroll.isAtBottom()).toBe(true)
    harness.stream()
    await settle()
    expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
  })

  it('follows the stream again after an explicit scroll to bottom', async () => {
    const harness = await streamedWhilePinned()
    touch(harness.viewport, 'touchstart')
    touch(harness.viewport, 'touchmove')
    harness.stream()
    await settle()
    expect(harness.scroll.isAtBottom()).toBe(false)
    touch(harness.viewport, 'touchend')
    harness.scroll.scrollToBottom('instant')
    await settle()
    harness.stream()
    await settle()
    expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
    expect(harness.scroll.isAtBottom()).toBe(true)
  })

  it('keeps following the stream after a tap that never moves', async () => {
    const harness = await streamedWhilePinned()
    harness.viewport.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))
    harness.stream()
    await settle()
    expect(distanceFromBottom(harness.viewport)).toBeLessThanOrEqual(1)
    expect(harness.scroll.isAtBottom()).toBe(true)
  })
})
