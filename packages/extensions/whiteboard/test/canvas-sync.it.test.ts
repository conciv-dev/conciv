import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {bundleFixture, pageHtml, servePage, type PageServer} from './helpers/page.js'

const here = dirname(fileURLToPath(import.meta.url))

const state: {browser?: Browser; stack?: Stack; page?: PageServer} = {}

beforeAll(async () => {
  const stack = await bootStack()
  state.stack = stack
  const js = await bundleFixture(join(here, 'fixtures/canvas-sync-fixture.ts'))
  const body = '<div id="host"></div><p id="status"></p><p id="count">scene:0</p>'
  state.page = await servePage(pageHtml(js, stack.core, body), stack.sync.hooks)
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  await state.stack?.stop()
})

describe('whiteboard canvas sync (it) — draws converge across tabs and rehydrate', () => {
  it('propagates a draw from one tab to another and survives reload', async () => {
    const reader = await state.browser!.newPage()
    await reader.goto(`${state.page!.base}/`)
    await reader.getByText('reader-ready').waitFor({state: 'visible', timeout: 30_000})

    const writer = await state.browser!.newPage()
    await writer.goto(`${state.page!.base}/?draw=1`)

    await reader.getByText('scene:1').waitFor({state: 'visible', timeout: 30_000})
    await writer.close()

    await reader.reload()
    await reader.getByText('scene:1').waitFor({state: 'visible', timeout: 30_000})
    await reader.close()
  })
})
