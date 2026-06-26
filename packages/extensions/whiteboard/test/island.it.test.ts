import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bundleFixture, pageHtml, servePage, type PageServer} from './helpers/page.js'

const here = dirname(fileURLToPath(import.meta.url))

const state: {browser?: Browser; page?: PageServer} = {}

beforeAll(async () => {
  const js = await bundleFixture(join(here, 'fixtures/island-fixture.ts'))
  state.page = await servePage(pageHtml(js, '', '<div id="host"></div>'))
  state.browser = await chromium.launch()
}, 90_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
})

describe('excalidraw island (it)', () => {
  it('renders the Excalidraw canvas inside a shadow root', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/`)
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    expect(await page.locator('[data-whiteboard-error]').count()).toBe(0)
    await page.close()
  })
})
