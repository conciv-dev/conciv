import {expect, test, type Page} from '@playwright/test'
import {
  BINARY_EMITTER_DIGIT_COUNT,
  BLINK_BEATS,
  BLINK_CLOSE_SCALE_Y,
  HEAD_BOB_Y_PERCENT,
  REST_EYE_SCALE_Y,
  REST_HEAD_Y_PERCENT,
  THROB_SCALE_Y,
  WORK_CYCLE_S,
} from '../../src/core/config.js'
import {robotSkin} from '../../src/core/skin.js'
import {
  FRAMES_PER_SECOND,
  launchFrames,
  buildService,
  installManualClock,
  openMascotPage,
  expectNear,
  collectLaunches,
  medianStep,
  risePerFrame,
  buildStraightService,
  expectedEmitterGeometry,
  openIdleService,
  restTip,
  tipUnderTransform,
  settle,
  stepsBetween,
  buildCurvedService,
  buildPlacedService,
  type DigitPlacement,
  PRODUCT_FAB_ANTENNA_PX,
  type StagePlacement,
  buildBareService,
  readGaze,
  type StagePoint,
  type StageParts,
  scaleFactorOf,
  travelPerFrame,
  openStreamService,
  type StageSize,
} from './helpers.js'
import {CANVAS_EFFECTS, EFFECT_MOUNTS} from '../effect-catalog.js'
import type {CurveStyle, MascotConfig, MascotConnect} from '../../src/core/index.js'
import {
  MATRIX_DRIP_DURATION_S,
  MATRIX_DRIP_END_Y_PX,
  MATRIX_DRIP_START_Y_PX,
  MATRIX_GLYPHS,
} from '../../src/core/effects/matrix.js'
import {NOTE_GLYPHS, NOTE_RISE_DURATION_S, NOTE_RISE_PX} from '../../src/core/effects/notes.js'
import {
  PIXEL_BUBBLES_COUNT,
  PIXEL_BUBBLES_RISE_DURATION_S,
  PIXEL_BUBBLES_RISE_PX,
} from '../../src/core/effects/pixel-bubbles.js'
import {PUFF_COUNT, PUFF_RISE_DURATION_S, PUFF_RISE_Y_PX} from '../../src/core/effects/steam.js'

test.describe('activity channels', () => {
  type Channel = 'bob' | 'throb' | 'blink'

  type Sample = [number, number, number]

  type ChannelCheck = {column: 0 | 1 | 2; rest: number; swing: number}

  const NEUTRAL_SCALE = 1

  const SAMPLED_SWING_FRACTION = 0.8

  const CHECKS: Record<Channel, ChannelCheck> = {
    throb: {column: 0, rest: NEUTRAL_SCALE, swing: THROB_SCALE_Y - NEUTRAL_SCALE},
    bob: {column: 1, rest: REST_HEAD_Y_PERCENT, swing: Math.abs(HEAD_BOB_Y_PERCENT - REST_HEAD_Y_PERCENT)},
    blink: {column: 2, rest: REST_EYE_SCALE_Y, swing: REST_EYE_SCALE_Y - BLINK_CLOSE_SCALE_Y},
  }

  const CHANNELS: Channel[] = ['bob', 'throb', 'blink']

  const CYCLE_S = 2.05

  const DISPLACED_PHASE_S = 1.19

  const RECOVERY_TAIL_S = 0.3

  const FLAT_TOLERANCE = 0.002

  const RESTED_TOLERANCE = 0.01

  const DISPLACED_FLOOR = 0.1

  const columnOf = (frames: readonly Sample[], index: 0 | 1 | 2): number[] => frames.map((frame) => frame[index])

  const spread = (values: readonly number[], rest: number): number =>
    Math.max(...values.map((value) => Math.abs(value - rest)))

  const closestTo = (values: readonly number[], rest: number): number =>
    Math.min(...values.map((value) => Math.abs(value - rest)))

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  for (const off of CHANNELS) {
    test(`activity {${off}: false} leaves the ${off} channel untouched while the other two run and recover`, async ({
      page,
    }) => {
      const activity = {bob: off !== 'bob', throb: off !== 'throb', blink: off !== 'blink'}
      await installManualClock(page)
      await buildService(page, {state: 'rest', working: false, follow: false, activity})
      const sampled = await page.evaluate(
        ({channels, cycleSeconds, displacedAt, tailSeconds}) => {
          const harness = window.mascotHarness
          const {antenna, head, eyes} = window.parts
          const read = (): [number, number, number] => [
            harness.property(antenna, 'scaleY'),
            harness.property(head, 'yPercent'),
            harness.property(eyes, 'scaleY'),
          ]
          window.service.update({state: 'rest', working: true, follow: false, activity: channels})
          const cycle = harness.stepFrames<[number, number, number]>(read, cycleSeconds)
          harness.advanceBy(displacedAt)
          const displaced = read()
          window.service.update({state: 'rest', working: false, follow: false, activity: channels})
          const tail = harness.stepFrames<[number, number, number]>(read, tailSeconds)
          return {cycle, displaced, tail}
        },
        {channels: activity, cycleSeconds: CYCLE_S, displacedAt: DISPLACED_PHASE_S, tailSeconds: RECOVERY_TAIL_S},
      )

      const everyFrame = [...sampled.cycle, ...sampled.tail]
      const rested = sampled.tail[sampled.tail.length - 1] ?? [Number.NaN, Number.NaN, Number.NaN]
      const running = CHANNELS.filter((channel) => channel !== off)
      const displacedSpread = Math.max(
        ...running.map((channel) => Math.abs(sampled.displaced[CHECKS[channel].column] - CHECKS[channel].rest)),
      )

      expect(
        spread(columnOf(everyFrame, CHECKS[off].column), CHECKS[off].rest),
        `the ${off} channel never moves when it is off, not while working and not on the falling edge`,
      ).toBeLessThan(FLAT_TOLERANCE)
      running.forEach((channel) => {
        expect(
          spread(columnOf(sampled.cycle, CHECKS[channel].column), CHECKS[channel].rest),
          `the ${channel} channel still runs its full swing while ${off} is off`,
        ).toBeGreaterThan(CHECKS[channel].swing * SAMPLED_SWING_FRACTION)
        expect(
          closestTo(columnOf(sampled.cycle, CHECKS[channel].column), CHECKS[channel].rest),
          `the ${channel} channel comes back to rest inside the cycle instead of sticking at its extreme`,
        ).toBeLessThan(RESTED_TOLERANCE)
      })
      expect(displacedSpread, 'work really stops from a displaced pose').toBeGreaterThan(DISPLACED_FLOOR)
      expectNear('the antenna rests at neutral scale once work stops', rested[0], NEUTRAL_SCALE, RESTED_TOLERANCE)
      expectNear('the head rests at its pose height once work stops', rested[1], REST_HEAD_Y_PERCENT, RESTED_TOLERANCE)
      expectNear('the eyes rest at their pose scale once work stops', rested[2], REST_EYE_SCALE_Y, RESTED_TOLERANCE)
    })
  }

  const ALL_CHANNELS = {bob: true, throb: true, blink: true}

  for (const off of CHANNELS) {
    test(`switching ${off} off mid-work hands its channel back to rest instead of freezing it`, async ({page}) => {
      await installManualClock(page)
      await buildService(page, {state: 'rest', working: false, follow: false, activity: ALL_CHANNELS})
      const sampled = await page.evaluate(
        ({dropped, displacedAt, tailSeconds}) => {
          const harness = window.mascotHarness
          const {antenna, head, eyes} = window.parts
          const read = (): [number, number, number] => [
            harness.property(antenna, 'scaleY'),
            harness.property(head, 'yPercent'),
            harness.property(eyes, 'scaleY'),
          ]
          const all = {bob: true, throb: true, blink: true}
          window.service.update({state: 'rest', working: true, follow: false, activity: all})
          harness.advanceTo(displacedAt)
          const displaced = read()
          window.service.update({state: 'rest', working: true, follow: false, activity: {...all, [dropped]: false}})
          const tail = harness.stepFrames<[number, number, number]>(read, tailSeconds)
          return {displaced, tail}
        },
        {dropped: off, displacedAt: DISPLACED_PHASE_S, tailSeconds: RECOVERY_TAIL_S},
      )

      const check = CHECKS[off]
      const settled = sampled.tail[sampled.tail.length - 1] ?? [Number.NaN, Number.NaN, Number.NaN]

      expect(
        Math.abs(sampled.displaced[check.column] - check.rest),
        `the ${off} channel really was displaced when it was switched off`,
      ).toBeGreaterThan(DISPLACED_FLOOR)
      expectNear(
        `the dropped ${off} channel returns to rest instead of freezing where the rebuild caught it`,
        settled[check.column],
        check.rest,
        RESTED_TOLERANCE,
      )
      expect(
        spread(columnOf(sampled.tail.slice(-2), check.column), check.rest),
        `the dropped ${off} channel stays at rest once it has recovered`,
      ).toBeLessThan(RESTED_TOLERANCE)
    })
  }

  const BLINK_ONLY = {bob: false, throb: false, blink: true}

  const NO_CHANNELS = {bob: false, throb: false, blink: false}

  const CLOSED_EYE_SCALE_Y = (REST_EYE_SCALE_Y + BLINK_CLOSE_SCALE_Y) / 2

  const CADENCE_SAMPLE_S = WORK_CYCLE_S * 2 + 0.2

  const BEAT_TOLERANCE_S = 0.08

  const PERIOD_TOLERANCE_S = 2 / FRAMES_PER_SECOND

  const blinkStarts = (values: readonly number[]): number[] =>
    values.flatMap((value, index) =>
      value < CLOSED_EYE_SCALE_Y && (values[index - 1] ?? REST_EYE_SCALE_Y) >= CLOSED_EYE_SCALE_Y ? [index] : [],
    )

  test('the blink keeps its cadence when the bob and the throb are off, because the cycle length is pinned', async ({
    page,
  }) => {
    await installManualClock(page)
    await buildService(page, {state: 'rest', working: false, follow: false, activity: BLINK_ONLY})
    const eyeScaleY = await page.evaluate(
      ({channels, seconds}) => {
        const harness = window.mascotHarness
        const {eyes} = window.parts
        window.service.update({state: 'rest', working: true, follow: false, activity: channels})
        return harness.stepFrames<number>(() => harness.property(eyes, 'scaleY'), seconds)
      },
      {channels: BLINK_ONLY, seconds: CADENCE_SAMPLE_S},
    )

    const starts = blinkStarts(eyeScaleY).map((frame) => frame / FRAMES_PER_SECOND)
    const first = starts[0] ?? Number.NaN
    const second = starts[1] ?? Number.NaN

    expect(starts.length, 'the sample really covers two blinks').toBeGreaterThan(1)
    expect(
      first - BLINK_BEATS[0],
      `the first blink still closes on its beat: closed at ${first}s`,
    ).toBeGreaterThanOrEqual(0)
    expect(first - BLINK_BEATS[0], `the first blink still closes on its beat: closed at ${first}s`).toBeLessThan(
      BEAT_TOLERANCE_S,
    )
    expectNear(
      'the blink repeats on the full work cycle, not on a cycle shrunk to the blink',
      second - first,
      WORK_CYCLE_S,
      PERIOD_TOLERANCE_S,
    )
  })

  const POSE_SETTLE_S = 1.6

  const IN_FLIGHT_S = 2.6

  test('with every activity channel off a mounted stream still launches from the tip the pose moves', async ({
    page,
  }) => {
    await installManualClock(page)
    await buildService(page, {state: 'rest', working: false, follow: false, activity: NO_CHANNELS})
    const sampled = await page.evaluate(
      ({channels, count, inFlightSeconds, settleSeconds}) => {
        const harness = window.mascotHarness
        const {root} = window.parts
        window.service.update({state: 'rest', working: true, follow: false, activity: channels})
        harness.advanceTo(inFlightSeconds)
        const emitter = harness.requireEmitter()
        const indexes = Array.from({length: count}, (_, index) => index)
        window.service.update({state: 'awake', working: true, follow: false, activity: channels})
        const frames = harness.stepFrames<number[]>(
          () => indexes.map((index) => harness.particleFlightOf(emitter, index).top),
          settleSeconds,
        )
        return {frames, stageHeight: root.offsetHeight}
      },
      {
        channels: NO_CHANNELS,
        count: BINARY_EMITTER_DIGIT_COUNT,
        inFlightSeconds: IN_FLIGHT_S,
        settleSeconds: POSE_SETTLE_S,
      },
    )

    const columns = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, digit) =>
      sampled.frames.map((frame) => frame[digit] ?? Number.NaN),
    )
    const launchTops = columns.flatMap((tops) => launchFrames(tops).map((frame) => tops[frame] ?? Number.NaN))
    const awakeTravelPx = Math.abs(robotSkin.awakeHeadYPercent * sampled.stageHeight) / 100

    expect(launchTops.length, 'digits really keep launching across the pose change').toBeGreaterThan(1)
    expect(
      Math.max(...launchTops) - Math.min(...launchTops),
      'the launches follow the tip the pose is moving instead of all starting at the mount-time tip',
    ).toBeGreaterThan(awakeTravelPx)
  })
})

