import {expect, test} from '@playwright/test'
import {buildService, openIdleService, openMascotPage, settle} from './helpers/mascot-stage.js'

const WORK_WARMUP_S = 2.5

const WORK_SAMPLE_S = 1

const POINTER_MOVE_COUNT = 8

const POINTER_REACH_PX = 300

const POINTER_STEP_PX = 20

const GAZE_SETTLE_MS = 250

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

test('a warmed work cycle rides the antenna without reading layout again', async ({page}) => {
  await openIdleService(page)
  const sampled = await page.evaluate(
    ([warmupSeconds, sampleSeconds]) => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(warmupSeconds)
      const before = window.layoutReads
      const tops = harness.stepFrames(() => harness.anchorOf(harness.requireEmitter()).top, sampleSeconds)
      const after = window.layoutReads
      return {
        computedStyle: after.computedStyle - before.computedStyle,
        offset: after.offset - before.offset,
        frames: tops.length,
        travel: harness.summarize(tops),
      }
    },
    [WORK_WARMUP_S, WORK_SAMPLE_S] as const,
  )

  expect(sampled.frames, 'the sampled window really stepped a full second of frames').toBeGreaterThan(50)
  expect(
    sampled.travel.max - sampled.travel.min,
    `the anchor really rode the antenna across the window: ${JSON.stringify(sampled.travel)}`,
  ).toBeGreaterThan(0.5)
  expect(sampled.offset, 'the per-frame anchor path reads no layout offsets').toBe(0)
  expect(sampled.computedStyle, 'the per-frame anchor path reads no computed styles').toBe(0)
})

test('the armed gaze measures the eye box once and reuses it for every later pointer move', async ({page}) => {
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
  const armed = await page.evaluate(() => window.layoutReads.rect)
  await page.mouse.move(center.x + POINTER_REACH_PX, center.y)
  await settle(page, GAZE_SETTLE_MS)
  const measured = await page.evaluate(() => window.layoutReads.rect)
  for (let step = 1; step <= POINTER_MOVE_COUNT; step += 1) {
    await page.mouse.move(center.x + POINTER_REACH_PX - step * POINTER_STEP_PX, center.y + step * POINTER_STEP_PX)
  }
  await settle(page, GAZE_SETTLE_MS)
  const tracked = await page.evaluate(() => ({
    rect: window.layoutReads.rect,
    eyesX: window.mascotHarness.property(window.parts.eyes, 'x'),
    eyesY: window.mascotHarness.property(window.parts.eyes, 'y'),
  }))

  expect(measured - armed, 'the first armed pointer move measures the eye box once').toBe(1)
  expect(tracked.rect - measured, 'every later pointer move reuses the cached eye box').toBe(0)
  expect(
    Math.abs(tracked.eyesX) > 0.01 && Math.abs(tracked.eyesY) > 0.01,
    `the gaze really tracked the moved pointer: ${JSON.stringify(tracked)}`,
  ).toBe(true)
})
