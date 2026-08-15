import {expect, test} from '@playwright/test'
import {
  BLINK_CLOSE_SCALE_Y,
  HEAD_BOB_Y_PERCENT,
  REST_EYE_SCALE_Y,
  REST_HEAD_Y_PERCENT,
  THROB_SCALE_Y,
} from '../../src/core/config.js'
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
      ([channels, cycleSeconds, displacedAt, tailSeconds]) => {
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
      [activity, CYCLE_S, DISPLACED_PHASE_S, RECOVERY_TAIL_S] as const,
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
    })
    expect(displacedSpread, 'work really stops from a displaced pose').toBeGreaterThan(DISPLACED_FLOOR)
    expectNear('the antenna rests at neutral scale once work stops', rested[0], NEUTRAL_SCALE, RESTED_TOLERANCE)
    expectNear('the head rests at its pose height once work stops', rested[1], REST_HEAD_Y_PERCENT, RESTED_TOLERANCE)
    expectNear('the eyes rest at their pose scale once work stops', rested[2], REST_EYE_SCALE_Y, RESTED_TOLERANCE)
  })
}