test.describe('activity', () => {
  const LAUNCH_SAMPLE_START_S = 1

  const LAUNCH_SAMPLE_S = 2.6

  const LAUNCH_TIP_TOLERANCE_PX = 1.2

  const NOZZLE_TRAVEL_PX = 3

  const STRETCHED_LAUNCH_AT_S = 2.15

  const STRETCHED_LAUNCH_WINDOW_S = 0.2

  const STRETCHED_DIGIT = 0

  const RELAUNCH_SETTLE_S = 2.4

  const RISE_SAMPLE_S = 0.3

  const RISE_STEP_TOLERANCE_PX = 0.05

  const RESIZE_BURST_WIDTHS = [1200, 900, 1500, 1100]

  const RESIZE_BURST_SIZES_PX = [180, 240, 200, 260, 220, 280]

  const STAGE_NARROW_PX = 200

  const STAGE_WIDE_PX = 320

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  test('entering the working state stages the emitter, throbs and drains without leaking tweens', async ({page}) => {
    await installManualClock(page)
    await buildService(page, {state: 'rest', working: false, follow: true})
    const enter = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: true, follow: false})
      const emitter = harness.requireEmitter()
      harness.advanceBy(0)
      const startScale = harness.property(emitter, 'scale')
      const anchor = harness.boxOf(emitter)
      const scales = harness.stepFrames(() => harness.property(emitter, 'scale'), 0.36)
      return {
        digits: emitter.childElementCount,
        startScale,
        scale: harness.summarize(scales),
        emitters: harness.emitters().length,
        anchor,
        stage: {width: window.parts.root.offsetWidth, height: window.parts.root.offsetHeight},
      }
    })
    const throb = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.advanceTo(2.3)
      const peak = harness.property(window.parts.antenna, 'scaleY')
      const values = harness.stepFrames(() => harness.property(window.parts.antenna, 'scaleY'), 2)
      return {peak, antenna: harness.summarize(values), tweens: harness.globalTweenCount()}
    })
    const exit = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: false, follow: true})
      const emitter = harness.requireEmitter()
      const values = harness.stepFrames(() => harness.property(emitter, 'opacity'), 0.4)
      harness.advanceBy(0.7)
      return {drain: harness.summarize(values), emitters: harness.emitters().length}
    })
    const flap = await page.evaluate(() => {
      const harness = window.mascotHarness
      for (let cycle = 0; cycle < 5; cycle += 1) {
        window.service.update({state: 'rest', working: true, follow: false})
        harness.advanceBy(0.14)
        window.service.update({state: 'rest', working: false, follow: true})
        harness.advanceBy(0.14)
      }
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(1.5)
      return {emitters: harness.emitters().length, tweens: harness.globalTweenCount()}
    })
    const tip = restTip(enter.stage)

    expect(enter.digits, 'emitter carries 5 digits').toBe(5)
    expectNear('the entering emitter anchors at the antenna tip x = stage width x 0.5', enter.anchor.left, tip.x, 1)
    expectNear(
      'the entering emitter anchors at the unbobbed tip y = stage height x 0.15625',
      enter.anchor.top,
      tip.y,
      1,
    )
    expectNear('staged enter starts scaled into the tip at 0.2', enter.startScale, 0.2, 0.01)
    expect(enter.scale.min, 'staged enter starts scaled into the tip').toBeLessThan(0.5)
    expect(enter.scale.max, 'staged enter overshoots to full size').toBeGreaterThanOrEqual(1)
    expect(enter.emitters, 'exactly one emitter while working').toBe(1)
    expectNear('the throb beat at 0.3 peaks at scaleY 1.3', throb.peak, 1.3, 0.01)
    expectNear('throb peaks at scaleY 1.3', throb.antenna.max, 1.3, 0.01)
    expect(throb.antenna.min, 'throb oscillates below the peak').toBeLessThan(1.2)
    expect(exit.drain.max, 'exit starts from a fully visible emitter').toBeGreaterThan(0.99)
    expect(exit.drain.last, 'exit drains the emitter opacity').toBeLessThan(0.7)
    expect(exit.emitters, 'exit removes the emitter').toBe(0)
    expect(flap.emitters, 'five flaps leave exactly one emitter').toBe(1)
    expect(flap.tweens, 'no runaway tween accumulation').toBeLessThanOrEqual(throb.tweens)
  })

  test('entering work launches the first digit from the leaned tip and every later digit from the tip of its own launch frame', async ({
    page,
  }) => {
    await installManualClock(page)
    await buildService(page, {state: 'rest', working: false, follow: true})
    const result = await page.evaluate(
      ({sampleStart, sampleSeconds}) => {
        const harness = window.mascotHarness
        const {antenna, root} = window.parts
        window.service.update({state: 'awake', working: false, follow: false})
        harness.advanceBy(0.9)
        const leaned = harness.property(antenna, 'rotation')
        window.service.update({state: 'rest', working: true, follow: false})
        const emitter = harness.requireEmitter()
        const entry = harness.particleFlightOf(emitter, 0)
        harness.advanceBy(sampleStart)
        const frames = harness.stepFrames<number[]>(
          () => [
            ...[0, 1, 2, 3, 4].map((index) => harness.particleFlightOf(emitter, index).top),
            harness.property(antenna, 'scaleY'),
            harness.property(antenna, 'yPercent'),
          ],
          sampleSeconds,
        )
        return {
          leaned,
          entry,
          frames,
          rotation: harness.property(antenna, 'rotation'),
          stage: {width: root.offsetWidth, height: root.offsetHeight},
        }
      },
      {sampleStart: LAUNCH_SAMPLE_START_S, sampleSeconds: LAUNCH_SAMPLE_S},
    )
    const tip = restTip(result.stage)
    const launches = collectLaunches(result.frames, result.stage)
    const drifts = launches.map((launch) => Math.abs(launch.top - launch.tipY))
    const tips = launches.map((launch) => launch.tipY)

    expectNear('the open pose really leaned the antenna', result.leaned, -4, 0.01)
    expect(
      Math.abs(result.entry.left - tip.x),
      'the first digit launches from the leaned tip, not the rest tip',
    ).toBeGreaterThan(1)
    expectNear('the work pose returns the antenna to rest', result.rotation, 0, 0.01)
    expect(launches.length, 'the sampled bob really restarts several digit cycles').toBeGreaterThanOrEqual(4)
    expect(
      Math.max(...drifts),
      `every digit launches from the tip of its own launch frame: worst drift ${Math.max(...drifts)}px`,
    ).toBeLessThanOrEqual(LAUNCH_TIP_TOLERANCE_PX)
    expect(
      Math.max(...tips) - Math.min(...tips),
      'the bob really carried the launch point across the sampled window',
    ).toBeGreaterThan(NOZZLE_TRAVEL_PX)
  })

  test('a digit launching mid-throb starts from the stretched tip, not the unstretched one', async ({page}) => {
    await openIdleService(page)
    const result = await page.evaluate(
      ({launchAt, windowSeconds, digit}) => {
        const harness = window.mascotHarness
        const {antenna, root} = window.parts
        window.service.update({state: 'rest', working: true, follow: false})
        harness.advanceTo(launchAt)
        const emitter = harness.requireEmitter()
        const frames = harness.stepFrames<[number, number, number]>(
          () => [
            harness.particleFlightOf(emitter, digit).top,
            harness.property(antenna, 'scaleY'),
            harness.property(antenna, 'yPercent'),
          ],
          windowSeconds,
        )
        return {frames, stage: {width: root.offsetWidth, height: root.offsetHeight}}
      },
      {launchAt: STRETCHED_LAUNCH_AT_S, windowSeconds: STRETCHED_LAUNCH_WINDOW_S, digit: STRETCHED_DIGIT},
    )
    const tops = result.frames.map((frame) => frame[0])
    const frame = launchFrames(tops)[0] ?? -1
    const launched = result.frames[frame] ?? [Number.NaN, Number.NaN, Number.NaN]
    const stretchedTip = tipUnderTransform(result.stage, launched[1], launched[2])
    const unstretchedTip = tipUnderTransform(result.stage, 1, launched[2])

    expect(frame, 'the sampled window really restarts one digit cycle').toBeGreaterThan(0)
    expect(launched[1], 'the digit really launches while the antenna is stretched').toBeGreaterThan(1.1)
    expect(
      Math.abs(stretchedTip.y - unstretchedTip.y),
      'the stretch really displaces the tip the digit launches from',
    ).toBeGreaterThan(1)
    expectNear('the launching digit starts on the stretched tip', launched[0], stretchedTip.y, LAUNCH_TIP_TOLERANCE_PX)
  })

  test('a viewport resize rebuilds the emitter so later digits launch from the real tip at the new scale', async ({
    page,
  }) => {
    await page.setViewportSize({width: 1000, height: 800})
    await installManualClock(page)
    await buildStraightService(page, {state: 'rest', working: false, follow: false})
    const before = await page.evaluate((riseSeconds) => {
      const harness = window.mascotHarness
      harness.applyStyle(window.parts.root, {width: '20vw', height: '20vw'})
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.5)
      harness.watchResize()
      harness.watchEmitterMounts()
      return harness.emitterFlight(window.parts, riseSeconds)
    }, RISE_SAMPLE_S)
    await page.setViewportSize({width: 1600, height: 800})
    const after = await page.evaluate(
      async ({settleSeconds, riseSeconds}) => {
        const harness = window.mascotHarness
        await harness.awaitResize()
        const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
        if (!rebuilt) throw new Error('the resize never rebuilt the emitter')
        harness.advanceBy(settleSeconds)
        return harness.emitterFlight(window.parts, riseSeconds)
      },
      {settleSeconds: RELAUNCH_SETTLE_S, riseSeconds: RISE_SAMPLE_S},
    )
    const narrow = expectedEmitterGeometry(before.antennaPx)
    const widened = expectedEmitterGeometry(after.antennaPx)

    expectNear('digits launch on the antenna axis of the narrow stage', before.launchLeft, before.stageWidth * 0.5, 0.5)
    expect(after.stageWidth, 'the resize really widened the stage').toBeGreaterThan(before.stageWidth + 50)
    expect(after.antennaPx, 'the resize really grew the antenna box').toBeGreaterThan(before.antennaPx + 50)
    expectNear('digits launch on the antenna axis of the widened stage', after.launchLeft, after.stageWidth * 0.5, 0.5)
    expectNear('the narrow stage sizes its digits to its own antenna', before.fontSizePx, narrow.fontSizePx, 0.5)
    expectNear('the widened stage re-sizes its digits to the grown antenna', after.fontSizePx, widened.fontSizePx, 0.5)
    expectNear('the widened stage re-scales the digit lane offset', after.leadingLeft, widened.leadingLeft, 0.5)
    expectNear('the widened stage re-scales the digit placement', after.top, widened.top, 0.5)
    expectNear(
      'the narrow stage rises at its own antenna scale',
      medianStep(before.rise),
      risePerFrame(before.antennaPx),
      RISE_STEP_TOLERANCE_PX,
    )
    expectNear(
      'the widened stage rises at the grown antenna scale',
      medianStep(after.rise),
      risePerFrame(after.antennaPx),
      RISE_STEP_TOLERANCE_PX,
    )
  })

  test('a stage the consumer grows in css rebuilds the emitter at the new antenna scale with no window resize', async ({
    page,
  }) => {
    await page.setViewportSize({width: 1600, height: 800})
    await installManualClock(page)
    await buildStraightService(page, {state: 'rest', working: false, follow: false})
    const before = await page.evaluate(
      ({narrowPx, riseSeconds}) => {
        const harness = window.mascotHarness
        harness.applyStyle(window.parts.root, {width: `${narrowPx}px`, height: `${narrowPx}px`})
        window.service.update({state: 'rest', working: true, follow: false})
        harness.advanceBy(0.5)
        harness.watchEmitterMounts()
        return harness.emitterFlight(window.parts, riseSeconds)
      },
      {narrowPx: STAGE_NARROW_PX, riseSeconds: RISE_SAMPLE_S},
    )
    const after = await page.evaluate(
      async ({widePx, settleSeconds, riseSeconds}) => {
        const harness = window.mascotHarness
        harness.applyStyle(window.parts.root, {width: `${widePx}px`, height: `${widePx}px`})
        const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
        if (!rebuilt) throw new Error('the css stage growth never rebuilt the emitter')
        harness.advanceBy(settleSeconds)
        return harness.emitterFlight(window.parts, riseSeconds)
      },
      {widePx: STAGE_WIDE_PX, settleSeconds: RELAUNCH_SETTLE_S, riseSeconds: RISE_SAMPLE_S},
    )
    const narrow = expectedEmitterGeometry(before.antennaPx)
    const widened = expectedEmitterGeometry(after.antennaPx)

    expect(after.antennaPx, 'the css growth really grew the antenna box').toBeGreaterThan(before.antennaPx + 50)
    expectNear('the narrow stage sized its digits to its own antenna', before.fontSizePx, narrow.fontSizePx, 0.5)
    expectNear('digits launch on the antenna axis of the grown stage', after.launchLeft, after.stageWidth * 0.5, 0.5)
    expectNear('the grown stage re-sizes its digits to the grown antenna', after.fontSizePx, widened.fontSizePx, 0.5)
    expectNear('the grown stage re-scales the digit lane offset', after.leadingLeft, widened.leadingLeft, 0.5)
    expectNear('the grown stage re-scales the digit placement', after.top, widened.top, 0.5)
    expectNear(
      'the grown stage rises at the grown antenna scale',
      medianStep(after.rise),
      risePerFrame(after.antennaPx),
      RISE_STEP_TOLERANCE_PX,
    )
  })

  test('the work timeline bobs the head and leaves every other pose channel untouched', async ({page}) => {
    await openIdleService(page)
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {head, eyes, antenna} = window.parts
      const drift = () =>
        Math.max(
          Math.abs(harness.property(head, 'rotation')),
          Math.abs(harness.property(head, 'scaleX') - 1),
          Math.abs(harness.property(head, 'scaleY') - 1),
          Math.abs(harness.property(eyes, 'x')),
          Math.abs(harness.property(eyes, 'y')),
        )
      window.service.update({state: 'rest', working: true, follow: false})
      const values = harness.stepFrames<[number, number, number]>(
        () => [drift(), harness.property(antenna, 'scaleY'), harness.property(head, 'yPercent')],
        2.4,
      )
      return {
        drift: harness.summarize(values.map((entry) => entry[0])),
        antenna: harness.summarize(values.map((entry) => entry[1])),
        head: harness.summarize(values.map((entry) => entry[2])),
      }
    })

    expect(result.drift.max, 'activity leaves head rotation and scale and the eyes offset untouched').toBe(0)
    expectNear('the sampled window really was throbbing', result.antenna.max, 1.3, 0.01)
    expectNear('the head bobs down to yPercent -5', result.head.min, -5, 0.05)
    expectNear('the head bob returns to the rest yPercent', result.head.max, 0, 0.05)
  })

  test('the work bob carries the head, the antenna and the eyes as one unit', async ({page}) => {
    await openIdleService(page)
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {head, eyes, antenna} = window.parts
      const readLayers = (): [number, number, number] => [
        harness.property(head, 'yPercent'),
        harness.property(antenna, 'yPercent'),
        harness.property(eyes, 'yPercent'),
      ]
      const drift = (values: [number, number, number][]) =>
        harness.summarize(
          values.map(([headY, antennaY, eyesY]) => Math.max(Math.abs(antennaY - headY), Math.abs(eyesY - headY))),
        )
      const peaks = (values: [number, number, number][]) => ({
        head: harness.summarize(values.map((entry) => entry[0])),
        antenna: harness.summarize(values.map((entry) => entry[1])),
        eyes: harness.summarize(values.map((entry) => entry[2])),
      })
      window.service.update({state: 'rest', working: true, follow: false})
      const restValues = harness.stepFrames<[number, number, number]>(readLayers, 2.4)
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.5)
      window.service.update({state: 'awake', working: false, follow: false})
      harness.advanceBy(0.9)
      window.service.update({state: 'awake', working: true, follow: false})
      const awakeValues = harness.stepFrames<[number, number, number]>(readLayers, 2.4)
      return {
        rest: peaks(restValues),
        restDrift: drift(restValues),
        awake: peaks(awakeValues),
        awakeDrift: drift(awakeValues),
      }
    })

    expectNear('the rest head still bobs down to yPercent -5', result.rest.head.min, -5, 0.05)
    expectNear('the antenna bobs to the same yPercent as the rest head', result.rest.antenna.min, -5, 0.05)
    expectNear('the eyes bob to the same yPercent as the rest head', result.rest.eyes.min, -5, 0.05)
    expectNear('the antenna returns to its rest yPercent 0', result.rest.antenna.max, 0, 0.05)
    expectNear('the eyes return to their rest yPercent 0', result.rest.eyes.max, 0, 0.05)
    expect(result.restDrift.max, 'the rest bob never separates the antenna or eyes from the head').toBeLessThan(0.001)
    expectNear('the awake head bobs down to yPercent -5', result.awake.head.min, -5, 0.05)
    expectNear('the awake antenna bobs down to the head yPercent -5', result.awake.antenna.min, -5, 0.05)
    expectNear('the awake eyes bob down to the head yPercent -5', result.awake.eyes.min, -5, 0.05)
    expectNear('the awake antenna returns to the awake rest yPercent -2', result.awake.antenna.max, -2, 0.05)
    expectNear('the awake eyes return to the awake rest yPercent -2', result.awake.eyes.max, -2, 0.05)
    expect(result.awakeDrift.max, 'the awake bob never separates the antenna or eyes from the head').toBeLessThan(0.001)
  })

  test('stopping work returns the antenna and the eyes to the pose yPercent of the current state', async ({page}) => {
    await openIdleService(page)
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {eyes, antenna} = window.parts
      const readLayers = () => ({
        antenna: harness.property(antenna, 'yPercent'),
        eyes: harness.property(eyes, 'yPercent'),
      })
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.7)
      const bobbed = readLayers()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.25)
      const heldRest = readLayers()
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.7)
      window.service.update({state: 'awake', working: false, follow: false})
      harness.advanceBy(0.9)
      const posedAwake = readLayers()
      window.service.update({state: 'awake', working: true, follow: false})
      harness.advanceBy(0.7)
      const awakeBobbed = readLayers()
      window.service.update({state: 'awake', working: false, follow: false})
      harness.advanceBy(0.25)
      const heldAwake = readLayers()
      window.service.update({state: 'awake', working: true, follow: false})
      harness.advanceBy(0.7)
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.9)
      const posedRest = readLayers()
      return {bobbed, heldRest, posedAwake, awakeBobbed, heldAwake, posedRest}
    })

    expect(result.bobbed.antenna, 'the antenna really left its rest yPercent while working').toBeLessThan(-1)
    expect(result.bobbed.eyes, 'the eyes really left their rest yPercent while working').toBeLessThan(-1)
    expectNear('same-state rest recovery returns the antenna to yPercent 0', result.heldRest.antenna, 0, 0.001)
    expectNear('same-state rest recovery returns the eyes to yPercent 0', result.heldRest.eyes, 0, 0.001)
    expectNear('the work to awake edge lands the antenna on yPercent -2', result.posedAwake.antenna, -2, 0.001)
    expectNear('the work to awake edge lands the eyes on yPercent -2', result.posedAwake.eyes, -2, 0.001)
    expect(result.awakeBobbed.antenna, 'the antenna really left the awake yPercent while working').toBeLessThan(-2.5)
    expect(result.awakeBobbed.eyes, 'the eyes really left the awake yPercent while working').toBeLessThan(-2.5)
    expectNear('same-state awake recovery returns the antenna to yPercent -2', result.heldAwake.antenna, -2, 0.001)
    expectNear('same-state awake recovery returns the eyes to yPercent -2', result.heldAwake.eyes, -2, 0.001)
    expectNear('the work to rest edge lands the antenna on yPercent 0', result.posedRest.antenna, 0, 0.001)
    expectNear('the work to rest edge lands the eyes on yPercent 0', result.posedRest.eyes, 0, 0.001)
  })

  test('stopping work returns the head to the pose yPercent of the current state', async ({page}) => {
    await openIdleService(page)
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const settleHead = () => {
        harness.advanceBy(0.25)
        return harness.property(window.parts.head, 'yPercent')
      }
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(1.3)
      const bobbed = harness.property(window.parts.head, 'yPercent')
      window.service.update({state: 'rest', working: false, follow: false})
      const rest = settleHead()
      window.service.update({state: 'awake', working: false, follow: false})
      harness.advanceBy(0.9)
      window.service.update({state: 'awake', working: true, follow: false})
      const awakeValues = harness.stepFrames(() => harness.property(window.parts.head, 'yPercent'), 2.4)
      window.service.update({state: 'awake', working: false, follow: false})
      const awake = settleHead()
      return {bobbed, rest, awakeBob: harness.summarize(awakeValues), awake}
    })

    expect(result.bobbed, 'the head really left its rest yPercent while working').toBeLessThan(-1)
    expectNear('rest recovery returns the head to yPercent 0', result.rest, 0, 0.001)
    expect(result.awakeBob.min, 'the awake head bobs too').toBeLessThan(-4)
    expectNear('awake recovery returns the head to yPercent -2', result.awake, -2, 0.001)
  })

  test('a burst of resizes rebuilds the emitter without leaking emitters or tweens', async ({page}) => {
    await page.setViewportSize({width: 1000, height: 800})
    await installManualClock(page)
    await buildService(page, {state: 'rest', working: false, follow: false})
    const settled = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.applyStyle(window.parts.root, {width: '20vw', height: '20vw'})
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(1)
      return {emitters: harness.emitters().length, tweens: harness.globalTweenCount()}
    })
    for (const width of RESIZE_BURST_WIDTHS) {
      await page.evaluate(() => {
        window.mascotHarness.watchResize()
        window.mascotHarness.watchEmitterMounts()
      })
      await page.setViewportSize({width, height: 800})
      await page.evaluate(async () => {
        const harness = window.mascotHarness
        await harness.awaitResize()
        const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
        if (!rebuilt) throw new Error('a burst resize never rebuilt the emitter')
      })
    }
    const after = await page.evaluate((settleSeconds) => {
      const harness = window.mascotHarness
      harness.advanceBy(settleSeconds)
      return {
        emitters: harness.emitters().length,
        tweens: harness.globalTweenCount(),
        digits: harness.requireEmitter().childElementCount,
      }
    }, RELAUNCH_SETTLE_S)
    const coalesced = await page.evaluate(async (sizes) => {
      const harness = window.mascotHarness
      const before = harness.requireEmitter()
      harness.watchEmitterMounts()
      sizes.forEach((size) => harness.applyStyle(window.parts.root, {width: `${size}px`, height: `${size}px`}))
      const rebuiltSynchronously = harness.requireEmitter() !== before
      const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
      if (!rebuilt) throw new Error('the coalesced burst never rebuilt the emitter')
      await harness.settleFrames()
      await harness.settleFrames()
      return {
        rebuiltSynchronously,
        mounts: harness.emitterMounts(),
        replaced: harness.requireEmitter() !== before,
        emitters: harness.emitters().length,
      }
    }, RESIZE_BURST_SIZES_PX)

    expect(settled.emitters, 'the working stage really carries one emitter before the burst').toBe(1)
    expect(after.emitters, 'a burst of resizes leaves exactly one emitter').toBe(1)
    expect(after.digits, 'the rebuilt emitter is fully built').toBe(5)
    expect(after.tweens, 'a burst of resizes accumulates no runaway tweens').toBeLessThanOrEqual(settled.tweens)
    expect(
      coalesced.mounts,
      `${RESIZE_BURST_SIZES_PX.length} stage resizes in one frame rebuild the emitter once`,
    ).toBe(1)
    expect(coalesced.rebuiltSynchronously, 'no stage resize rebuilds the emitter inside the mutation itself').toBe(
      false,
    )
    expect(coalesced.replaced, 'the coalesced rebuild really replaced the emitter node').toBe(true)
    expect(coalesced.emitters, 'the coalesced rebuild leaves exactly one emitter').toBe(1)
  })
})

