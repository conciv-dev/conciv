import {expect, test} from '@playwright/test'
import {collectLaunches, launchFrames, medianStep, risePerFrame} from './helpers/launches.js'
import {
  buildLegacyRig,
  buildService,
  expectedEmitterGeometry,
  installManualClock,
  openIdleService,
  openMascotPage,
  restTip,
  tipUnderTransform,
} from './helpers/mascot-stage.js'
import {expectNear} from './helpers/near.js'

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

test('the legacy work state stages the emitter, throbs and drains without leaking tweens', async ({page}) => {
  await installManualClock(page)
  await buildLegacyRig(page)
  const enter = await page.evaluate(() => {
    const harness = window.mascotHarness
    window.rig.apply('work')
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
    window.rig.apply('closed')
    const emitter = harness.requireEmitter()
    const values = harness.stepFrames(() => harness.property(emitter, 'opacity'), 0.4)
    harness.advanceBy(0.7)
    return {drain: harness.summarize(values), emitters: harness.emitters().length}
  })
  const flap = await page.evaluate(() => {
    const harness = window.mascotHarness
    for (let cycle = 0; cycle < 5; cycle += 1) {
      window.rig.apply('work')
      harness.advanceBy(0.14)
      window.rig.apply('closed')
      harness.advanceBy(0.14)
    }
    window.rig.apply('work')
    harness.advanceBy(1.5)
    return {emitters: harness.emitters().length, tweens: harness.globalTweenCount()}
  })
  const tip = restTip(enter.stage)

  expect(enter.digits, 'emitter carries 5 digits').toBe(5)
  expectNear('the entering emitter anchors at the antenna tip x = stage width x 0.5', enter.anchor.left, tip.x, 1)
  expectNear('the entering emitter anchors at the unbobbed tip y = stage height x 0.15625', enter.anchor.top, tip.y, 1)
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
  await buildLegacyRig(page)
  const result = await page.evaluate(
    ([sampleStart, sampleSeconds]) => {
      const harness = window.mascotHarness
      const {antenna, root} = window.parts
      window.rig.apply('open')
      harness.advanceBy(0.9)
      const leaned = harness.property(antenna, 'rotation')
      window.rig.apply('work')
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
    [LAUNCH_SAMPLE_START_S, LAUNCH_SAMPLE_S] as const,
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
    ([launchAt, windowSeconds, digit]) => {
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
    [STRETCHED_LAUNCH_AT_S, STRETCHED_LAUNCH_WINDOW_S, STRETCHED_DIGIT] as const,
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
  await buildService(page, {state: 'rest', working: false, follow: false})
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
    async ([settleSeconds, riseSeconds]) => {
      const harness = window.mascotHarness
      await harness.awaitResize()
      const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
      if (!rebuilt) throw new Error('the resize never rebuilt the emitter')
      harness.advanceBy(settleSeconds)
      return harness.emitterFlight(window.parts, riseSeconds)
    },
    [RELAUNCH_SETTLE_S, RISE_SAMPLE_S] as const,
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
  await buildService(page, {state: 'rest', working: false, follow: false})
  const before = await page.evaluate(
    ([narrowPx, riseSeconds]) => {
      const harness = window.mascotHarness
      harness.applyStyle(window.parts.root, {width: `${narrowPx}px`, height: `${narrowPx}px`})
      window.service.update({state: 'rest', working: true, follow: false})
      harness.advanceBy(0.5)
      harness.watchEmitterMounts()
      return harness.emitterFlight(window.parts, riseSeconds)
    },
    [STAGE_NARROW_PX, RISE_SAMPLE_S] as const,
  )
  const after = await page.evaluate(
    async ([widePx, settleSeconds, riseSeconds]) => {
      const harness = window.mascotHarness
      harness.applyStyle(window.parts.root, {width: `${widePx}px`, height: `${widePx}px`})
      const rebuilt = await harness.settleUntil(() => harness.emitterMounts() >= 1)
      if (!rebuilt) throw new Error('the css stage growth never rebuilt the emitter')
      harness.advanceBy(settleSeconds)
      return harness.emitterFlight(window.parts, riseSeconds)
    },
    [STAGE_WIDE_PX, RELAUNCH_SETTLE_S, RISE_SAMPLE_S] as const,
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
  expect(coalesced.mounts, `${RESIZE_BURST_SIZES_PX.length} stage resizes in one frame rebuild the emitter once`).toBe(
    1,
  )
  expect(coalesced.rebuiltSynchronously, 'no stage resize rebuilds the emitter inside the mutation itself').toBe(false)
  expect(coalesced.replaced, 'the coalesced rebuild really replaced the emitter node').toBe(true)
  expect(coalesced.emitters, 'the coalesced rebuild leaves exactly one emitter').toBe(1)
})
