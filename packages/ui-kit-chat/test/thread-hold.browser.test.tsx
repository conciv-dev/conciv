import {createSignal, Index, onMount} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {makeEventListener} from '@solid-primitives/event-listener'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useThreadAutoScroll, type ThreadAutoScroll} from '../src/behaviors/use-thread-auto-scroll.js'

const LINES = 20
const HOLD_MS = 400
const PROBE_TOP = 200

type Harness = {viewport: HTMLElement; scroll: ThreadAutoScroll}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const settledScroll = () => expect.element(page.getByText(/scrolls: [1-9]/)).toBeInTheDocument()

function mountHeldThread(): Harness {
  let harness: Harness | undefined
  render(() => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const [scrolls, setScrolls] = createSignal(0)
    const scroll = useThreadAutoScroll(viewport, {autoScroll: () => true})
    onMount(() => {
      const div = viewport()
      if (!div) throw new Error('viewport did not mount')
      makeEventListener(div, 'scroll', () => setScrolls(scrolls() + 1))
      harness = {viewport: div, scroll}
    })
    return (
      <div style={{width: '320px'}}>
        <div>scrolls: {scrolls()}</div>
        <div ref={setViewport} style={{height: '120px', overflow: 'auto'}}>
          <Index each={Array.from({length: LINES}, (_, index) => index)}>
            {(line) => <div style={{height: '20px'}}>line {line()}</div>}
          </Index>
        </div>
      </div>
    )
  })
  if (!harness) throw new Error('harness did not mount')
  return harness
}

it('keeps the position frozen when a second collapse re-arms the hold inside the window', async () => {
  const harness = mountHeldThread()
  harness.scroll.holdPosition(HOLD_MS)
  await wait(HOLD_MS * 0.6)
  harness.scroll.holdPosition(HOLD_MS)
  await wait(HOLD_MS * 0.6)
  harness.viewport.scrollTop = PROBE_TOP
  await settledScroll()
  expect(harness.viewport.scrollTop).toBe(0)
})

it('hands scrolling back once the re-armed window has run out', async () => {
  const harness = mountHeldThread()
  harness.scroll.holdPosition(HOLD_MS)
  await wait(HOLD_MS * 0.6)
  harness.scroll.holdPosition(HOLD_MS)
  await wait(HOLD_MS * 1.6)
  harness.viewport.scrollTop = PROBE_TOP
  await settledScroll()
  expect(harness.viewport.scrollTop).toBe(PROBE_TOP)
})
