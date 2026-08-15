import {expect, test} from '@playwright/test'
import {launchFrames, risePerFrame, stepsBetween} from './helpers/launches.js'
import {openIdleService, openMascotPage, restTip, tipUnderTransform} from './helpers/mascot-stage.js'
import {expectNear} from './helpers/near.js'

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
    ([releaseAt, windowSeconds, inFlight, launching]) => {
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
    [RELEASE_CROSSING_S, RELEASE_WINDOW_S, IN_FLIGHT_DIGIT, LAUNCHING_DIGIT] as const,
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
  expectNear('the in-flight digit holds its launch speed frame after frame', steps[0] ?? Number.NaN, nominalStep, 0.01)
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
