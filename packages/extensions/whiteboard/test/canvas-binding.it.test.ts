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

const parse = (result: unknown): {elements: {type: string}[]} => JSON.parse(String(result))

async function readUntil(core: string, session: string, type: string): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const read = parse(await callTool(core, session, 'canvas.read', {}))
    if (read.elements.some((element) => element.type === type)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function readCountAtLeast(core: string, session: string, count: number): Promise<number> {
  let last = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    last = parse(await callTool(core, session, 'canvas.read', {})).elements.length
    if (last >= count) return last
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return last
}

beforeAll(async () => {
  state.stack = await bootStack()
  state.built = await buildSolidFixture(join(here, 'fixtures/canvas-binding-fixture.tsx'))
  state.page = await serveBuiltFixture(
    state.built,
    state.stack.core,
    '<div id="app"></div><div id="host"></div><p id="count">scene:0</p>',
  )
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  if (state.built) removeFixtureDir(state.built)
  await state.stack?.stop()
})

describe('whiteboard canvas binding (it) — AI draws drain into the canvas, local edits persist', () => {
  it('drains an AI canvas.draw onto the canvas and back into canvasElements', async () => {
    await callTool(state.stack!.core, sessionId('e2ai'), 'canvas.draw', {
      elements: [{type: 'rectangle', x: 10, y: 10, width: 80, height: 60}],
    })
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?session=e2ai`)
    await page.getByText('scene:1').waitFor({state: 'visible', timeout: 40_000})

    expect(await readUntil(state.stack!.core, sessionId('e2ai'), 'rectangle')).toBe(true)

    await page.reload()
    await page.getByText('scene:1').waitFor({state: 'visible', timeout: 40_000})
    await page.close()
  })

  it('persists a local draw into canvasElements the agent can read', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?session=e2local`)
    await page.getByText('ready').waitFor({state: 'visible', timeout: 40_000})
    await page.evaluate(() => (window as unknown as {drawLocal: () => void}).drawLocal())
    await page.getByText('scene:1').waitFor({state: 'visible', timeout: 40_000})

    expect(await readUntil(state.stack!.core, sessionId('e2local'), 'ellipse')).toBe(true)
    await page.close()
  })

  it('renders an AI mermaid diagram as multiple elements', async () => {
    await callTool(state.stack!.core, sessionId('e2mermaid'), 'canvas.diagram', {mermaid: 'graph TD; A-->B; B-->C'})
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?session=e2mermaid`)
    await page.getByText('ready').waitFor({state: 'visible', timeout: 40_000})

    expect(await readCountAtLeast(state.stack!.core, sessionId('e2mermaid'), 3)).toBeGreaterThanOrEqual(3)
    await page.close()
  })
})