test.describe('all effects', () => {
  const WORK_SAMPLE_MS = 700

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  for (const [name, mount] of Object.entries(EFFECT_MOUNTS)) {
    test(`the ${name} effect drains its nodes, tweens and frame loop on the falling edge`, async ({page}) => {
      await installManualClock(page)
      const result = await page.evaluate(
        async ({effectName, exportName}) => {
          const harness = window.mascotHarness
          const effect = await harness.loadEffect(effectName, exportName)
          const parts = harness.buildStage()
          const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
          service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
          const read = () => ({
            nodes: parts.root.childElementCount,
            tweens: harness.globalTweenCount(),
            frames: harness.pendingFrameCount(),
            loops: harness.tickerListenerCount(),
          })
          const runCycle = async () => {
            service.update({state: 'rest', working: true, follow: false})
            harness.advanceBy(0.9)
            await harness.settleFrames()
            const working = read()
            service.update({state: 'rest', working: false, follow: false})
            harness.advanceBy(0.2)
            await harness.settleFrames()
            const draining = read()
            harness.advanceBy(1)
            return {working, draining}
          }
          await runCycle()
          await harness.settleFrames()
          const idle = read()
          service.mountEffect(effectName, effect)
          const cycled = await runCycle()
          await harness.settleFrames()
          const drained = read()
          service.destroy()
          parts.root.remove()
          return {idle, working: cycled.working, draining: cycled.draining, drained}
        },
        {effectName: name, exportName: mount},
      )
      const loops = CANVAS_EFFECTS.includes(name) ? 1 : 0

      expect(result.working.nodes, `${name} adds an emitter node while working`).toBeGreaterThan(result.idle.nodes)
      expect(result.working.frames, `${name} rides the one gsap ticker rAF and never opens a second one`).toBe(
        result.idle.frames,
      )
      expect(result.working.loops, `${name} runs the frame loops its rendering needs`).toBe(result.idle.loops + loops)
      expect(result.draining.nodes, `${name} still owns its emitter node mid-drain`).toBe(result.working.nodes)
      expect(result.draining.loops, `${name} keeps painting while the staged exit runs`).toBe(result.idle.loops + loops)
      expect(result.drained.nodes, `${name} drains every emitter node it added`).toBe(result.idle.nodes)
      expect(result.drained.tweens, `${name} leaves no tween running`).toBe(result.idle.tweens)
      expect(result.drained.frames, `${name} opens no rAF of its own`).toBe(result.idle.frames)
      expect(result.drained.loops, `${name} cancels every frame loop it started`).toBe(result.idle.loops)
    })
  }

  for (const name of CANVAS_EFFECTS) {
    test(`the ${name} effect repaints its canvas while it works`, async ({page}) => {
      const result = await page.evaluate(
        async ({effectName, exportName, sampleMs}) => {
          const harness = window.mascotHarness
          const effect = await harness.loadEffect(effectName, exportName)
          const parts = harness.buildStage()
          const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
          service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
          service.mountEffect(effectName, effect)
          service.update({state: 'rest', working: true, follow: false})
          const canvas = harness.requireCanvas(parts.root)
          const painted = await harness.sampleFrames(() => harness.canvasSignature(canvas), sampleMs)
          service.destroy()
          parts.root.remove()
          return {unique: new Set(painted).size, samples: painted.length}
        },
        {effectName: name, exportName: EFFECT_MOUNTS[name] ?? '', sampleMs: WORK_SAMPLE_MS},
      )

      expect(result.samples, `${name} really sampled a full emission cycle`).toBeGreaterThan(10)
      expect(result.unique, `${name} repaints its canvas as its sparks travel`).toBeGreaterThan(1)
    })
  }

  const FOUNTAIN_STEADY_STATE_MS = 1400

  const FOUNTAIN_DRAIN_SAMPLE_MS = 400

  const DRAINED_INK_CEILING = 0.5

  test('the spark-fountain effect stops emitting on the falling edge and lets its live sparks finish', async ({
    page,
  }) => {
    const result = await page.evaluate(
      async ({steadyStateMs, drainMs}) => {
        const harness = window.mascotHarness
        const effect = await harness.loadEffect('spark-fountain', 'sparkFountainEffect')
        const parts = harness.buildStage()
        const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
        service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
        service.mountEffect('spark-fountain', effect)
        service.update({state: 'rest', working: true, follow: false})
        const canvas = harness.requireCanvas(parts.root)
        await harness.wait(steadyStateMs)
        const working = harness.canvasInk(canvas)
        service.update({state: 'rest', working: false, follow: false})
        await harness.nextFrame()
        await harness.nextFrame()
        const drainStart = harness.canvasInk(canvas)
        await harness.wait(drainMs)
        const drainEnd = harness.canvasInk(canvas)
        service.destroy()
        parts.root.remove()
        return {working, drainStart, drainEnd}
      },
      {steadyStateMs: FOUNTAIN_STEADY_STATE_MS, drainMs: FOUNTAIN_DRAIN_SAMPLE_MS},
    )

    expect(result.working, 'the fountain really painted a steady-state spark population').toBeGreaterThan(0)
    expect(result.drainStart, 'the drain really starts from a populated canvas').toBeGreaterThan(0)
    expect(
      result.drainEnd,
      `the drain paints only the sparks it already had -> ${JSON.stringify(result)}`,
    ).toBeLessThan(result.drainStart * DRAINED_INK_CEILING)
  })
})

