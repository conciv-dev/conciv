import {expect, test, type Page} from '@playwright/test'
import type {CurveStyle, MascotConfig} from '../../src/rig.js'
import {expectNear} from './helpers/near.js'
import {
  buildCurvedService,
  installManualClock,
  openMascotPage,
  PRODUCT_FAB_ANTENNA_PX,
  type StagePlacement,
} from './helpers/mascot-stage.js'

const VIEWPORT = {width: 1280, height: 720}

const WORKING: MascotConfig = {state: 'rest', working: true, follow: false}

const AT_LEFT_EDGE: StagePlacement = {left: 10, top: 40}

const AT_RIGHT_EDGE: StagePlacement = {left: 1226, top: 40}

const AT_TOP_EDGE: StagePlacement = {left: 618, top: 10}

const AT_BOTTOM_EDGE: StagePlacement = {left: 618, top: 620}

const VISUAL_PLACEMENT: StagePlacement = {left: 60, top: 120}

const VISUAL_STAGE_PX = 120

const TRAVEL_SAMPLE_S = 2.05

const FAN_SAMPLE_S = 4.4

const SHOT_BEAT_S = 1.4

const SHOT_DIRECTORY =
  '/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/88b2724c-9a01-45d2-9de1-9128e0eca9d0/scratchpad/c1-curves'

const FAN_LANE_RATIOS = [1, 1.4, 1.8, 2.2, 2.6]

const LAUNCH_DRIFT_PX = 1.2

const LANDING_PX = 15

test.use({viewport: VIEWPORT})

const openStage = async (page: Page, curve: CurveStyle, placement: StagePlacement): Promise<void> => {
  await openMascotPage(page)
  await installManualClock(page)
  await buildCurvedService(page, WORKING, curve, placement, PRODUCT_FAB_ANTENNA_PX)
}

type DigitTrack = {horizontal: number[]; vertical: number[]; tilt: number[]}

const TRACKED_PROPERTIES = ['x', 'y', 'rotation']

async function trackLeadingDigit(page: Page): Promise<DigitTrack> {
  const frames = await page.evaluate(
    ([names, seconds]) => {
      const harness = window.mascotHarness
      harness.advanceBy(0)
      const digit = harness.requireDigit(harness.requireEmitter(), 0)
      return harness.stepFrames(() => names.map((name) => harness.property(digit, name)), seconds)
    },
    [TRACKED_PROPERTIES, TRAVEL_SAMPLE_S] as const,
  )
  const column = (index: number): number[] => frames.map((frame) => frame[index] ?? 0)
  return {horizontal: column(0), vertical: column(1), tilt: column(2)}
}

const sampleEveryDigitX = (page: Page): Promise<number[][]> =>
  page.evaluate((seconds) => {
    const harness = window.mascotHarness
    harness.advanceBy(0)
    const emitter = harness.requireEmitter()
    const digits = [0, 1, 2, 3, 4].map((index) => harness.requireDigit(emitter, index))
    return harness.stepFrames(() => digits.map((digit) => harness.property(digit, 'x')), seconds)
  }, FAN_SAMPLE_S)

function expectBend(label: string, values: number[], direction: number): void {
  const wrongWay = Math.min(...values.map((value) => value * direction))
  expect(wrongWay, `${label}: the widest drift against the bend while leaving the tip`).toBeGreaterThan(
    -LAUNCH_DRIFT_PX,
  )
  const travelling = values.filter((value) => value * direction > LAUNCH_DRIFT_PX)
  const backtracks = travelling.filter(
    (value, index) => index > 0 && (value - (travelling[index - 1] ?? 0)) * direction < -0.01,
  )
  expect(backtracks.length, `${label}: samples that reverse the bend once under way`).toBe(0)
  expect(
    (values[values.length - 1] ?? 0) * direction,
    `${label}: how far into the room the curve lands`,
  ).toBeGreaterThan(LANDING_PX)
}

