import {expect, test} from '@playwright/test'
import {CANVAS_EFFECTS, EFFECT_MOUNTS} from '../effect-catalog.js'
import {installManualClock, openMascotPage} from './helpers/mascot-stage.js'

const WORK_SAMPLE_MS = 700

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

for (const [name, mount] of Object.entries(EFFECT_MOUNTS)) {
  test(`the ${name} effect drains its nodes, tweens and frame loop on the falling edge`, async ({page}) => {
    await installManualClock(page)
    const result = await page.evaluate(
      async ([effectName, exportName]) => {
        const harness = window.mascotHarness
        const effect = await harness.loadEffect(effectName, exportName)
        const parts = harness.buildStage()
        const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
        service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
        const read = () => ({
          nodes: parts.root.childElementCount,
          tweens: harness.globalTweenCount(),
          frames: harness.pendingFrameCount(),
          loops: harness.tickerListenerCount(),
        })
        const runCycle = async () => {
          service.update({state: 'rest', working: true, follow: false})
          harness.advanceBy(0.9)
          await harness.settleFrames()
          const working = read()
          service.update({state: 'rest', working: false, follow: false})
          harness.advanceBy(0.2)
          await harness.settleFrames()
          const draining = read()
          harness.advanceBy(1)
          return {working, draining}
        }
        await runCycle()
        await harness.settleFrames()
        const idle = read()
        service.mountEffect(effectName, effect)
        const cycled = await runCycle()
        await harness.settleFrames()
        const drained = read()
        service.destroy()
        parts.root.remove()
        return {idle, working: cycled.working, draining: cycled.draining, drained}
      },
      [name, mount] as const,
    )
    const loops = CANVAS_EFFECTS.includes(name) ? 1 : 0

    expect(result.working.nodes, `${name} adds an emitter node while working`).toBeGreaterThan(result.idle.nodes)
    expect(result.working.frames, `${name} rides the one gsap ticker rAF and never opens a second one`).toBe(
      result.idle.frames,
    )
    expect(result.working.loops, `${name} runs the frame loops its rendering needs`).toBe(result.idle.loops + loops)
    expect(result.draining.nodes, `${name} still owns its emitter node mid-drain`).toBe(result.working.nodes)
    expect(result.draining.loops, `${name} keeps painting while the staged exit runs`).toBe(result.idle.loops + loops)
    expect(result.drained.nodes, `${name} drains every emitter node it added`).toBe(result.idle.nodes)
    expect(result.drained.tweens, `${name} leaves no tween running`).toBe(result.idle.tweens)
    expect(result.drained.frames, `${name} opens no rAF of its own`).toBe(result.idle.frames)
    expect(result.drained.loops, `${name} cancels every frame loop it started`).toBe(result.idle.loops)
  })
}

for (const name of CANVAS_EFFECTS) {
  test(`the ${name} effect repaints its canvas while it works`, async ({page}) => {
    const result = await page.evaluate(
      async ([effectName, exportName, sampleMs]) => {
        const harness = window.mascotHarness
        const effect = await harness.loadEffect(effectName, exportName)
        const parts = harness.buildStage()
        const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
        service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
        service.mountEffect(effectName, effect)
        service.update({state: 'rest', working: true, follow: false})
        const canvas = harness.requireCanvas(parts.root)
        const painted = await harness.sampleFrames(() => harness.canvasSignature(canvas), sampleMs)
        service.destroy()
        parts.root.remove()
        return {unique: new Set(painted).size, samples: painted.length}
      },
      [name, EFFECT_MOUNTS[name] ?? '', WORK_SAMPLE_MS] as const,
    )

    expect(result.samples, `${name} really sampled a full emission cycle`).toBeGreaterThan(10)
    expect(result.unique, `${name} repaints its canvas as its sparks travel`).toBeGreaterThan(1)
  })
}

const FOUNTAIN_STEADY_STATE_MS = 1400

const FOUNTAIN_DRAIN_SAMPLE_MS = 400

const DRAINED_INK_CEILING = 0.5

test('the spark-fountain effect stops emitting on the falling edge and lets its live sparks finish', async ({page}) => {
  const result = await page.evaluate(
    async ([steadyStateMs, drainMs]) => {
      const harness = window.mascotHarness
      const effect = await harness.loadEffect('spark-fountain', 'sparkFountainEffect')
      const parts = harness.buildStage()
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
      service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      service.mountEffect('spark-fountain', effect)
      service.update({state: 'rest', working: true, follow: false})
      const canvas = harness.requireCanvas(parts.root)
      await harness.wait(steadyStateMs)
      const working = harness.canvasInk(canvas)
      service.update({state: 'rest', working: false, follow: false})
      await harness.nextFrame()
      await harness.nextFrame()
      const drainStart = harness.canvasInk(canvas)
      await harness.wait(drainMs)
      const drainEnd = harness.canvasInk(canvas)
      service.destroy()
      parts.root.remove()
      return {working, drainStart, drainEnd}
    },
    [FOUNTAIN_STEADY_STATE_MS, FOUNTAIN_DRAIN_SAMPLE_MS] as const,
  )

  expect(result.working, 'the fountain really painted a steady-state spark population').toBeGreaterThan(0)
  expect(result.drainStart, 'the drain really starts from a populated canvas').toBeGreaterThan(0)
  expect(result.drainEnd, `the drain paints only the sparks it already had -> ${JSON.stringify(result)}`).toBeLessThan(
    result.drainStart * DRAINED_INK_CEILING,
  )
})