test.describe('anchor perf', () => {
  const WORK_WARMUP_S = 2.5

  const WORK_SAMPLE_S = 2.4

  const POINTER_MOVE_COUNT = 8

  const POINTER_REACH_PX = 300

  const POINTER_STEP_PX = 20

  const GAZE_SETTLE_MS = 250

  test.beforeEach(async ({page}) => {
    await openMascotPage(page, {countLayoutReads: true})
  })

  test('a warmed work cycle rides the antenna without reading layout again', async ({page}) => {
    await openIdleService(page)
    const sampled = await page.evaluate(
      ({warmupSeconds, sampleSeconds}) => {
        const harness = window.mascotHarness
        window.service.update({state: 'rest', working: true, follow: false})
        harness.advanceBy(warmupSeconds)
        const emitter = harness.requireEmitter()
        const before = harness.layoutReads()
        const frames = harness.stepFrames<number[]>(
          () => [
            ...[0, 1, 2, 3, 4].map((index) => harness.particleFlightOf(emitter, index).top),
            harness.property(window.parts.antenna, 'scaleY'),
            harness.property(window.parts.antenna, 'yPercent'),
          ],
          sampleSeconds,
        )
        const after = harness.layoutReads()
        return {
          computedStyle: after.computedStyle - before.computedStyle,
          offset: after.offset - before.offset,
          frames,
          stage: {width: window.parts.root.offsetWidth, height: window.parts.root.offsetHeight},
        }
      },
      {warmupSeconds: WORK_WARMUP_S, sampleSeconds: WORK_SAMPLE_S},
    )
    const launches = collectLaunches(sampled.frames, sampled.stage)
    const tips = launches.map((launch) => launch.tipY)

    expect(sampled.frames.length, 'the sampled window really stepped a full work cycle of frames').toBeGreaterThan(50)
    expect(launches.length, 'the sampled window really restarts several digit cycles').toBeGreaterThanOrEqual(2)
    expect(
      Math.max(...tips) - Math.min(...tips),
      `the launch point really rode the antenna across the window: ${JSON.stringify(tips)}`,
    ).toBeGreaterThan(0.5)
    expect(sampled.offset, 'the per-frame anchor path reads no layout offsets').toBe(0)
    expect(sampled.computedStyle, 'the per-frame anchor path reads no computed styles').toBe(0)
  })

  test('the armed gaze measures the eye box once and reuses it for every later pointer move', async ({page}) => {
    const center = await buildService(page, {state: 'rest', working: false, follow: true})
    const armed = await page.evaluate(() => window.mascotHarness.layoutReads().rect)
    await page.mouse.move(center.x + POINTER_REACH_PX, center.y)
    await settle(page, GAZE_SETTLE_MS)
    const measured = await page.evaluate(() => window.mascotHarness.layoutReads().rect)
    for (let step = 1; step <= POINTER_MOVE_COUNT; step += 1) {
      await page.mouse.move(center.x + POINTER_REACH_PX - step * POINTER_STEP_PX, center.y + step * POINTER_STEP_PX)
    }
    await settle(page, GAZE_SETTLE_MS)
    const tracked = await page.evaluate(() => ({
      rect: window.mascotHarness.layoutReads().rect,
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
})

test.describe('binary nozzle', () => {
  const RELEASE_CROSSING_S = 3.4

  const RELEASE_WINDOW_S = 0.41

  const IN_FLIGHT_DIGIT = 0

  const LAUNCHING_DIGIT = 3

  const OVERSPEED_ALLOWANCE = 1.05

  const LAUNCH_FRAME_TOLERANCE_PX = 1.2

  const RELEASED_TIP_TRAVEL_PX = 1

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  test('a digit in flight holds its world rise through the throb release while the next digit launches from the released tip', async ({
    page,
  }) => {
    await openIdleService(page)
    const sampled = await page.evaluate(
      ({releaseAt, windowSeconds, inFlight, launching}) => {
        const harness = window.mascotHarness
        const {antenna, root} = window.parts
        window.service.update({state: 'rest', working: true, follow: false})
        harness.advanceTo(releaseAt)
        const emitter = harness.requireEmitter()
        const frames = harness.stepFrames<[number, number, number, number]>(
          () => [
            harness.particleFlightOf(emitter, inFlight).top,
            harness.particleFlightOf(emitter, launching).top,
            harness.property(antenna, 'scaleY'),
            harness.property(antenna, 'yPercent'),
          ],
          windowSeconds,
        )
        return {
          inFlightTops: frames.map((frame) => frame[0]),
          launchingTops: frames.map((frame) => frame[1]),
          scaleY: frames.map((frame) => frame[2]),
          yPercent: frames.map((frame) => frame[3]),
          antennaPx: Math.min(antenna.offsetWidth, antenna.offsetHeight),
          stage: {width: root.offsetWidth, height: root.offsetHeight},
        }
      },
      {
        releaseAt: RELEASE_CROSSING_S,
        windowSeconds: RELEASE_WINDOW_S,
        inFlight: IN_FLIGHT_DIGIT,
        launching: LAUNCHING_DIGIT,
      },
    )
    const steps = stepsBetween(sampled.inFlightTops)
    const nominalStep = risePerFrame(sampled.antennaPx)
    const launches = launchFrames(sampled.launchingTops)
    const launchFrame = launches[0] ?? -1
    const launchTop = sampled.launchingTops[launchFrame] ?? Number.NaN
    const launchTip = tipUnderTransform(
      sampled.stage,
      sampled.scaleY[launchFrame] ?? Number.NaN,
      sampled.yPercent[launchFrame] ?? Number.NaN,
    )
    const restingTip = restTip(sampled.stage)

    expectNear('the sampled window really opens on the throb peak', Math.max(...sampled.scaleY), 1.3, 0.01)
    expect(Math.min(...sampled.scaleY), 'the sampled window really releases the throb').toBeLessThan(1.05)
    expect(
      Math.max(...steps),
      `every frame carries the in-flight digit further up, none drags it back: worst step ${Math.max(...steps)}px`,
    ).toBeLessThan(0)
    expect(
      Math.min(...steps),
      `no frame outruns the ${nominalStep.toFixed(3)}px launch speed of a 60Hz frame`,
    ).toBeGreaterThan(nominalStep * OVERSPEED_ALLOWANCE)
    expectNear(
      'the in-flight digit holds its launch speed frame after frame',
      steps[0] ?? Number.NaN,
      nominalStep,
      0.01,
    )
    expect(launches.length, 'exactly one digit cycle starts inside the release window').toBe(1)
    expectNear(
      'the launching digit starts on the tip of the frame it launches on',
      launchTop,
      launchTip.y,
      LAUNCH_FRAME_TOLERANCE_PX,
    )
    expect(
      Math.abs(launchTip.y - restingTip.y),
      'the released tip really left the resting tip the emitter was built on',
    ).toBeGreaterThan(RELEASED_TIP_TRAVEL_PX)
  })
})

test.describe('curve', () => {
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

    expect(Math.max(...horizontal.map(Math.abs)), 'the largest sideways excursion of a straight rise').toBeLessThan(
      0.001,
    )
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
})

test.describe('effects', () => {
  const CUSTOM_LAYER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

  const CUSTOM_REFERENCE_ANTENNA_PX = 88

  const FAB_ANTENNA_PX = 44

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
    await installManualClock(page)
  })

  test('a working core with no effect mounted emits nothing', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: true, follow: false})
    const emitters = await page.evaluate(() => {
      window.mascotHarness.advanceBy(0.7)
      return window.mascotHarness.emitters().length
    })

    expect(emitters, 'core mounts no effect of its own').toBe(0)
  })

  test('two mounted effects run two emitters and both drain on the working falling edge', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const mount = harness.mascot.binaryEffect
      window.service.mountEffect('left', mount)
      window.service.mountEffect('right', mount)
      const idle = harness.emitters().length
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      const working = harness.emitters().length
      const opacities = harness.emitters().map((emitter) => harness.property(emitter, 'opacity'))
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.9)
      return {idle, working, opacities, drained: harness.emitters().length}
    })

    expect(result.idle, 'mounting an effect while idle starts nothing').toBe(0)
    expect(result.working, 'two mounted effects run two emitters').toBe(2)
    expect(
      result.opacities.every((opacity) => opacity > 0.99),
      `both emitters reach full opacity -> ${JSON.stringify(result.opacities)}`,
    ).toBe(true)
    expect(result.drained, 'the falling edge drains both emitters').toBe(0)
  })

  test('each keyed effect mounts into its own bound host', async ({page}) => {
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
      const connected = service.connect()
      const parts = harness.buildStage()
      const left = document.createElement('div')
      const right = document.createElement('div')
      parts.root.append(left, right)
      connected.getEffectHostProps('left').ref(left)
      connected.getEffectHostProps('right').ref(right)
      connected.getRootProps().ref(parts.root)
      connected.getHeadProps().ref(parts.head)
      connected.getEyesProps().ref(parts.eyes)
      connected.getAntennaProps().ref(parts.antenna)
      const mount = harness.mascot.binaryEffect
      service.mountEffect('left', mount)
      service.mountEffect('right', mount)
      service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.7)
      const reading = {
        stableRef: connected.getEffectHostProps('left').ref === connected.getEffectHostProps('left').ref,
        distinctRefs: connected.getEffectHostProps('left').ref !== connected.getEffectHostProps('right').ref,
        leftHosted: left.childElementCount,
        rightHosted: right.childElementCount,
        emitters: harness.emitters().length,
      }
      service.destroy()
      parts.root.remove()
      return reading
    })

    expect(result.stableRef, 'the same effect-host id hands back the same ref').toBe(true)
    expect(result.distinctRefs, 'different effect-host ids hand back different refs').toBe(true)
    expect(result.emitters, 'both keyed effects are live').toBe(2)
    expect(result.leftHosted, 'the left effect mounts into the left host').toBe(1)
    expect(result.rightHosted, 'the right effect mounts into the right host').toBe(1)
  })

  test('binding an effect host after the structural refs never re-registers the rig', async ({page}) => {
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const service = harness.mascot.createMascot({state: 'rest', working: true, follow: true})
      const connected = service.connect()
      const parts = harness.buildStage()
      connected.getRootProps().ref(parts.root)
      connected.getHeadProps().ref(parts.head)
      connected.getEyesProps().ref(parts.eyes)
      connected.getAntennaProps().ref(parts.antenna)
      service.mountEffect('binary', harness.mascot.binaryEffect)
      harness.advanceBy(0.7)
      const wrapperBefore = harness.requireLeanWrapper()
      const timelineBefore = harness.repeatingTimeline()
      const host = document.createElement('div')
      parts.root.append(host)
      connected.getEffectHostProps('binary').ref(host)
      harness.advanceBy(0.7)
      const reading = {
        sameWrapper: harness.requireLeanWrapper() === wrapperBefore,
        sameTimeline: harness.repeatingTimeline() === timelineBefore,
        wrappers: harness.leanWrappers().length,
        emitters: harness.emitters().length,
        hosted: host.childElementCount,
      }
      service.destroy()
      parts.root.remove()
      return reading
    })

    expect(result.sameWrapper, 'a late effect host keeps the same lean wrapper').toBe(true)
    expect(result.sameTimeline, 'a late effect host keeps the running work timeline').toBe(true)
    expect(result.wrappers, 'a late effect host leaves exactly one lean wrapper').toBe(1)
    expect(result.emitters, 'a late effect host leaves exactly one emitter').toBe(1)
    expect(result.hosted, 'the effect re-homes into the late host').toBe(1)
  })

  test('unmounting one effect drains it and leaves the other running', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const mount = harness.mascot.binaryEffect
      window.service.mountEffect('left', mount)
      window.service.mountEffect('right', mount)
      harness.advanceBy(0.7)
      const both = harness.emitters().length
      window.service.unmountEffect('left')
      harness.advanceBy(0.7)
      return {both, remaining: harness.emitters().length}
    })

    expect(result.both, 'both effects run while working').toBe(2)
    expect(result.remaining, 'unmounting one effect leaves the other running').toBe(1)
  })

  test('destroying while an unmounted effect is still draining removes it', async ({page}) => {
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const service = harness.mascot.createMascot({state: 'rest', working: true, follow: false})
      const parts = harness.buildStage()
      service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      service.mountEffect('binary', harness.mascot.binaryEffect)
      harness.advanceBy(0.7)
      const mounted = harness.emitters().length
      service.unmountEffect('binary')
      harness.advanceBy(0.12)
      const draining = harness.emitters().length
      service.destroy()
      const immediate = harness.emitters().length
      harness.advanceBy(0.9)
      const later = harness.emitters().length
      parts.root.remove()
      return {mounted, draining, immediate, later}
    })

    expect(result.mounted, 'the effect was live before unmounting').toBe(1)
    expect(result.draining, 'unmounting drains rather than hard-cutting the effect').toBe(1)
    expect(result.immediate, 'destroy removes the draining effect immediately').toBe(0)
    expect(result.later, 'no draining effect resurrects after destroy').toBe(0)
  })

  test('unmounting an effect during its staged exit drains once and never double-removes', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.mountEffect('counted', harness.countingEffect)
      harness.advanceBy(0.2)
      const live = harness.countingEffectTotals()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.2)
      const midExit = harness.countingEffectTotals()
      window.service.unmountEffect('counted')
      harness.advanceBy(0.8)
      const drained = harness.countingEffectTotals()
      window.service.destroy()
      return {live, midExit, drained, disposed: harness.countingEffectTotals()}
    })

    expect(result.live.live, 'the mounted effect is live while working').toBe(1)
    expect(result.midExit.live, 'the unmount really lands inside the staged exit window').toBe(1)
    expect(result.midExit.stops, 'the falling edge asks the handle to stop once').toBe(1)
    expect(result.drained.live, 'the staged exit sweeps the effect node').toBe(0)
    expect(result.drained.removes, 'the drained handle is removed exactly once').toBe(1)
    expect(result.disposed.removes, 'dispose never re-removes a handle that already drained').toBe(1)
    expect(result.disposed.stops, 'a handle already exiting is never asked to stop a second time').toBe(1)
  })

  test('restarting an effect during its staged exit leaves it drainable on the next falling edge', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.mountEffect('counted', harness.countingEffect)
      harness.advanceBy(0.2)
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.2)
      const midExit = harness.countingEffectTotals()
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.2)
      const restarted = harness.countingEffectTotals()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.8)
      return {midExit, restarted, drained: harness.countingEffectTotals()}
    })

    expect(result.midExit.live, 'the restart really lands inside the staged exit window').toBe(1)
    expect(result.restarted.starts, 'the restart reuses the handle rather than mounting a second one').toBe(2)
    expect(result.restarted.live, 'the restarted effect is live again').toBe(1)
    expect(result.drained.stops, 'the second falling edge really asks the restarted handle to stop').toBe(2)
    expect(result.drained.live, 'the second falling edge drains the restarted effect').toBe(0)
    expect(result.drained.rests, 'the completed drain rests the still-mounted handle exactly once').toBe(1)
    expect(result.drained.removes, 'a still-mounted handle is never removed by its own drain').toBe(0)
  })

  test('a custom skin drives the layer art and the emitter scale reference', async ({page}) => {
    const result = await page.evaluate(
      ({image, referenceAntennaPx, antennaPx}) => {
        const harness = window.mascotHarness
        const skin = {
          ...harness.mascot.robotSkin,
          layers: {head: image, eyes: image, antenna: image},
          referenceAntennaPx,
        }
        const service = harness.mascot.createMascot({state: 'rest', working: true, follow: false}, skin)
        const parts = harness.buildStage(antennaPx)
        const headBackground = service.connect().getHeadProps().style['background-image']
        service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
        service.mountEffect('binary', harness.mascot.binaryEffect)
        harness.advanceBy(0.7)
        const geometry = harness.emitterGeometry(harness.requireEmitter())
        service.destroy()
        parts.root.remove()
        return {headBackground, geometry}
      },
      {image: CUSTOM_LAYER_IMAGE, referenceAntennaPx: CUSTOM_REFERENCE_ANTENNA_PX, antennaPx: FAB_ANTENNA_PX},
    )
    const factor = FAB_ANTENNA_PX / CUSTOM_REFERENCE_ANTENNA_PX

    expect(result.headBackground, 'connect() reads the head layer art from the skin').toBe(
      `url('${CUSTOM_LAYER_IMAGE}')`,
    )
    expectNear('the effect reads the skin off the core-supplied context', result.geometry.fontSizePx, 9 * factor, 0.05)
    expectNear('the skin reference antenna scales the leading lane', result.geometry.leadingLeft, -1 * factor, 0.05)
    expectNear('the skin reference antenna scales the digit top', result.geometry.top, -12 * factor, 0.05)
  })

  test('an effect that refuses to mount is skipped and never takes the other effects down with it', async ({page}) => {
    await buildBareService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.mountEffect('boom', harness.failingEffect)
      window.service.mountEffect('binary', harness.mascot.binaryEffect)
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      const working = harness.emitters().length
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.9)
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      return {working, resumed: harness.emitters().length, digits: harness.requireEmitter().childElementCount}
    })

    expect(result.working, 'the healthy emitter still mounts behind the broken one').toBe(1)
    expect(result.resumed, 'a later work turn still starts the healthy emitter').toBe(1)
    expect(result.digits, 'the healthy emitter is fully built').toBe(5)
  })
})

