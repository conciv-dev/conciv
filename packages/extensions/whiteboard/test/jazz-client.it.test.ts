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

const stack = (): Stack => {
  const value = state.stack
  if (value === undefined) throw new Error('stack not ready')
  return value
}
const browser = (): Browser => {
  const value = state.browser
  if (value === undefined) throw new Error('browser not ready')
  return value
}
const built = (): BuiltFixture => {
  const value = state.built
  if (value === undefined) throw new Error('built fixture not ready')
  return value
}

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
  it('syncs a backend-written row into the browser jazz client', async () => {
    const result = JSON.parse(
      String(
        await callTool(stack().core, sessionId('e1seed'), 'canvas.draw', {
          elements: [{type: 'rectangle', x: 0, y: 0, width: 80, height: 60}],
        }),
      ),
    ) as {pending: string}
    const pendingId = result.pending
    state.page = await serveBuiltFixture(built(), stack().core, '<div id="host"></div>')
    const page = await browser().newPage()
    await page.goto(`${state.page.base}/`)
    await page.getByText(pendingId).waitFor({state: 'visible', timeout: 30_000})
    expect(await page.getByText(pendingId).count()).toBe(1)
    await page.close()
  })
})
