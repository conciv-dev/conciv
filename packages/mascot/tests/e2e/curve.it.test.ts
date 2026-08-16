import {expect, test, type Page} from '@playwright/test'
import type {CurveStyle, MascotConfig} from '../../src/core/index.js'
import {expectNear} from './helpers/near.js'
import {
  buildCurvedService,
  buildPlacedService,
  type DigitPlacement,
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

const LARGE_STAGE_PX = 320

const TRIPLE_ANTENNA_PX = PRODUCT_FAB_ANTENNA_PX * 3

const TRAVEL_SAMPLE_S = 2.05

const FAN_SAMPLE_S = 4.4

const FAN_LANE_RATIOS = [1, 1.4, 1.8, 2.2, 2.6]

const LAUNCH_DRIFT_FRACTION = 0.05

const BACKTRACK_FRACTION = 0.0005

const LANDING_PX = 15

test.use({viewport: VIEWPORT})

const openStage = async (
  page: Page,
  curve: CurveStyle,
  placement: StagePlacement,
  stageSizePx = PRODUCT_FAB_ANTENNA_PX,
): Promise<void> => {
  await openMascotPage(page)
  await installManualClock(page)
  await buildCurvedService(page, WORKING, curve, placement, stageSizePx)
}

type DigitTrack = {horizontal: number[]; vertical: number[]; tilt: number[]}

const TRACKED_PROPERTIES = ['x', 'y', 'rotation']

async function trackLeadingDigit(page: Page): Promise<DigitTrack> {
  const frames = await page.evaluate(
    ({names, seconds}) => {
      const harness = window.mascotHarness
      harness.advanceBy(0)
      const digit = harness.requireParticle(harness.requireEmitter(), 0)
      return harness.stepFrames(() => names.map((name) => harness.property(digit, name)), seconds)
    },
    {names: TRACKED_PROPERTIES, seconds: TRAVEL_SAMPLE_S},
  )
  const column = (index: number): number[] => frames.map((frame) => frame[index] ?? 0)
  return {horizontal: column(0), vertical: column(1), tilt: column(2)}
}

const sampleEveryDigitX = (page: Page): Promise<number[][]> =>
  page.evaluate((seconds) => {
    const harness = window.mascotHarness
    harness.advanceBy(0)
    const emitter = harness.requireEmitter()
    const digits = [0, 1, 2, 3, 4].map((index) => harness.requireParticle(emitter, index))
    return harness.stepFrames(() => digits.map((digit) => harness.property(digit, 'x')), seconds)
  }, FAN_SAMPLE_S)

function expectBend(label: string, values: number[], direction: number): void {
  const projected = values.map((value) => value * direction)
  const landing = projected[projected.length - 1] ?? 0
  expect(landing, `${label}: how far into the room the curve lands`).toBeGreaterThan(LANDING_PX)
  const allowedDrift = landing * LAUNCH_DRIFT_FRACTION
  expect(Math.min(...projected), `${label}: the widest drift against the bend while leaving the tip`).toBeGreaterThan(
    -allowedDrift,
  )
  const underway = projected.findIndex((value) => value > allowedDrift)
  const travelling = projected.slice(underway)
  const allowedBacktrack = landing * BACKTRACK_FRACTION
  const backtracks = travelling.filter(
    (value, index) => index > 0 && value - (travelling[index - 1] ?? 0) < -allowedBacktrack,
  )
  expect(backtracks.length, `${label}: samples that reverse the bend once under way`).toBe(0)
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

const openDefaultStage = async (page: Page, placement: StagePlacement): Promise<void> => {
  await openMascotPage(page)
  await installManualClock(page)
  await buildPlacedService(page, WORKING, placement, PRODUCT_FAB_ANTENNA_PX)
}

test('the default curve rises straight when the room above is ample', async ({page}) => {
  await openDefaultStage(page, AT_BOTTOM_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expect(Math.max(...horizontal.map(Math.abs)), 'the largest sideways excursion under ample room').toBeLessThan(0.001)
})

test('the default curve bends into the room on the right at the left viewport edge', async ({page}) => {
  await openDefaultStage(page, AT_LEFT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('the default curve at the left edge', horizontal, 1)
})

test('the default curve bends into the room on the left at the right viewport edge', async ({page}) => {
  await openDefaultStage(page, AT_RIGHT_EDGE)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('the default curve at the right edge', horizontal, -1)
})

test('every digit leaves the tip along the antenna axis and only then tilts with its tangent', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE)
  const {tilt} = await trackLeadingDigit(page)

  expectNear('the digit tilt at the tip', tilt[0] ?? 0, 0, 3)
  expect(Math.max(...tilt.map(Math.abs)), 'the digit tilt further along the curve').toBeGreaterThan(20)
})

test('the launch drift stays proportional on a stage seven times the FAB size', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE, LARGE_STAGE_PX)
  const {horizontal} = await trackLeadingDigit(page)

  expectBend('arc on a 320px stage', horizontal, 1)
})

