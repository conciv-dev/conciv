import {expect, test} from '@playwright/test'
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
import {FRAMES_PER_SECOND, launchFrames} from './helpers/launches.js'
import {buildService, installManualClock, openMascotPage} from './helpers/mascot-stage.js'
import {expectNear} from './helpers/near.js'

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

test('with every activity channel off a mounted stream still launches from the tip the pose moves', async ({page}) => {
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
