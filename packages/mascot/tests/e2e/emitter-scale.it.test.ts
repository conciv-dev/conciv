import {test, type Page} from '@playwright/test'
import {expectNear} from './helpers/near.js'
import {buildService, expectedEmitterGeometry, openMascotPage, PRODUCT_FAB_STAGE_PX} from './helpers/mascot-stage.js'

const TRIPLE_STAGE_PX = PRODUCT_FAB_STAGE_PX * 3

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

function assertGeometry(label: string, reading: Reading, stageSizePx: number, tolerance: number): void {
  const expected = expectedEmitterGeometry(stageSizePx)
  expectNear(`${label}: digit font size`, reading.fontSizePx, expected.fontSizePx, tolerance)
  expectNear(`${label}: leading lane offset`, reading.leadingLeft, expected.leadingLeft, tolerance)
  expectNear(`${label}: trailing lane offset`, reading.trailingLeft, expected.trailingLeft, tolerance)
  expectNear(`${label}: digit placement top`, reading.top, expected.top, tolerance)
  expectNear(`${label}: rise distance`, reading.risePx, expected.risePx, tolerance)
}

test('the product 44px FAB stage renders the approved emitter geometry unchanged', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false}, PRODUCT_FAB_STAGE_PX)
  const reading = await readEmitterGeometry(page)

  assertGeometry('the 44px product stage', reading, PRODUCT_FAB_STAGE_PX, 0.5)
})

test('a stage three times the FAB size scales every emitter distance by three', async ({page}) => {
  await buildService(page, {state: 'rest', working: true, follow: false}, TRIPLE_STAGE_PX)
  const reading = await readEmitterGeometry(page)

  assertGeometry('a 132px stage', reading, TRIPLE_STAGE_PX, 1.5)
})
