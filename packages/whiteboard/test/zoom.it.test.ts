import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bundleFixture, pageHtml, servePage, type PageServer} from './helpers/page.js'

const here = dirname(fileURLToPath(import.meta.url))

const state: {browser?: Browser; page?: PageServer} = {}

beforeAll(async () => {
  const js = await bundleFixture(join(here, 'fixtures/zoom-fixture.ts'))
  state.page = await servePage(pageHtml(js, '', '<div id="host"></div><p id="seeded"></p>'))
  state.browser = await chromium.launch()
}, 90_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
})

describe('whiteboard zoom controls (it)', () => {
  it('zooms to fit and reflects the new zoom in the readout', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/`)
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})
    await page.getByText('seeded').waitFor({state: 'visible', timeout: 20_000})

    const controls = page.locator('[data-whiteboard-zoom]')
    const readout = controls.getByRole('status')
    await readout.waitFor({state: 'visible', timeout: 10_000})
    expect(await readout.textContent()).toBe('100%')

    await controls.getByRole('button', {name: 'Zoom to fit'}).click()
    await expect.poll(() => readout.textContent(), {timeout: 10_000}).not.toBe('100%')

    await controls.getByRole('button', {name: 'Reset zoom'}).click()
    await expect.poll(() => readout.textContent(), {timeout: 10_000}).toBe('100%')

    await page.close()
  })
})