test.describe('emitter scale', () => {
  const TRIPLE_ANTENNA_PX = PRODUCT_FAB_ANTENNA_PX * 3

  const SITE_FAB_BUTTON_PX = 56

  const SITE_FAB_LAYER_INSET_PX = 6

  const RISE_SAMPLE_S = 2.6

  type Reading = {fontSizePx: number; leadingLeft: number; trailingLeft: number; top: number; risePx: number}

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
    await installManualClock(page)
  })

  const readEmitterGeometry = (page: Page): Promise<Reading> =>
    page.evaluate((sampleSeconds) => {
      const harness = window.mascotHarness
      const emitter = harness.requireEmitter()
      const leading = harness.requireParticle(emitter, 0)
      const rise = harness.stepFrames(() => harness.property(leading, 'y'), sampleSeconds)
      return {...harness.emitterGeometry(emitter), risePx: harness.summarize(rise).min}
    }, RISE_SAMPLE_S)

  function assertGeometry(label: string, reading: Reading, antennaBoxPx: number, tolerance: number): void {
    const expected = expectedEmitterGeometry(antennaBoxPx)
    expectNear(`${label}: digit font size`, reading.fontSizePx, expected.fontSizePx, tolerance)
    expectNear(`${label}: leading lane offset`, reading.leadingLeft, expected.leadingLeft, tolerance)
    expectNear(`${label}: trailing lane offset`, reading.trailingLeft, expected.trailingLeft, tolerance)
    expectNear(`${label}: digit placement top`, reading.top, expected.top, tolerance)
    expectNear(`${label}: rise distance`, reading.risePx, expected.risePx, tolerance)
  }

  test('the widget FAB, whose antenna fills its 44px stage, keeps the approved emitter geometry', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false}, PRODUCT_FAB_ANTENNA_PX)
    const reading = await readEmitterGeometry(page)

    assertGeometry('the widget FAB', reading, PRODUCT_FAB_ANTENNA_PX, 0.5)
  })

  test('the site FAB, whose 44px antenna is inset in a 56px button, keeps the approved emitter geometry', async ({
    page,
  }) => {
    await buildService(page, {state: 'rest', working: true, follow: false}, SITE_FAB_BUTTON_PX, SITE_FAB_LAYER_INSET_PX)
    const reading = await readEmitterGeometry(page)

    assertGeometry('the site FAB', reading, PRODUCT_FAB_ANTENNA_PX, 0.5)
  })

  test('an antenna three times the FAB size scales every emitter distance by three', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false}, TRIPLE_ANTENNA_PX)
    const reading = await readEmitterGeometry(page)

    assertGeometry('a 132px antenna', reading, TRIPLE_ANTENNA_PX, 1.5)
  })
})

test.describe('gaze', () => {
  const INSET_STAGE_PX = 56

  const INSET_LAYER_PX = 6

  const ANTENNA_ORIGIN_FRACTION_Y = 0.328

  const POINTER_REACH_PX = 300

  const GAZE_SETTLE_MS = 250

  const GAZE_TRAVEL_MS = 1400

  const SATURATING_REACH_PX = 400

  async function openFollowingService(page: Page): Promise<StagePoint> {
    return buildService(page, {state: 'rest', working: false, follow: true})
  }

  async function saturateGaze(page: Page): Promise<StagePoint> {
    const center = await openFollowingService(page)
    await page.mouse.move(center.x + SATURATING_REACH_PX, center.y)
    await settle(page, GAZE_TRAVEL_MS)
    return center
  }

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  test('the resting follow state tracks the pointer with a saturating, mirrored falloff', async ({page}) => {
    const center = await saturateGaze(page)
    const right = await readGaze(page)
    await page.mouse.move(center.x - 400, center.y)
    await settle(page, 1400)
    const left = await readGaze(page)
    await page.mouse.move(center.x + 110, center.y)
    await settle(page, 1400)
    const half = await readGaze(page)
    const ratio = half.eyesX / 3

    expectNear('saturated eyes x = +3px', right.eyesX, 3, 0.05)
    expectNear('saturated lean = +10deg', right.lean, 10, 0.1)
    expectNear('mirrored eyes x = -3px', left.eyesX, -3, 0.05)
    expectNear('mirrored lean = -10deg', left.lean, -10, 0.1)
    expectNear('110px of the 220px falloff is exactly half reach, with no self-feeding', ratio, 0.5, 0.005)
  })

  test('the awake state lands its pose and disarms the gaze listener', async ({page}) => {
    await openFollowingService(page)
    const pose = await page.evaluate(async () => {
      const harness = window.mascotHarness
      window.service.update({state: 'awake', working: false, follow: false})
      await harness.wait(1200)
      return {
        headY: harness.property(window.parts.head, 'yPercent'),
        eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
        antennaRotation: harness.property(window.parts.antenna, 'rotation'),
        listeners: window.pointerMoveListenerCount,
      }
    })

    expectNear('awake head yPercent = -2', pose.headY, -2, 0.01)
    expectNear('awake eyes scaleY = 1.06', pose.eyesScaleY, 1.06, 0.01)
    expectNear('awake antenna rotation = -4deg', pose.antennaRotation, -4, 0.01)
    expect(pose.listeners, 'awake without follow disarms the gaze listener').toBe(0)
  })

  test('follow {eyes} tracks the pointer with the eyes while the antenna stays still', async ({page}) => {
    const center = await buildService(page, {state: 'rest', working: false, follow: {eyes: true, antenna: false}})
    await page.mouse.move(center.x + 400, center.y)
    await settle(page, 1400)
    const tracking = await readGaze(page)
    const listeners = await page.evaluate(() => window.pointerMoveListenerCount)

    expectNear('the eyes channel saturates at 3px', tracking.eyesX, 3, 0.05)
    expectNear('the antenna channel stays still', tracking.lean, 0, 0.001)
    expect(listeners, 'one listener drives the armed channel').toBe(1)
  })

  test('follow {antenna} leans the antenna while the eyes stay still', async ({page}) => {
    const center = await buildService(page, {state: 'rest', working: false, follow: {eyes: false, antenna: true}})
    await page.mouse.move(center.x + 400, center.y)
    await settle(page, 1400)
    const tracking = await readGaze(page)
    const disarmed = await page.evaluate(async () => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: false, follow: {eyes: false, antenna: false}})
      await harness.wait(900)
      return {
        lean: harness.property(window.parts.antenna.parentElement, 'rotation'),
        listeners: window.pointerMoveListenerCount,
      }
    })

    expectNear('the antenna channel saturates at 10deg', tracking.lean, 10, 0.1)
    expect(
      Math.abs(tracking.eyesX) <= 0.001 && Math.abs(tracking.eyesY) <= 0.001,
      `the eyes channel stays still -> ${JSON.stringify(tracking)}`,
    ).toBe(true)
    expectNear('dropping every channel settles the lean to zero', disarmed.lean, 0, 0.001)
    expect(disarmed.listeners, 'dropping every channel detaches the listener').toBe(0)
  })

  test('narrowing follow to one channel returns the dropped channel to zero', async ({page}) => {
    await saturateGaze(page)
    const both = await readGaze(page)
    const narrowed = await page.evaluate(async () => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: false, follow: {eyes: true, antenna: false}})
      await harness.wait(900)
      return {
        eyesX: harness.property(window.parts.eyes, 'x'),
        lean: harness.property(window.parts.antenna.parentElement, 'rotation'),
        listeners: window.pointerMoveListenerCount,
      }
    })

    expectNear('both channels tracked before narrowing', both.lean, 10, 0.1)
    expectNear('the dropped antenna channel returns to zero', narrowed.lean, 0, 0.001)
    expectNear('the kept eyes channel holds its tracking', narrowed.eyesX, 3, 0.05)
    expect(narrowed.listeners, 'narrowing keeps exactly one listener').toBe(1)
  })

  test('a pointer move while the eyes have no box leaves the gaze live once the box returns', async ({page}) => {
    const center = await openFollowingService(page)
    await page.evaluate(() => window.mascotHarness.applyStyle(window.parts.eyes, {display: 'none'}))
    await page.mouse.move(center.x + 400, center.y)
    await settle(page, 300)
    const blind = await readGaze(page)
    await page.evaluate(() => window.mascotHarness.applyStyle(window.parts.eyes, {display: ''}))
    await page.mouse.move(center.x + 400, center.y + 1)
    await settle(page, 1400)
    const restored = await readGaze(page)

    expectNear('a boxless mascot aims nowhere', blind.eyesX, 0, 0.001)
    expectNear('the gaze saturates once the eyes have a box again', restored.eyesX, 3, 0.05)
  })

  test('scrolling the page re-measures the eye box instead of aiming at the stale viewport center', async ({page}) => {
    const center = await openFollowingService(page)
    await page.evaluate(() => {
      const spacer = document.createElement('div')
      spacer.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:4000px'
      document.body.append(spacer)
    })
    await page.mouse.move(center.x + 400, center.y)
    await settle(page, 1400)
    const before = await readGaze(page)
    const scrolled = await page.evaluate(() => {
      window.scrollTo(0, 300)
      return {offset: window.scrollY, center: window.mascotHarness.stageCenter(window.parts.root)}
    })
    await page.mouse.move(scrolled.center.x, scrolled.center.y)
    await settle(page, 1400)
    const recentred = await readGaze(page)

    expect(scrolled.offset, 'the page really scrolled').toBe(300)
    expectNear('the gaze saturated before the scroll', before.eyesX, 3, 0.05)
    expect(
      Math.abs(recentred.eyesX) <= 0.05 && Math.abs(recentred.eyesY) <= 0.05,
      `a pointer on the scrolled eye centre aims nowhere: ${JSON.stringify(recentred)}`,
    ).toBe(true)
  })

  test('follow arms, disarms and settles without leaking pointermove listeners', async ({page}) => {
    const center = await saturateGaze(page)
    const saturated = await readGaze(page)
    await page.mouse.move(center.x + 110, center.y)
    await settle(page, 1400)
    const half = await readGaze(page)
    const cycles = await page.evaluate(async () => {
      const harness = window.mascotHarness
      const counts: number[] = []
      for (let round = 0; round < 5; round += 1) {
        window.service.update({state: 'rest', working: false, follow: false})
        await harness.wait(60)
        counts.push(window.pointerMoveListenerCount)
        window.service.update({state: 'rest', working: false, follow: true})
        await harness.wait(60)
        counts.push(window.pointerMoveListenerCount)
      }
      return {
        disarmed: counts.filter((_value, index) => index % 2 === 0),
        armed: counts.filter((_value, index) => index % 2 === 1),
      }
    })
    await page.mouse.move(center.x + 400, center.y)
    await settle(page, 900)
    const settled = await page.evaluate(async () => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: false, follow: false})
      await harness.wait(900)
      return {
        eyesX: harness.property(window.parts.eyes, 'x'),
        eyesY: harness.property(window.parts.eyes, 'y'),
        lean: harness.property(window.parts.antenna.parentElement, 'rotation'),
        listeners: window.pointerMoveListenerCount,
      }
    })
    const ratio = half.eyesX / 3

    expectNear('gaze saturates at 3px beyond the falloff', saturated.eyesX, 3, 0.05)
    expectNear('lean saturates at 10deg beyond the falloff', saturated.lean, 10, 0.1)
    expectNear('110px of the 220px falloff is exactly half reach, with no self-feeding', ratio, 0.5, 0.005)
    expect(cycles.armed, 'listener count never exceeds one while armed').toEqual([1, 1, 1, 1, 1])
    expect(cycles.disarmed, 'listener count returns to zero while disarmed').toEqual([0, 0, 0, 0, 0])
    expect(
      Math.abs(settled.eyesX) <= 0.001 && Math.abs(settled.eyesY) <= 0.001,
      `animated disarm settles the eyes to zero: ${JSON.stringify(settled)}`,
    ).toBe(true)
    expectNear('animated disarm settles the lean to zero', settled.lean, 0, 0.001)
    expect(settled.listeners, 'animated disarm detaches the listener').toBe(0)
  })

  test('a lean armed on a collapsed antenna re-measures its pivot once the antenna has a real box', async ({page}) => {
    const center = await buildService(
      page,
      {state: 'rest', working: false, follow: false},
      INSET_STAGE_PX,
      INSET_LAYER_PX,
    )
    await page.evaluate(() => {
      window.mascotHarness.applyStyle(window.parts.antenna, {display: 'none'})
      window.service.update({state: 'rest', working: false, follow: true})
    })
    const collapsed = await page.evaluate(() => ({
      antennaPx: window.parts.antenna.offsetWidth,
      origin: window.mascotHarness.transformOriginOf(window.mascotHarness.requireLeanWrapper()),
    }))
    await page.evaluate(() => window.mascotHarness.applyStyle(window.parts.antenna, {display: 'block'}))
    await page.mouse.move(center.x + POINTER_REACH_PX, center.y)
    await settle(page, GAZE_SETTLE_MS)
    const restored = await page.evaluate(() => ({
      antennaPx: window.parts.antenna.offsetWidth,
      inset: window.parts.antenna.offsetLeft,
      origin: window.mascotHarness.transformOriginOf(window.mascotHarness.requireLeanWrapper()),
      lean: window.mascotHarness.property(window.parts.antenna.parentElement, 'rotation'),
    }))
    const pivotY = Number.parseFloat(restored.origin.split(' ')[1] ?? '')
    const antennaPivotY = restored.inset + restored.antennaPx * ANTENNA_ORIGIN_FRACTION_Y

    expect(collapsed.antennaPx, 'the lean really armed while the antenna had no box').toBe(0)
    expect(restored.antennaPx, 'the antenna really got its box back').toBeGreaterThan(0)
    expect(Math.abs(restored.lean), 'the restored antenna really leans at the pointer').toBeGreaterThan(1)
    expectNear('the lean pivots on the antenna origin, not the stage-percentage fallback', pivotY, antennaPivotY, 0.2)
  })
})

