import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {bundleFixture, pageHtml, servePage, type PageServer} from './helpers/page.js'
import {runTool, sessionId} from './helpers/run-tool.js'

const here = dirname(fileURLToPath(import.meta.url))

const state: {browser?: Browser; stack?: Stack; page?: PageServer} = {}

beforeAll(async () => {
  const stack = await bootStack()
  state.stack = stack
  const js = await bundleFixture(join(here, 'fixtures/canvas-tools-fixture.ts'))
  state.page = await servePage(
    pageHtml(js, stack.core, '<div id="host"></div><p id="count">scene:0</p>'),
    stack.sync.hooks,
  )
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  await state.stack?.stop()
})

describe('whiteboard canvas tools (it) — AI draws into the shared room', () => {
  it('canvas.draw appears live in the browser and canvas.delete needs approval', async () => {
    const sid = sessionId('canvasdraw')
    const room = `local:${sid}`
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?room=${encodeURIComponent(room)}`)
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const drawn = await runTool(state.stack!.core, sid, 'canvas.draw', {
      elements: [{type: 'rectangle', x: 0, y: 0, width: 100, height: 100}],
    })
    expect(drawn.status).toBe(200)

    await page.getByText('scene:1').waitFor({state: 'visible', timeout: 30_000})

    const refused = await runTool(state.stack!.core, sid, 'canvas.delete', {id: 'whatever'})
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({needsApproval: true, name: 'canvas.delete'})

    await page.close()
  })
})
