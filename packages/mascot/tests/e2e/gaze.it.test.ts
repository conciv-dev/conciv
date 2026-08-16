import {expect, test} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildService, openMascotPage, readGaze, settle} from './helpers/mascot-stage.js'

const INSET_STAGE_PX = 56

const INSET_LAYER_PX = 6

const ANTENNA_ORIGIN_FRACTION_Y = 0.328

const POINTER_REACH_PX = 300

const GAZE_SETTLE_MS = 250

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

test('the resting follow state tracks the pointer with a saturating, mirrored falloff', async ({page}) => {
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
  await page.mouse.move(center.x + 400, center.y)
  await settle(page, 1400)
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
  await buildService(page, {state: 'rest', working: false, follow: true})
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
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
  await page.mouse.move(center.x + 400, center.y)
  await settle(page, 1400)
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
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
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
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
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
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
  await page.mouse.move(center.x + 400, center.y)
  await settle(page, 1400)
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