test.describe('lifecycle', () => {
  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
    await installManualClock(page)
  })

  test('a state change mid-work keeps the original timeline, emitter and scale', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.advanceBy(2.2)
      const emitter = harness.requireEmitter()
      const anchorBefore = harness.particleFlightOf(emitter, 0)
      const timelineBefore = harness.repeatingTimeline()
      window.service.update({state: 'awake', working: true, follow: false})
      const during = harness.stepFrames(() => harness.property(emitter, 'scale'), 0.9)
      harness.advanceBy(1.4)
      const anchorAfter = harness.particleFlightOf(emitter, 0)
      const sameTimeline = harness.repeatingTimeline() === timelineBefore
      const values = harness.stepFrames<[number, number]>(
        () => [harness.property(window.parts.antenna, 'scaleY'), harness.property(window.parts.eyes, 'scaleY')],
        2.4,
      )
      return {
        antenna: harness.summarize(values.map((entry) => entry[0])),
        eyes: harness.summarize(values.map((entry) => entry[1])),
        emitterScale: harness.summarize(during),
        sameTimeline,
        sameEmitter: harness.emitters()[0] === emitter,
        emitters: harness.emitters().length,
        anchorBefore,
        anchorAfter,
      }
    })
    const anchorShift = Math.abs(result.anchorAfter.left - result.anchorBefore.left)

    expectNear('throb still peaks at 1.3 after the change', result.antenna.max, 1.3, 0.01)
    expect(result.antenna.min, 'throb still oscillates after the change').toBeLessThan(1.2)
    expect(result.eyes.min, 'blink still closes the eyes').toBeLessThan(0.5)
    expectNear('blink returns to the awake 1.06', result.eyes.max, 1.06, 0.01)
    expect(result.sameTimeline, 'the mid-work change keeps the ORIGINAL work timeline running').toBe(true)
    expect(result.sameEmitter, 'the mid-work change keeps the same emitter node').toBe(true)
    expect(result.emitters, 'the mid-work change leaves exactly one emitter').toBe(1)
    expect(
      Math.abs(result.emitterScale.min - 1) <= 0.001 && Math.abs(result.emitterScale.max - 1) <= 0.001,
      `no returnToFull tween fires: emitter scale stays 1 across the change -> ${JSON.stringify(result.emitterScale)}`,
    ).toBe(true)
    expect(anchorShift, 'digits launched after the change leave from the leaned antenna tip').toBeGreaterThan(0.5)
  })

  test('leaving work for the open pose raises the eyes monotonically to their awake rest', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.advanceTo(2.2)
      const openedEyes = harness.property(window.parts.eyes, 'scaleY')
      window.service.update({state: 'awake', working: false, follow: false})
      const values = harness.stepFrames(() => harness.property(window.parts.eyes, 'scaleY'), 1.1)
      return {openedEyes, series: harness.summarize(values), reversals: harness.reversals(values, 0.002)}
    })

    expectNear('the blink is fully open at the beat the pose change starts from', result.openedEyes, 1, 0.001)
    expectNear('work to open settles at 1.06', result.series.last, 1.06, 0.01)
    expect(result.series.min, 'work to open never dips below 1.0').toBeGreaterThanOrEqual(0.999)
    expect(result.reversals, 'work to open rises monotonically').toBeLessThanOrEqual(1)
  })

  test('stopping work restores the neutral antenna and the eye rest of the current state', async ({page}) => {
    await buildService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const settleReading = () => {
        harness.advanceBy(0.25)
        return {
          antennaScaleX: harness.property(window.parts.antenna, 'scaleX'),
          antennaScaleY: harness.property(window.parts.antenna, 'scaleY'),
          eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
        }
      }
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(2.2)
      window.service.update({state: 'rest', working: false, follow: false})
      const rest = settleReading()
      window.service.update({state: 'awake', working: false, follow: false})
      harness.advanceBy(0.9)
      window.service.update({state: 'awake', working: true, follow: false})
      harness.advanceBy(2.2)
      window.service.update({state: 'awake', working: false, follow: false})
      const awake = settleReading()
      return {rest, awake}
    })

    expectNear('rest recovery antenna scaleX = 1', result.rest.antennaScaleX, 1, 0.001)
    expectNear('rest recovery antenna scaleY = 1', result.rest.antennaScaleY, 1, 0.001)
    expectNear('rest recovery eyes scaleY = 1', result.rest.eyesScaleY, 1, 0.001)
    expectNear('awake recovery antenna scaleX = 1', result.awake.antennaScaleX, 1, 0.001)
    expectNear('awake recovery antenna scaleY = 1', result.awake.antennaScaleY, 1, 0.001)
    expectNear('awake recovery eyes scaleY = 1.06', result.awake.eyesScaleY, 1.06, 0.001)
  })

  test('leaving work for a new pose hands every shared channel to the pose transition', async ({page}) => {
    await buildService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {head, eyes, antenna} = window.parts
      const landed = () => ({
        headY: harness.property(head, 'yPercent'),
        headRotation: harness.property(head, 'rotation'),
        eyesScaleY: harness.property(eyes, 'scaleY'),
        eyesScaleX: harness.property(eyes, 'scaleX'),
        antennaRotation: harness.property(antenna, 'rotation'),
        antennaScaleX: harness.property(antenna, 'scaleX'),
        antennaScaleY: harness.property(antenna, 'scaleY'),
      })
      const writers = (): [number, number, number, number] => [
        harness.activeWritersOf(head),
        harness.activeWritersOfProperty(eyes, 'scaleY'),
        harness.activeWritersOfProperty(eyes, 'scaleX'),
        harness.activeWritersOfProperty(eyes, 'yPercent'),
      ]
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(1.3)
      window.service.update({state: 'awake', working: false, follow: false})
      const anticipationWriters = harness.stepFrames(writers, 0.08)
      const anticipationHeadY = harness.property(head, 'yPercent')
      const stretchWriters = harness.stepFrames(writers, 0.2)
      const stretchHeadY = harness.property(head, 'yPercent')
      const handoff = [...anticipationWriters, ...stretchWriters]
      harness.advanceBy(1)
      const awake = landed()
      window.service.update({state: 'awake', working: true, follow: false})
      harness.advanceBy(1.3)
      window.service.update({state: 'rest', working: false, follow: false})
      const toRest = harness.stepFrames(() => harness.property(head, 'yPercent'), 1.2)
      return {
        awake,
        rest: landed(),
        writers: {
          head: harness.summarize(handoff.map((entry) => entry[0])),
          eyesScaleY: harness.summarize(handoff.map((entry) => entry[1])),
          eyesScaleX: harness.summarize(handoff.map((entry) => entry[2])),
          eyesYPercent: harness.summarize(handoff.map((entry) => entry[3])),
        },
        anticipationHeadY,
        stretchHeadY,
        restHead: harness.reversals(toRest, 0.02),
      }
    })

    expectNear('work to awake lands the head on the awake pose', result.awake.headY, -2, 0.001)
    expectNear('work to awake lands the head rotation', result.awake.headRotation, 0, 0.001)
    expectNear('work to awake lands the eyes on the awake rest', result.awake.eyesScaleY, 1.06, 0.001)
    expectNear('work to awake lands the eyes scaleX', result.awake.eyesScaleX, 1, 0.001)
    expectNear('work to awake lands the antenna rotation', result.awake.antennaRotation, -4, 0.001)
    expectNear('work to awake restores the antenna scaleX', result.awake.antennaScaleX, 1, 0.001)
    expectNear('work to awake restores the antenna scaleY', result.awake.antennaScaleY, 1, 0.001)
    expectNear('work to rest lands the head on the rest pose', result.rest.headY, 0, 0.001)
    expectNear('work to rest lands the eyes on the rest scale', result.rest.eyesScaleY, 1, 0.001)
    expectNear('work to rest lands the antenna rotation', result.rest.antennaRotation, 0, 0.001)
    expectNear('work to rest restores the antenna scaleX', result.rest.antennaScaleX, 1, 0.001)
    expectNear('work to rest restores the antenna scaleY', result.rest.antennaScaleY, 1, 0.001)
    expect(result.writers.head.max, 'exactly one animation writes the head across the handoff').toBe(1)
    expect(result.writers.eyesScaleY.max, 'exactly one animation writes the eyes scaleY across the handoff').toBe(1)
    expect(result.writers.eyesScaleX.max, 'exactly one animation writes the eyes scaleX across the handoff').toBe(1)
    expect(result.writers.eyesYPercent.max, 'exactly one animation writes the eyes yPercent across the handoff').toBe(1)
    expect(result.anticipationHeadY, 'only the awake anticipation drives the head positive').toBeGreaterThan(3)
    expect(result.stretchHeadY, 'only the awake stretch drives the head past the -5 bob floor').toBeLessThan(-6)
    expect(result.restHead, 'no recovery tween fights the rest pose on the head').toBeLessThanOrEqual(1)
  })

  test('a state change while working overlaps the pose and the bob, then converges on the bob', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {head, eyes, antenna} = window.parts
      const writers = (): [number, number, number] => [
        harness.activeWritersOfProperty(head, 'yPercent'),
        harness.activeWritersOfProperty(antenna, 'yPercent'),
        harness.activeWritersOfProperty(eyes, 'yPercent'),
      ]
      const spread = (values: [number, number, number][]) => ({
        head: harness.summarize(values.map((entry) => entry[0])),
        antenna: harness.summarize(values.map((entry) => entry[1])),
        eyes: harness.summarize(values.map((entry) => entry[2])),
      })
      harness.advanceBy(2.2)
      const beforeChange = writers()
      window.service.update({state: 'awake', working: true, follow: false})
      const handoff = harness.stepFrames<[number, number, number]>(writers, 0.7)
      const settled = harness.stepFrames<[number, number, number]>(writers, 1.7)
      return {beforeChange, handoff: spread(handoff), settled: spread(settled)}
    })

    expect(result.beforeChange, 'the bob alone writes yPercent before the change').toEqual([1, 1, 1])
    expect(result.handoff.head.max, 'the accepted pose-over-bob overlap on the head is two writers').toBe(2)
    expect(result.handoff.antenna.max, 'the accepted pose-over-bob overlap on the antenna is two writers').toBe(2)
    expect(result.handoff.eyes.max, 'the accepted pose-over-bob overlap on the eyes is two writers').toBe(2)
    expect(result.settled.head.max, 'the overlap converges back to the bob alone on the head').toBe(1)
    expect(result.settled.antenna.max, 'the overlap converges back to the bob alone on the antenna').toBe(1)
    expect(result.settled.eyes.max, 'the overlap converges back to the bob alone on the eyes').toBe(1)
  })

  test('the awake pose lifts the head, the antenna and the eyes as one unit', async ({page}) => {
    await buildService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const {head, eyes, antenna} = window.parts
      const readLayers = (): [number, number, number] => [
        harness.property(head, 'yPercent'),
        harness.property(antenna, 'yPercent'),
        harness.property(eyes, 'yPercent'),
      ]
      const spread = (values: [number, number, number][]) =>
        harness.summarize(
          values.map(([headY, antennaY, eyesY]) => Math.max(Math.abs(antennaY - headY), Math.abs(eyesY - headY))),
        )
      const rest = readLayers()
      window.service.update({state: 'awake', working: false, follow: false})
      const transition = harness.stepFrames<[number, number, number]>(readLayers, 0.9)
      const awake = readLayers()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.9)
      return {rest, awake, back: readLayers(), spread: spread(transition)}
    })

    expectNear('the rest pose parks the head at yPercent 0', result.rest[0], 0, 0.001)
    expectNear('the rest pose parks the antenna at yPercent 0', result.rest[1], 0, 0.001)
    expectNear('the rest pose parks the eyes at yPercent 0', result.rest[2], 0, 0.001)
    expectNear('the awake pose lifts the head to yPercent -2', result.awake[0], -2, 0.001)
    expectNear('the awake pose lifts the antenna to the head yPercent -2', result.awake[1], -2, 0.001)
    expectNear('the awake pose lifts the eyes to the head yPercent -2', result.awake[2], -2, 0.001)
    expect(result.spread.max, 'the awake pose never separates the antenna or eyes from the head').toBeLessThan(0.001)
    expectNear('the rest pose drops the antenna back to yPercent 0', result.back[1], 0, 0.001)
    expectNear('the rest pose drops the eyes back to yPercent 0', result.back[2], 0, 0.001)
  })

  test('a mid-work state change re-centers the head bob on the new pose value', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const bobRange = () =>
        harness.summarize(harness.stepFrames(() => harness.property(window.parts.head, 'yPercent'), 2.4))
      harness.advanceBy(2.2)
      const restBob = bobRange()
      window.service.update({state: 'awake', working: true, follow: false})
      harness.advanceBy(2.4)
      const awakeBob = bobRange()
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(2.4)
      return {restBob, awakeBob, backToRestBob: bobRange()}
    })

    expectNear('the rest bob rides between 0 and -5', result.restBob.max, 0, 0.05)
    expectNear('the rest bob reaches -5', result.restBob.min, -5, 0.05)
    expectNear('the bob re-centers on the awake head value', result.awakeBob.max, -2, 0.05)
    expectNear('the awake bob still reaches -5', result.awakeBob.min, -5, 0.05)
    expectNear('the bob re-centers back on the rest head value', result.backToRestBob.max, 0, 0.05)
  })

  test('restarting work during the staged exit reuses the draining emitter', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.advanceBy(0.9)
      const before = harness.requireEmitter()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.2)
      const midExitOpacity = harness.property(before, 'opacity')
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      return {
        sameNode: harness.emitters()[0] === before,
        midExitOpacity,
        opacity: harness.property(before, 'opacity'),
        emitters: harness.emitters().length,
      }
    })

    expect(result.sameNode, 'restart during exit reuses the emitter node').toBe(true)
    expectNear('the restart lands 0.2s into the 0.5s staged exit', result.midExitOpacity, 0.936, 0.001)
    expectNear('restart during exit returns opacity to 1', result.opacity, 1, 0.001)
    expect(result.emitters, 'restart during exit leaves exactly one emitter').toBe(1)
  })

  test('a completed drain rests the effect and the next work turn reuses the same emitter node', async ({page}) => {
    await buildService(page, {state: 'rest', working: false, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      const first = harness.requireEmitter()
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.9)
      const drained = harness.emitters().length
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      return {
        drained,
        sameNode: harness.emitters()[0] === first,
        emitters: harness.emitters().length,
        opacity: harness.property(first, 'opacity'),
      }
    })

    expect(result.drained, 'the completed drain leaves no emitter in the stage').toBe(0)
    expect(result.sameNode, 'the next work turn reuses the rested emitter node').toBe(true)
    expect(result.emitters, 'the reused emitter is the only one in the stage').toBe(1)
    expectNear('the reused emitter re-enters at full opacity', result.opacity, 1, 0.001)
  })

  test('destroying during the staged exit tears everything down and nothing resurrects', async ({page}) => {
    await buildService(page, {state: 'rest', working: true, follow: false})
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      harness.advanceBy(0.9)
      window.service.update({state: 'rest', working: false, follow: false})
      harness.advanceBy(0.2)
      const midExit = harness.emitters().length
      window.service.destroy()
      const immediate = {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}
      harness.advanceBy(0.9)
      return {midExit, immediate, later: {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}}
    })

    expect(result.midExit, 'the destroy really lands inside the exit window').toBe(1)
    expect(result.immediate.emitters, 'destroy removes every emitter immediately').toBe(0)
    expect(result.immediate.wrappers, 'destroy removes every lean wrapper immediately').toBe(0)
    expect(result.later.emitters, 'no emitter resurrects after the exit window').toBe(0)
    expect(result.later.wrappers, 'no wrapper resurrects after the exit window').toBe(0)
  })
})

