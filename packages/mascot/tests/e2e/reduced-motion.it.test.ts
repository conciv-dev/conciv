import {expect, test} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildService, openMascotPage} from './helpers/mascot-stage.js'

test.use({contextOptions: {reducedMotion: 'reduce'}})

test('reduced motion lands poses instantly and starts no gaze or emitter', async ({page}) => {
  await openMascotPage(page)
  await buildService(page, {state: 'rest', working: false, follow: true})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.service.update({state: 'awake', working: false, follow: true})
    const instant = {
      headY: harness.property(window.parts.head, 'yPercent'),
      eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
      antennaRotation: harness.property(window.parts.antenna, 'rotation'),
    }
    window.service.update({state: 'awake', working: true, follow: true})
    await harness.wait(700)
    return {
      instant,
      listeners: window.pointerMoveListenerCount,
      emitters: harness.emitters().length,
      tweens: harness.globalTweenCount(),
    }
  })

  expectNear('reduced motion lands the head pose instantly', result.instant.headY, -2, 0.001)
  expectNear('reduced motion lands the eyes pose instantly', result.instant.eyesScaleY, 1.06, 0.001)
  expectNear('reduced motion lands the antenna pose instantly', result.instant.antennaRotation, -4, 0.001)
  expect(result.listeners, 'reduced motion attaches no pointermove listener').toBe(0)
  expect(result.emitters, 'reduced motion emits no binary effect').toBe(0)
  expect(result.tweens, 'reduced motion leaves no tween running, not even a tip tracker').toBe(0)
})
