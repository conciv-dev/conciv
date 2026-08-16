import {expect, test} from '@playwright/test'
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
import {FRAMES_PER_SECOND, launchFrames, scaleFactorOf, stepsBetween, travelPerFrame} from './helpers/launches.js'
import {openMascotPage, openStreamService, restTip, type StageSize, tipUnderTransform} from './helpers/mascot-stage.js'
import {expectNear} from './helpers/near.js'

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
    expect(inFlight.length, `at least one ${stream.name} particle stays in flight across the release`).toBeGreaterThan(
      0,
    )
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