test.describe('reduced motion', () => {
  test.use({contextOptions: {reducedMotion: 'reduce'}})

  test('reduced motion lands poses instantly and starts no gaze or emitter', async ({page}) => {
    await openMascotPage(page)
    await buildService(page, {state: 'rest', working: false, follow: true})
    const result = await page.evaluate(async () => {
      const harness = window.mascotHarness
      window.service.update({state: 'awake', working: false, follow: true})
      const instant = {
        headY: harness.property(window.parts.head, 'yPercent'),
        eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
        antennaRotation: harness.property(window.parts.antenna, 'rotation'),
      }
      window.service.update({state: 'awake', working: true, follow: true})
      await harness.wait(700)
      return {
        instant,
        listeners: window.pointerMoveListenerCount,
        emitters: harness.emitters().length,
        tweens: harness.globalTweenCount(),
      }
    })

    expectNear('reduced motion lands the head pose instantly', result.instant.headY, -2, 0.001)
    expectNear('reduced motion lands the eyes pose instantly', result.instant.eyesScaleY, 1.06, 0.001)
    expectNear('reduced motion lands the antenna pose instantly', result.instant.antennaRotation, -4, 0.001)
    expect(result.listeners, 'reduced motion attaches no pointermove listener').toBe(0)
    expect(result.emitters, 'reduced motion emits no binary effect').toBe(0)
    expect(result.tweens, 'reduced motion leaves no tween running, not even a tip tracker').toBe(0)
  })
})

