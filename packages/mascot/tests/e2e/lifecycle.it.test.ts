import {expect, test} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildService, openMascotPage} from './helpers/mascot-stage.js'

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

test('a state change mid-work keeps the original timeline, emitter and scale', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(2200)
    const emitter = harness.requireEmitter()
    const anchorBefore = harness.boxOf(emitter)
    const timelineBefore = harness.repeatingTimeline()
    window.service.update({state: 'awake', working: true, follow: false})
    const during = await harness.sampleFrames(() => harness.property(emitter, 'scale'), 900)
    const anchorAfter = harness.boxOf(emitter)
    const sameTimeline = harness.repeatingTimeline() === timelineBefore
    const values = await harness.sampleFrames<[number, number]>(
      () => [harness.property(window.parts.antenna, 'scaleY'), harness.property(window.parts.eyes, 'scaleY')],
      2400,
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
  expect(anchorShift, 'the emitter re-anchors to the leaned antenna tip').toBeGreaterThan(0.5)
})

test('leaving work for the open pose raises the eyes monotonically to their awake rest', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(2200)
    await harness.waitUntil(() => harness.property(window.parts.eyes, 'scaleY') > 0.99, 2000)
    window.service.update({state: 'awake', working: false, follow: false})
    const values = await harness.sampleFrames(() => harness.property(window.parts.eyes, 'scaleY'), 1100)
    return {series: harness.summarize(values), reversals: harness.reversals(values, 0.002)}
  })

  expectNear('work to open settles at 1.06', result.series.last, 1.06, 0.01)
  expect(result.series.min, 'work to open never dips below 1.0').toBeGreaterThanOrEqual(0.999)
  expect(result.reversals, 'work to open rises monotonically').toBeLessThanOrEqual(1)
})

test('stopping work restores the neutral antenna and the eye rest of the current state', async ({page}) => {
  await buildService(page, {state: 'rest', working: false, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const settleReading = async () => {
      await harness.wait(1200)
      return {
        antennaScaleX: harness.property(window.parts.antenna, 'scaleX'),
        antennaScaleY: harness.property(window.parts.antenna, 'scaleY'),
        eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
      }
    }
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(2200)
    window.service.update({state: 'rest', working: false, follow: false})
    const rest = await settleReading()
    window.service.update({state: 'awake', working: false, follow: false})
    await harness.wait(900)
    window.service.update({state: 'awake', working: true, follow: false})
    await harness.wait(2200)
    window.service.update({state: 'awake', working: false, follow: false})
    const awake = await settleReading()
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
  const result = await page.evaluate(async () => {
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
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(1300)
    window.service.update({state: 'awake', working: false, follow: false})
    const handoff = await harness.sampleFrames<[number, number, number]>(
      () => [harness.property(head, 'yPercent'), harness.activeWritersOf(head), harness.activeWritersOf(eyes)],
      260,
    )
    const toAwake = handoff.map((entry) => entry[0])
    const writers = {
      head: harness.summarize(handoff.map((entry) => entry[1])),
      eyes: harness.summarize(handoff.map((entry) => entry[2])),
    }
    await harness.wait(1000)
    const awake = landed()
    window.service.update({state: 'awake', working: true, follow: false})
    await harness.wait(1300)
    window.service.update({state: 'rest', working: false, follow: false})
    const toRest = await harness.sampleFrames(() => harness.property(head, 'yPercent'), 1200)
    return {
      awake,
      rest: landed(),
      writers,
      awakeHead: harness.summarize(toAwake),
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
  expect(result.writers.eyes.max, 'exactly one animation writes the eyes across the handoff').toBe(1)
  expect(result.awakeHead.max, 'only the awake anticipation drives the head positive').toBeGreaterThan(3)
  expect(result.awakeHead.min, 'only the awake stretch drives the head past the -5 bob floor').toBeLessThan(-6)
  expect(result.restHead, 'no recovery tween fights the rest pose on the head').toBeLessThanOrEqual(1)
})

test('a mid-work state change re-centers the head bob on the new pose value', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const bobRange = async () => {
      const values = await harness.sampleFrames(() => harness.property(window.parts.head, 'yPercent'), 2400)
      return harness.summarize(values)
    }
    await harness.wait(2200)
    const restBob = await bobRange()
    window.service.update({state: 'awake', working: true, follow: false})
    await harness.wait(2400)
    const awakeBob = await bobRange()
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(2400)
    return {restBob, awakeBob, backToRestBob: await bobRange()}
  })

  expectNear('the rest bob rides between 0 and -5', result.restBob.max, 0, 0.05)
  expectNear('the rest bob reaches -5', result.restBob.min, -5, 0.05)
  expectNear('the bob re-centers on the awake head value', result.awakeBob.max, -2, 0.05)
  expectNear('the awake bob still reaches -5', result.awakeBob.min, -5, 0.05)
  expectNear('the bob re-centers back on the rest head value', result.backToRestBob.max, 0, 0.05)
})

test('restarting work during the staged exit reuses the draining emitter', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(900)
    const before = harness.requireEmitter()
    window.service.update({state: 'rest', working: false, follow: false})
    await harness.wait(200)
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(900)
    return {
      sameNode: harness.emitters()[0] === before,
      opacity: harness.property(before, 'opacity'),
      emitters: harness.emitters().length,
    }
  })

  expect(result.sameNode, 'restart during exit reuses the emitter node').toBe(true)
  expectNear('restart during exit returns opacity to 1', result.opacity, 1, 0.001)
  expect(result.emitters, 'restart during exit leaves exactly one emitter').toBe(1)
})

test('destroying during the staged exit tears everything down and nothing resurrects', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(900)
    window.service.update({state: 'rest', working: false, follow: false})
    await harness.wait(200)
    window.service.destroy()
    const immediate = {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}
    await harness.wait(900)
    return {immediate, later: {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}}
  })

  expect(result.immediate.emitters, 'destroy removes every emitter immediately').toBe(0)
  expect(result.immediate.wrappers, 'destroy removes every lean wrapper immediately').toBe(0)
  expect(result.later.emitters, 'no emitter resurrects after the exit window').toBe(0)
  expect(result.later.wrappers, 'no wrapper resurrects after the exit window').toBe(0)
})
