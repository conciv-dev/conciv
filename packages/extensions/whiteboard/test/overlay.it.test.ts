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
  state.built = await buildSolidFixture(join(here, 'fixtures/overlay-fixture.tsx'))
  state.page = await serveBuiltFixture(state.built, state.stack.core, '<div id="app"></div>')
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  if (state.built) removeFixtureDir(state.built)
  await state.stack?.stop()
})

describe('whiteboard overlay (it) — pins render, thread opens, replies persist', () => {
  it('renders an agent pin, opens its thread, and persists a reply the agent reads', {timeout: 120_000}, async () => {
    const cid = crypto.randomUUID()
    await callTool(state.stack!.core, sessionId('e3'), 'comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'look here'}],
      x: 120,
      y: 120,
      authorKind: 'ai',
    })

    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?session=e3`)
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 40_000})

    const pin = page.locator('[aria-label="AI comment, open"]')
    await pin.waitFor({state: 'visible', timeout: 40_000})
    await pin.click()

    await page.locator('[aria-label="Comment thread"]').waitFor({state: 'visible', timeout: 10_000})
    await page.getByText('look here').waitFor({state: 'visible', timeout: 10_000})

    await page.locator('[aria-label="Reply"]').fill('on it')
    await page.locator('[aria-label="Send reply"]').click()
    await page.getByText('on it').waitFor({state: 'visible', timeout: 10_000})

    let seen = false
    for (let attempt = 0; attempt < 40 && !seen; attempt++) {
      const read = JSON.parse(String(await callTool(state.stack!.core, sessionId('e3'), 'comment.read', {cid}))) as {
        replies: {parts: {text?: string}[]}[]
      }
      seen = read.replies.some((reply) => reply.parts.some((part) => part.text === 'on it'))
      if (!seen) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(seen).toBe(true)
    await page.close()
  })

  it('creates a source-linked comment from an element pick the agent can list', {timeout: 120_000}, async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.page!.base}/?session=e3pick`)
    await page.waitForFunction(() => (window as unknown as {__commentReady?: boolean}).__commentReady === true, {
      timeout: 40_000,
    })

    await page.evaluate(() =>
      (window as unknown as {commentOnElement: (s: unknown, r: unknown) => void}).commentOnElement(
        {componentName: 'App', filePath: 'src/App.tsx', lineNumber: 3},
        {x: 100, y: 100, width: 80, height: 40},
      ),
    )
    await page.locator('[aria-label="Human comment, open"]').waitFor({state: 'visible', timeout: 40_000})

    let listed = false
    for (let attempt = 0; attempt < 40 && !listed; attempt++) {
      const result = JSON.parse(
        String(
          await callTool(state.stack!.core, sessionId('e3pick'), 'comment.list', {
            scope: 'session',
            file: 'src/App.tsx',
          }),
        ),
      ) as {comments: {kind?: string}[]}
      listed = result.comments.length > 0
      if (!listed) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(listed).toBe(true)
    await page.close()
  })
})