test.describe('registration', () => {
  type RequiredSlot = 'getRootProps' | 'getHeadProps' | 'getEyesProps' | 'getAntennaProps'

  type TeardownReading = {
    slot: RequiredSlot
    armed: {wrappers: number; listeners: number}
    wrappers: number
    listeners: number
    antennaRestored: boolean
  }

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  test('connect() hands back stable refs and rebinding never duplicates the rig', async ({page}) => {
    await installManualClock(page)
    const result = await page.evaluate(() => {
      const harness = window.mascotHarness
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
      const first = service.connect()
      const second = service.connect()
      const names: RequiredSlot[] = ['getRootProps', 'getHeadProps', 'getEyesProps', 'getAntennaProps']
      const effectHostEarlier = first.getEffectHostProps('binary').ref
      const effectHostLater = first.getEffectHostProps('binary').ref
      const sameGetterTwice =
        names.every((name) => {
          const earlier = first[name]().ref
          const later = first[name]().ref
          return earlier === later
        }) && effectHostEarlier === effectHostLater
      const sameAcrossConnectCalls =
        names.every((name) => first[name]().ref === second[name]().ref) &&
        first.getEffectHostProps('binary').ref === second.getEffectHostProps('binary').ref
      const parts = harness.buildStage()
      harness.applyStyle(parts.root, first.getRootProps().style)
      harness.applyStyle(parts.head, first.getHeadProps().style)
      harness.applyStyle(parts.eyes, first.getEyesProps().style)
      harness.applyStyle(parts.antenna, first.getAntennaProps().style)
      first.getRootProps().ref(parts.root)
      first.getHeadProps().ref(parts.head)
      first.getEyesProps().ref(parts.eyes)
      first.getAntennaProps().ref(parts.antenna)
      service.mountEffect('binary', harness.mascot.binaryEffect)
      service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.9)
      const emitterBefore = harness.requireEmitter()
      const wrapperBefore = harness.requireLeanWrapper()
      const rebound = service.connect()
      rebound.getRootProps().ref(parts.root)
      rebound.getHeadProps().ref(parts.head)
      rebound.getEyesProps().ref(parts.eyes)
      rebound.getAntennaProps().ref(parts.antenna)
      const values = harness.stepFrames(() => harness.property(parts.antenna, 'scaleY'), 2.2)
      return {
        sameGetterTwice,
        sameAcrossConnectCalls,
        sameEmitterNode: harness.emitters()[0] === emitterBefore,
        sameWrapperNode: harness.requireLeanWrapper() === wrapperBefore,
        emitters: harness.emitters().length,
        wrappers: harness.leanWrappers().length,
        antenna: harness.summarize(values),
      }
    })

    expect(result.sameGetterTwice, 'same ref identity across repeated getter calls').toBe(true)
    expect(result.sameAcrossConnectCalls, 'same ref identity across connect() calls').toBe(true)
    expect(result.sameEmitterNode, 'rebinding keeps the same emitter node').toBe(true)
    expect(result.sameWrapperNode, 'rebinding keeps the same lean wrapper').toBe(true)
    expect(result.emitters, 'exactly one emitter after rebinding').toBe(1)
    expect(result.wrappers, 'exactly one lean wrapper after rebinding').toBe(1)
    expect(
      result.antenna.min < 1.3 && result.antenna.max > 1.29,
      `work timeline survives the rebind -> ${JSON.stringify(result.antenna)}`,
    ).toBe(true)
  })

  test('registerParts is idempotent and re-homes the lean wrapper onto a replacement antenna', async ({page}) => {
    await buildService(page, {state: 'rest', working: false, follow: true})
    const result = await page.evaluate(async () => {
      const harness = window.mascotHarness
      const {root, head, eyes, antenna} = window.parts
      const parts = {stage: root, head, eyes, antenna}
      window.service.registerParts(parts)
      window.service.registerParts(parts)
      const repeated = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
      const replacement = document.createElement('div')
      replacement.style.cssText = antenna.style.cssText
      root.append(replacement)
      window.service.registerParts({stage: root, head, eyes, antenna: replacement})
      await harness.wait(120)
      return {
        repeated,
        wrappers: harness.leanWrappers().length,
        listeners: window.pointerMoveListenerCount,
        oldAntennaRestored: antenna.parentElement === root,
        newAntennaWrapped: harness.requireLeanWrapper() === replacement.parentElement,
      }
    })

    expect(result.repeated.wrappers, 'repeated registerParts keeps one lean wrapper').toBe(1)
    expect(result.repeated.listeners, 'repeated registerParts keeps one listener').toBe(1)
    expect(result.wrappers, 're-registering a new antenna keeps one wrapper').toBe(1)
    expect(result.listeners, 're-registering a new antenna keeps one listener').toBe(1)
    expect(result.oldAntennaRestored, 'the previous antenna is restored to its parent').toBe(true)
    expect(result.newAntennaWrapped, 'the new antenna owns the lean wrapper').toBe(true)
  })

  test('update() before registerParts stores the config and replays it on registration', async ({page}) => {
    const result = await page.evaluate(async () => {
      const harness = window.mascotHarness
      const parts = harness.buildStage()
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
      let threw = false
      try {
        service.update({state: 'awake', working: true, follow: false})
        service.mountEffect('binary', harness.mascot.binaryEffect)
      } catch {
        threw = true
      }
      const beforeRegister = harness.emitters().length
      service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      const headY = harness.property(parts.head, 'yPercent')
      const eyesScaleY = harness.property(parts.eyes, 'scaleY')
      await harness.wait(600)
      return {threw, beforeRegister, headY, eyesScaleY, emitters: harness.emitters().length}
    })

    expect(result.threw, 'update and mountEffect before registerParts do not throw').toBe(false)
    expect(result.beforeRegister, 'update and mountEffect before registerParts start nothing').toBe(0)
    expectNear('stored state applies on registration', result.headY, -2, 0.001)
    expectNear('stored eye pose applies on registration', result.eyesScaleY, 1.06, 0.001)
    expect(result.emitters, 'stored working flag applies on registration').toBe(1)
  })

  test('a partial connect() part set stays inert until the last required ref lands', async ({page}) => {
    const result = await page.evaluate(async () => {
      const harness = window.mascotHarness
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
      const connected = service.connect()
      const root = harness.buildBareStage()
      const head = document.createElement('div')
      const eyes = document.createElement('div')
      const antenna = document.createElement('div')
      root.append(head, eyes, antenna)
      let threw = false
      try {
        connected.getHeadProps().ref(head)
        connected.getEyesProps().ref(eyes)
      } catch {
        threw = true
      }
      const partial = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
      connected.getRootProps().ref(root)
      connected.getAntennaProps().ref(antenna)
      await harness.wait(120)
      return {threw, partial, wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
    })

    expect(result.threw, 'a partial part set does not throw').toBe(false)
    expect(result.partial.wrappers, 'a partial part set does not register').toBe(0)
    expect(result.partial.listeners, 'a partial part set attaches no listener').toBe(0)
    expect(result.wrappers, 'completing the set registers exactly once').toBe(1)
    expect(result.listeners, 'completing the set arms exactly one listener').toBe(1)
  })

  test('releasing any required part tears the rig down and the effectHost owns the emitter', async ({page}) => {
    const result = await page.evaluate(async () => {
      const harness = window.mascotHarness
      const bind = (connected: MascotConnect, parts: StageParts, effectHost: HTMLElement) => {
        connected.getRootProps().ref(parts.root)
        connected.getEffectHostProps('binary').ref(effectHost)
        connected.getHeadProps().ref(parts.head)
        connected.getEyesProps().ref(parts.eyes)
        connected.getAntennaProps().ref(parts.antenna)
      }
      const makeEffectHost = (root: HTMLElement) => {
        const effectHost = document.createElement('div')
        effectHost.style.cssText = 'position:absolute;inset:0;pointer-events:none'
        root.append(effectHost)
        return effectHost
      }
      const slotElements = (parts: StageParts): Record<RequiredSlot, HTMLElement> => ({
        getRootProps: parts.root,
        getHeadProps: parts.head,
        getEyesProps: parts.eyes,
        getAntennaProps: parts.antenna,
      })
      const slots: RequiredSlot[] = ['getRootProps', 'getHeadProps', 'getEyesProps', 'getAntennaProps']
      const torndown: TeardownReading[] = []
      for (const slot of slots) {
        const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
        const connected = service.connect()
        const parts = harness.buildStage()
        bind(connected, parts, makeEffectHost(parts.root))
        const armed = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
        connected[slot]().release(slotElements(parts)[slot])
        torndown.push({
          slot,
          armed,
          wrappers: harness.leanWrappers().length,
          listeners: window.pointerMoveListenerCount,
          antennaRestored: parts.antenna.parentElement === parts.root,
        })
        service.destroy()
        parts.root.remove()
      }
      const service = harness.mascot.createMascot({state: 'rest', working: true, follow: true})
      const connected = service.connect()
      const host = harness.buildBareStage()
      connected.getEffectHostProps('binary').ref(host)
      await harness.wait(200)
      const effectHostAlone = {
        wrappers: harness.leanWrappers().length,
        listeners: window.pointerMoveListenerCount,
        emitters: harness.emitters().length,
      }
      service.destroy()
      host.remove()

      const mounted = harness.mascot.createMascot({state: 'rest', working: true, follow: false})
      const bound = mounted.connect()
      const parts = harness.buildStage()
      const effectHost = makeEffectHost(parts.root)
      bind(bound, parts, effectHost)
      mounted.mountEffect('binary', harness.mascot.binaryEffect)
      await harness.wait(700)
      const emitter = harness.emitters()[0]
      const hosted = {
        emitters: harness.emitters().length,
        parentIsEffectHost: emitter?.parentElement === effectHost,
        anchor: emitter === undefined ? undefined : harness.boxOf(emitter),
        stage: {width: parts.root.offsetWidth, height: parts.root.offsetHeight},
      }
      mounted.destroy()
      parts.root.remove()
      return {torndown, effectHostAlone, hosted}
    })
    const tip = restTip(result.hosted.stage)
    const lifted = tipUnderTransform(result.hosted.stage, 1.3, -5)
    const {anchor} = result.hosted

    expect(
      result.torndown.every((entry) => entry.armed.wrappers === 1 && entry.armed.listeners === 1),
      `each required ref registers before it is nulled -> ${JSON.stringify(result.torndown.map((entry) => entry.armed))}`,
    ).toBe(true)
    expect(
      result.torndown.every((entry) => entry.wrappers === 0),
      'nulling any required ref drops the lean wrapper',
    ).toBe(true)
    expect(
      result.torndown.every((entry) => entry.listeners === 0),
      'nulling any required ref detaches the gaze listener',
    ).toBe(true)
    expect(
      result.torndown.every((entry) => entry.antennaRestored),
      'nulling any required ref restores the antenna to its parent',
    ).toBe(true)
    expect(result.effectHostAlone.wrappers, 'an effectHost alone never registers a wrapper').toBe(0)
    expect(result.effectHostAlone.listeners, 'an effectHost alone never arms a listener').toBe(0)
    expect(result.effectHostAlone.emitters, 'an effectHost alone never starts an emitter').toBe(0)
    expect(result.hosted.emitters, 'a bound effectHost hosts exactly one emitter').toBe(1)
    expect(result.hosted.parentIsEffectHost, 'the emitter mounts inside the effectHost').toBe(true)
    expect(
      anchor !== undefined && Math.abs(anchor.left - tip.x) <= 1,
      `the effect-hosted emitter anchors at the tip x, not the page offset -> ${JSON.stringify(anchor)}`,
    ).toBe(true)
    expect(
      anchor !== undefined && anchor.top <= tip.y + 1 && anchor.top >= lifted.y - 1,
      `the effect-hosted emitter anchors between the resting and the fully bobbed and throbbed tip y, not the page offset -> ${JSON.stringify(
        anchor,
      )}`,
    ).toBe(true)
  })
})

test.describe('stream nozzle', () => {
  type Stream = {
    name: string
    mount: string
    particleCount: number
    startYPx: number
    travelPx: number
    durationS: number
  }

  const STREAMS: Stream[] = [
    {
      name: 'matrix',
      mount: 'matrixEffect',
      particleCount: MATRIX_GLYPHS.length,
      startYPx: MATRIX_DRIP_START_Y_PX,
      travelPx: MATRIX_DRIP_END_Y_PX - MATRIX_DRIP_START_Y_PX,
      durationS: MATRIX_DRIP_DURATION_S,
    },
    {
      name: 'steam',
      mount: 'steamEffect',
      particleCount: PUFF_COUNT,
      startYPx: 0,
      travelPx: PUFF_RISE_Y_PX,
      durationS: PUFF_RISE_DURATION_S,
    },
    {
      name: 'notes',
      mount: 'notesEffect',
      particleCount: NOTE_GLYPHS.length,
      startYPx: 0,
      travelPx: -NOTE_RISE_PX,
      durationS: NOTE_RISE_DURATION_S,
    },
    {
      name: 'pixel-bubbles',
      mount: 'pixelBubblesEffect',
      particleCount: PIXEL_BUBBLES_COUNT,
      startYPx: 0,
      travelPx: PIXEL_BUBBLES_RISE_PX,
      durationS: PIXEL_BUBBLES_RISE_DURATION_S,
    },
  ]

  const RELEASE_CROSSING_S = 3.4

  const RELEASE_WINDOW_S = 0.41

  const THROB_PEAK_SCALE_Y = 1.3

  const THROB_RELEASED_SCALE_Y = 1.05

  const OVERSPEED_ALLOWANCE = 2

  const LAUNCH_FRAME_SLACK_PX = 0.5

  const RELEASED_TIP_TRAVEL_PX = 1

  type Launch = {top: number; tipY: number}

  const columnOf = (frames: readonly number[][], index: number): number[] =>
    frames.map((frame) => frame[index] ?? Number.NaN)

  const at = (values: readonly number[], index: number): number => values[index] ?? Number.NaN

  test.beforeEach(async ({page}) => {
    await openMascotPage(page)
  })

  for (const stream of STREAMS) {
    test(`a ${stream.name} particle in flight holds its world travel through the throb release while later particles launch from the moved tip`, async ({
      page,
    }) => {
      await openStreamService(page, stream.name, stream.mount)
      const sampled = await page.evaluate(
        ({count, releaseAt, seconds}) => {
          const harness = window.mascotHarness
          const {antenna, root} = window.parts
          window.service.update({state: 'rest', working: true, follow: false})
          harness.advanceTo(releaseAt)
          const emitter = harness.requireStreamEmitter(root, count)
          const indexes = Array.from({length: count}, (_, index) => index)
          const frames = harness.stepFrames<number[]>(
            () => [
              ...indexes.map((index) => harness.particleFlightOf(emitter, index).top),
              harness.property(antenna, 'scaleY'),
              harness.property(antenna, 'yPercent'),
            ],
            seconds,
          )
          return {
            frames,
            antennaPx: Math.min(antenna.offsetWidth, antenna.offsetHeight),
            stage: {width: root.offsetWidth, height: root.offsetHeight},
          }
        },
        {count: stream.particleCount, releaseAt: RELEASE_CROSSING_S, seconds: RELEASE_WINDOW_S + stream.durationS},
      )

      const stage: StageSize = sampled.stage
      const factor = scaleFactorOf(sampled.antennaPx)
      const nominalStep = Math.abs(travelPerFrame(stream.travelPx, stream.durationS, sampled.antennaPx))
      const direction = Math.sign(stream.travelPx)
      const releaseFrames = Math.round(RELEASE_WINDOW_S * FRAMES_PER_SECOND) + 1
      const scaleY = columnOf(sampled.frames, stream.particleCount)
      const yPercent = columnOf(sampled.frames, stream.particleCount + 1)
      const particles = Array.from({length: stream.particleCount}, (_, index) => columnOf(sampled.frames, index))
      const releaseScaleY = scaleY.slice(0, releaseFrames)
      const inFlight = particles
        .map((tops) => tops.slice(0, releaseFrames))
        .filter((tops) => launchFrames(tops, stream.travelPx).length === 0)
      const steps = inFlight.flatMap((tops) => stepsBetween(tops).map((step) => step * direction))
      const launches: Launch[] = particles.flatMap((tops) =>
        launchFrames(tops, stream.travelPx).map((frame) => ({
          top: at(tops, frame),
          tipY: tipUnderTransform(stage, at(scaleY, frame), at(yPercent, frame)).y,
        })),
      )
      const launchOffsets = launches.map((launch) => Math.abs(launch.top - launch.tipY - stream.startYPx * factor))
      const launchTipTravel = launches.map((launch) => Math.abs(launch.tipY - restTip(stage).y))

      expectNear(
        'the sampled window really opens on the throb peak',
        Math.max(...releaseScaleY),
        THROB_PEAK_SCALE_Y,
        0.01,
      )
      expect(Math.min(...releaseScaleY), 'the sampled window really releases the throb').toBeLessThan(
        THROB_RELEASED_SCALE_Y,
      )
      expect(
        inFlight.length,
        `at least one ${stream.name} particle stays in flight across the release`,
      ).toBeGreaterThan(0)
      expect(
        Math.min(...steps),
        `every frame carries an in-flight ${stream.name} particle further along its travel, none drags it back: worst step ${Math.min(...steps)}px`,
      ).toBeGreaterThan(0)
      expect(
        Math.max(...steps),
        `no frame outruns the ${nominalStep.toFixed(3)}px nominal ${stream.name} step of a 60Hz frame`,
      ).toBeLessThan(nominalStep * OVERSPEED_ALLOWANCE)
      expect(
        launches.length,
        `at least one ${stream.name} particle starts a cycle inside the sampled window`,
      ).toBeGreaterThan(0)
      expect(
        Math.max(...launchOffsets),
        `every launching ${stream.name} particle starts on the tip of the frame it launches on`,
      ).toBeLessThan(nominalStep * OVERSPEED_ALLOWANCE + LAUNCH_FRAME_SLACK_PX)
      expect(
        Math.max(...launchTipTravel),
        'a launch really happened while the tip had left the resting tip the emitter was built on',
      ).toBeGreaterThan(RELEASED_TIP_TRAVEL_PX)
    })
  }
})

test.describe('visibility', () => {
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
})
