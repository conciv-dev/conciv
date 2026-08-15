import {expect, test} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildBareService, installManualClock, openMascotPage} from './helpers/mascot-stage.js'

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
    ([image, referenceAntennaPx, antennaPx]) => {
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
    [CUSTOM_LAYER_IMAGE, CUSTOM_REFERENCE_ANTENNA_PX, FAB_ANTENNA_PX] as const,
  )
  const factor = FAB_ANTENNA_PX / CUSTOM_REFERENCE_ANTENNA_PX

  expect(result.headBackground, 'connect() reads the head layer art from the skin').toBe(`url('${CUSTOM_LAYER_IMAGE}')`)
  expectNear('the effect reads the skin off the core-supplied context', result.geometry.fontSizePx, 9 * factor, 0.05)
  expectNear('the skin reference antenna scales the leading lane', result.geometry.leadingLeft, -1 * factor, 0.05)
  expectNear('the skin reference antenna scales the digit top', result.geometry.top, -12 * factor, 0.05)
})