test('a straight curve keeps every digit on the antenna axis', async ({page}) => {
  await openStage(page, 'straight', AT_LEFT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expect(Math.max(...horizontal.map(Math.abs)), 'the largest sideways excursion of a straight rise').toBeLessThan(0.001)
})

test('an arc at the left viewport edge bends into the room on the right', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('arc at the left edge', horizontal, 1)
})

test('an arc at the right viewport edge bends into the room on the left', async ({page}) => {
  await openStage(page, 'arc', AT_RIGHT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('arc at the right edge', horizontal, -1)
})

test('a hook rises past its landing height and comes back down sideways', async ({page}) => {
  await openStage(page, 'hook', AT_LEFT_EDGE)
  const {horizontal, vertical} = await trackLeadingDigit(page)

  expectBend('hook at the left edge', horizontal, 1)
  expect(Math.min(...vertical), 'the top of the hook').toBeLessThan((vertical[vertical.length - 1] ?? 0) - 0.5)
})

test('a fan peels each digit into its own lane, widening with the digit index', async ({page}) => {
  await openStage(page, 'fan', AT_LEFT_EDGE)
  const samples = await sampleEveryDigitX(page)
  const reach = [0, 1, 2, 3, 4].map((digit) => Math.max(...samples.map((frame) => frame[digit] ?? 0)))
  const leading = reach[0] ?? 0

  expect(leading, 'the innermost lane reaches sideways at all').toBeGreaterThan(10)
  FAN_LANE_RATIOS.forEach((ratio, index) => {
    expectNear(`fan lane ${index} relative to lane 0`, (reach[index] ?? 0) / leading, ratio, 0.05)
  })
})

test('auto rises straight when the room above is ample', async ({page}) => {
  await openStage(page, 'auto', AT_BOTTOM_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expect(Math.max(...horizontal.map(Math.abs)), 'the largest sideways excursion under ample room').toBeLessThan(0.001)
})

test('auto bends right in a stage squeezed against the left edge', async ({page}) => {
  await openStage(page, 'auto', AT_LEFT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('auto at the left edge', horizontal, 1)
})

test('auto bends left in a stage squeezed against the right edge', async ({page}) => {
  await openStage(page, 'auto', AT_RIGHT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('auto at the right edge', horizontal, -1)
})

test('auto bends right on a tie in side room at the top edge', async ({page}) => {
  await openStage(page, 'auto', AT_TOP_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('auto at the top edge', horizontal, 1)
})

test('every digit leaves the tip along the antenna axis and only then tilts with its tangent', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE)
  const {tilt} = await trackLeadingDigit(page)

  expectNear('the digit tilt at the tip', tilt[0] ?? 0, 0, 3)
  expect(Math.max(...tilt.map(Math.abs)), 'the digit tilt further along the curve').toBeGreaterThan(20)
})

test.describe('reduced motion', () => {
  test.use({contextOptions: {reducedMotion: 'reduce'}})

  test('a configured curve still mounts no emitter at all', async ({page}) => {
    await openMascotPage(page)
    await buildCurvedService(page, WORKING, 'arc', AT_LEFT_EDGE, PRODUCT_FAB_ANTENNA_PX)
    const emitters = await page.evaluate(() => window.mascotHarness.emitters().length)

    expect(emitters, 'reduced motion emits no curved effect either').toBe(0)
  })
})

const CURVE_SHOTS: CurveStyle[] = ['straight', 'arc', 'hook', 'fan', 'auto']

CURVE_SHOTS.forEach((curve) => {
  test(`the ${curve} curve renders a live emitter on a squeezed stage`, async ({page}) => {
    await openMascotPage(page)
    await installManualClock(page)
    await buildCurvedService(page, WORKING, curve, VISUAL_PLACEMENT, VISUAL_STAGE_PX)
    await page.evaluate((beat) => window.mascotHarness.advanceTo(beat), SHOT_BEAT_S)
    const digits = await page.evaluate(() => window.mascotHarness.requireEmitter().childElementCount)
    await page.screenshot({path: `${SHOT_DIRECTORY}/${curve}.png`})

    expect(digits, `the ${curve} emitter carries the full digit ladder`).toBe(5)
  })
})
