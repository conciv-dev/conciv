import {test, type Page} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildService, expectedEmitterGeometry, openMascotPage, PRODUCT_FAB_ANTENNA_PX} from './helpers/mascot-stage.js'

const TRIPLE_ANTENNA_PX = PRODUCT_FAB_ANTENNA_PX * 3

const SITE_FAB_BUTTON_PX = 56

const SITE_FAB_LAYER_INSET_PX = 6

const RISE_SAMPLE_MS = 2600

type Reading = {fontSizePx: number; leadingLeft: number; trailingLeft: number; top: number; risePx: number}

test.beforeEach(async ({page}) => {
  await openMascotPage(page)
})

const readEmitterGeometry = (page: Page): Promise<Reading> =>
  page.evaluate(async (sampleMilliseconds) => {
    const harness = window.mascotHarness
    const emitter = harness.requireEmitter()
    const leading = harness.requireDigit(emitter, 0)
    const rise = await harness.sampleFrames(() => harness.property(leading, 'y'), sampleMilliseconds)
    return {...harness.emitterGeometry(emitter), risePx: harness.summarize(rise).min}
  }, RISE_SAMPLE_MS)

function assertGeometry(label: string, reading: Reading, antennaBoxPx: number, tolerance: number): void {
  const expected = expectedEmitterGeometry(antennaBoxPx)
  expectNear(`${label}: digit font size`, reading.fontSizePx, expected.fontSizePx, tolerance)
  expectNear(`${label}: leading lane offset`, reading.leadingLeft, expected.leadingLeft, tolerance)
  expectNear(`${label}: trailing lane offset`, reading.trailingLeft, expected.trailingLeft, tolerance)
  expectNear(`${label}: digit placement top`, reading.top, expected.top, tolerance)
  expectNear(`${label}: rise distance`, reading.risePx, expected.risePx, tolerance)
}

test('the widget FAB, whose antenna fills its 44px stage, keeps the approved emitter geometry', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false}, PRODUCT_FAB_ANTENNA_PX)
  const reading = await readEmitterGeometry(page)

  assertGeometry('the widget FAB', reading, PRODUCT_FAB_ANTENNA_PX, 0.5)
})

test('the site FAB, whose 44px antenna is inset in a 56px button, keeps the approved emitter geometry', async ({
  page,
}) => {
  await buildService(page, {state: 'rest', working: true, follow: false}, SITE_FAB_BUTTON_PX, SITE_FAB_LAYER_INSET_PX)
  const reading = await readEmitterGeometry(page)

  assertGeometry('the site FAB', reading, PRODUCT_FAB_ANTENNA_PX, 0.5)
})

test('an antenna three times the FAB size scales every emitter distance by three', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false}, TRIPLE_ANTENNA_PX)
  const reading = await readEmitterGeometry(page)

  assertGeometry('a 132px antenna', reading, TRIPLE_ANTENNA_PX, 1.5)
})
