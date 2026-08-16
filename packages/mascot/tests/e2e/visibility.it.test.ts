import {expect, test} from '@playwright/test'
import {openMascotPage} from './helpers/mascot-stage.js'

const OFF_SCREEN_SCROLL_PX = 900

const SETTLE_MS = 200

const GATE_TIMEOUT_MS = 3000

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

test('scrolling the stage out of view parks the work timeline and its effect, and scrolling back resumes both', async ({
  page,
}) => {
  const result = await page.evaluate(
    async ({scrollPx, settleMs, timeoutMs}) => {
      const harness = window.mascotHarness
      const parts = harness.buildScrollStage()
      const service = harness.mascot.createMascot({state: 'rest', working: true, follow: false})
      service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      service.mountEffect('binary', harness.mascot.binaryEffect)
      await harness.wait(settleMs)
      const emitter = harness.emitters()[0]
      const read = () => ({
        bobWriters: harness.activeWritersOfProperty(parts.head, 'yPercent'),
        throbWriters: harness.activeWritersOfProperty(parts.antenna, 'scaleY'),
        emitters: harness.emitters().length,
      })
      const working = read()
      parts.scroller.scrollTop = scrollPx
      const parked = await harness.waitUntil(
        () => harness.activeWritersOfProperty(parts.head, 'yPercent') === 0,
        timeoutMs,
      )
      await harness.wait(settleMs)
      const hidden = read()
      parts.scroller.scrollTop = 0
      const woke = await harness.waitUntil(
        () => harness.activeWritersOfProperty(parts.head, 'yPercent') === 1,
        timeoutMs,
      )
      await harness.wait(settleMs)
      const resumed = read()
      const sameEmitter = harness.emitters()[0] === emitter
      service.destroy()
      parts.scroller.remove()
      return {working, parked, hidden, woke, resumed, sameEmitter}
    },
    {scrollPx: OFF_SCREEN_SCROLL_PX, settleMs: SETTLE_MS, timeoutMs: GATE_TIMEOUT_MS},
  )

  expect(result.working.bobWriters, 'the visible mascot really runs its work bob').toBe(1)
  expect(result.working.emitters, 'the visible mascot really runs its effect').toBe(1)
  expect(result.parked, 'scrolling the stage out of view parks the work bob').toBe(true)
  expect(result.hidden.bobWriters, 'the hidden mascot ticks no bob tween').toBe(0)
  expect(result.hidden.throbWriters, 'the hidden mascot ticks no throb tween').toBe(0)
  expect(result.hidden.emitters, 'the hidden mascot parks its effect out of the stage').toBe(0)
  expect(result.woke, 'scrolling the stage back into view resumes the work bob').toBe(true)
  expect(result.resumed.bobWriters, 'the resumed mascot runs its work bob again').toBe(1)
  expect(result.resumed.emitters, 'the resumed mascot runs its effect again').toBe(1)
  expect(result.sameEmitter, 'the resumed mascot reuses the parked emitter node').toBe(true)
})

test('scrolling the stage out of view detaches the gaze listener and scrolling back re-arms it', async ({page}) => {
  const result = await page.evaluate(
    async ({scrollPx, settleMs, timeoutMs}) => {
      const harness = window.mascotHarness
      const parts = harness.buildScrollStage()
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
      service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      await harness.wait(settleMs)
      const armed = window.pointerMoveListenerCount
      parts.scroller.scrollTop = scrollPx
      const detached = await harness.waitUntil(() => window.pointerMoveListenerCount === 0, timeoutMs)
      parts.scroller.scrollTop = 0
      const rearmed = await harness.waitUntil(() => window.pointerMoveListenerCount === 1, timeoutMs)
      service.destroy()
      parts.scroller.remove()
      return {armed, detached, rearmed, final: window.pointerMoveListenerCount}
    },
    {scrollPx: OFF_SCREEN_SCROLL_PX, settleMs: SETTLE_MS, timeoutMs: GATE_TIMEOUT_MS},
  )

  expect(result.armed, 'the visible mascot arms exactly one gaze listener').toBe(1)
  expect(result.detached, 'the hidden mascot detaches its gaze listener').toBe(true)
  expect(result.rearmed, 'the mascot re-arms its gaze listener when it scrolls back into view').toBe(true)
  expect(result.final, 'destroying the resumed mascot leaves no gaze listener behind').toBe(0)
})
