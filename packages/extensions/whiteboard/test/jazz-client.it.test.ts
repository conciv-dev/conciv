import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {callTool, sessionId} from './helpers/run-tool.js'
import {
  buildSolidFixture,
  removeFixtureDir,
  serveBuiltFixture,
  type BuiltFixture,
  type FixturePage,
} from './helpers/solid-page.js'

const here = dirname(fileURLToPath(import.meta.url))
const state: {stack?: Stack; browser?: Browser; built?: BuiltFixture; page?: FixturePage} = {}

beforeAll(async () => {
  state.stack = await bootStack()
  state.built = await buildSolidFixture(join(here, 'fixtures/jazz-client-fixture.tsx'))
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  if (state.built) removeFixtureDir(state.built)
  await state.stack?.stop()
})

describe('whiteboard jazz client bootstrap (it)', () => {
  it('reads a backend-seeded canvas element in the browser', async () => {
    const drawn = JSON.parse(
      String(
        await callTool(state.stack!.core, sessionId('e1seed'), 'canvas.draw', {
          elements: [{type: 'rectangle', x: 0, y: 0, width: 80, height: 60}],
        }),
      ),
    ) as {drawn: string[]}
    const elementId = drawn.drawn[0]!
    state.page = await serveBuiltFixture(state.built!, state.stack!.core, '<div id="host"></div>')
    const page = await state.browser!.newPage()
    await page.goto(`${state.page.base}/`)
    await page.getByText(elementId).waitFor({state: 'visible', timeout: 30_000})
    expect(await page.getByText(elementId).count()).toBe(1)
    await page.close()
  })
})
