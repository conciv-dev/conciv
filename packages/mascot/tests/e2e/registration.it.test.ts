import {expect, test} from '@playwright/test'
import type {MascotConnect} from '../../src/rig.js'
import {expectNear} from './helpers/near.js'
import {buildService, installManualClock, openMascotPage, restTip, type StageParts} from './helpers/mascot-stage.js'

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
    const sameGetterTwice =
      names.every((name) => first[name]().ref === first[name]().ref) &&
      first.getEffectHostProps('binary').ref === first.getEffectHostProps('binary').ref
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

test('nulling any required ref tears the rig down and the effectHost owns the emitter', async ({page}) => {
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
    const slots: RequiredSlot[] = ['getRootProps', 'getHeadProps', 'getEyesProps', 'getAntennaProps']
    const torndown: TeardownReading[] = []
    for (const slot of slots) {
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
      const connected = service.connect()
      const parts = harness.buildStage()
      bind(connected, parts, makeEffectHost(parts.root))
      const armed = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
      connected[slot]().ref(null)
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
    anchor !== undefined && Math.abs(anchor.top - tip.y) <= 1,
    `the effect-hosted emitter anchors at the tip y, not the page offset -> ${JSON.stringify(anchor)}`,
  ).toBe(true)
})