test('restarting into a room that no longer bends returns the digits to the antenna axis', async ({page}) => {
  await openStage(page, 'auto', AT_LEFT_EDGE)
  const parked = await trackLeadingDigit(page)
  expect(Math.max(...parked.horizontal), 'the digits bend sideways while the tip is squeezed').toBeGreaterThan(
    LANDING_PX,
  )

  const frames = await page.evaluate(
    ({roomy, seconds}) => {
      const harness = window.mascotHarness
      window.parts.root.style.top = `${roomy}px`
      window.service.update({state: 'rest', working: false, follow: false})
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0)
      const digit = harness.requireParticle(harness.requireEmitter(), 0)
      return harness.stepFrames(() => [harness.property(digit, 'x'), harness.property(digit, 'rotation')], seconds)
    },
    {roomy: AT_BOTTOM_EDGE.top, seconds: TRAVEL_SAMPLE_S},
  )
  const sideways = frames.map((frame) => Math.abs(frame[0] ?? 0))
  const tilt = frames.map((frame) => Math.abs(frame[1] ?? 0))

  expect(Math.max(...sideways), 'sideways travel left over from the squeezed curve').toBeLessThan(0.001)
  expect(Math.max(...tilt), 'tangent tilt left over from the squeezed curve').toBeLessThan(0.001)
})

const readPlacement = (page: Page, index: number): Promise<DigitPlacement> =>
  page.evaluate(
    (digit) => window.mascotHarness.curvedDigitPlacement(window.mascotHarness.requireEmitter(), digit),
    index,
  )

test('a curve rider carries the centering offset so its glyph tilts in place', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE)
  const leading = await readPlacement(page, 0)
  const trailing = await readPlacement(page, 1)

  expect(leading.riderLeft, 'the rider sits on the emitter centering offset').toBe('-4px')
  expect(leading.riderTop, 'the rider sits on the emitter centering offset').toBe('-12px')
  expect(trailing.riderLeft, 'both lanes share one rider anchor').toBe('-4px')
  expect(trailing.riderTop, 'both lanes share one rider anchor').toBe('-12px')
  expect(leading.glyphLeft, 'the leading glyph carries only its lane offset').toBe('3px')
  expect(trailing.glyphLeft, 'the trailing glyph carries only its lane offset').toBe('-3px')
  expect(leading.glyphTop, 'the glyph adds no vertical offset inside the rider').toBe('0px')
})

test('the rider centering and the lane inside it both scale with the antenna', async ({page}) => {
  await openStage(page, 'arc', AT_LEFT_EDGE, TRIPLE_ANTENNA_PX)
  const leading = await readPlacement(page, 0)

  expect(leading.riderLeft, 'a tripled antenna triples the rider centering').toBe('-12px')
  expect(leading.riderTop, 'a tripled antenna triples the rider centering').toBe('-36px')
  expect(leading.glyphLeft, 'a tripled antenna triples the lane offset').toBe('9px')
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
