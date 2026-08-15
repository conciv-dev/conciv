import {expect, test} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {
  buildLegacyRig,
  buildService,
  installManualClock,
  openIdleService,
  openMascotPage,
  restTip,
  tipUnderTransform,
} from './helpers/mascot-stage.js'

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

test('entering work anchors on the leaned tip and rides the antenna through every bob', async ({page}) => {
  await installManualClock(page)
  await buildLegacyRig(page)
  const result = await page.evaluate(() => {
    const harness = window.mascotHarness
    const {antenna, root} = window.parts
    window.rig.apply('open')
    harness.advanceBy(0.9)
    const leaned = harness.property(antenna, 'rotation')
    window.rig.apply('work')
    const emitter = harness.requireEmitter()
    const sample = () => ({anchor: harness.anchorOf(emitter), yPercent: harness.property(antenna, 'yPercent')})
    const entry = harness.anchorOf(emitter)
    harness.advanceBy(1)
    const trough = sample()
    harness.advanceBy(1)
    const peak = sample()
    return {
      leaned,
      entry,
      trough,
      peak,
      rotation: harness.property(antenna, 'rotation'),
      bobPx: antenna.offsetHeight * 0.05,
      stage: {width: root.offsetWidth, height: root.offsetHeight},
    }
  })
  const tip = restTip(result.stage)

  expectNear('the open pose really leaned the antenna', result.leaned, -4, 0.01)
  expect(
    Math.abs(result.entry.left - tip.x),
    'entering work anchors at the leaned tip, not the rest tip',
  ).toBeGreaterThan(1)
  expectNear('the work pose returns the antenna to rest', result.rotation, 0, 0.01)
  expectNear('the sampled trough really is the bob floor', result.trough.yPercent, -5, 0.05)
  expectNear('the sampled peak really is the bob top', result.peak.yPercent, 0, 0.05)
  expectNear('the anchor rides the antenna down to the bob floor', result.trough.anchor.top, tip.y - result.bobPx, 0.3)
  expectNear('the anchor rides the antenna back up to the bob top', result.peak.anchor.top, tip.y, 0.3)
  expectNear('the bob never drags the anchor sideways', result.peak.anchor.left, tip.x, 0.3)
})

test('the emitter anchor rides the throb stretch, not the unstretched tip', async ({page}) => {
  await openIdleService(page)
  const result = await page.evaluate(() => {
    const harness = window.mascotHarness
    const {antenna, root} = window.parts
    const sample = () => ({
      anchor: harness.anchorOf(harness.requireEmitter()),
      scaleY: harness.property(antenna, 'scaleY'),
      yPercent: harness.property(antenna, 'yPercent'),
    })
    window.service.update({state: 'rest', working: true, follow: false})
    harness.advanceBy(0.3)
    const peak = sample()
    harness.advanceBy(0.85)
    const settled = sample()
    return {peak, settled, stage: {width: root.offsetWidth, height: root.offsetHeight}}
  })
  const peakTip = tipUnderTransform(result.stage, result.peak.scaleY, result.peak.yPercent)
  const settledTip = tipUnderTransform(result.stage, result.settled.scaleY, result.settled.yPercent)

  expectNear('the sampled beat really is the throb peak', result.peak.scaleY, 1.3, 0.01)
  expect(result.settled.scaleY, 'the second sample really left the throb peak').toBeLessThan(1.1)
  expectNear('the anchor rides the stretched tip at the throb peak', result.peak.anchor.top, peakTip.y, 0.3)
  expectNear('the anchor follows the tip back as the throb settles', result.settled.anchor.top, settledTip.y, 0.3)
})

test('a viewport resize re-measures the antenna so the emitter keeps riding the real tip', async ({page}) => {
  await page.setViewportSize({width: 1000, height: 800})
  await installManualClock(page)
  await buildService(page, {state: 'rest', working: false, follow: false})
  const before = await page.evaluate(() => {
    const harness = window.mascotHarness
    harness.applyStyle(window.parts.root, {width: '20vw', height: '20vw'})
    window.service.update({state: 'rest', working: true, follow: false})
    harness.advanceBy(0.5)
    harness.watchResize()
    return {anchorLeft: harness.anchorOf(harness.requireEmitter()).left, stageWidth: window.parts.root.offsetWidth}
  })
  await page.setViewportSize({width: 1600, height: 800})
  const after = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.awaitResize()
    harness.advanceBy(0.5)
    return {anchorLeft: harness.anchorOf(harness.requireEmitter()).left, stageWidth: window.parts.root.offsetWidth}
  })

  expectNear('the emitter rides the antenna axis of the narrow stage', before.anchorLeft, before.stageWidth * 0.5, 0.5)
  expect(after.stageWidth, 'the resize really widened the stage').toBeGreaterThan(before.stageWidth + 50)
  expectNear('the emitter rides the antenna axis of the widened stage', after.anchorLeft, after.stageWidth * 0.5, 0.5)
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
