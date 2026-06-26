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

describe('whiteboard mermaid (it) — AI diagram converted in the island', () => {
  it('canvas.diagram renders mermaid nodes and an edge on the canvas', async () => {
    const sid = sessionId('mermaid')
    const room = `local:${sid}`
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?room=${encodeURIComponent(room)}`)
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const res = await runTool(state.stack!.core, sid, 'canvas.diagram', {mermaid: 'graph TD; A-->B'})
    expect(res.status).toBe(200)

    await expect
      .poll(async () => Number((await page.locator('#count').textContent())?.replace('scene:', '') ?? 0), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(3)

    await page.close()
  })
})
