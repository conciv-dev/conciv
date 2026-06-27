import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {
  buildSolidFixture,
  removeFixtureDir,
  serveBuiltFixture,
  type BuiltFixture,
  type FixturePage,
} from './helpers/solid-page.js'

const here = dirname(fileURLToPath(import.meta.url))
const state: {stack?: Stack; browser?: Browser; built?: BuiltFixture; page?: FixturePage} = {}

const browser = (): Browser => {
  const value = state.browser
  if (value === undefined) throw new Error('browser not ready')
  return value
}
const pageServer = (): FixturePage => {
  const value = state.page
  if (value === undefined) throw new Error('page server not ready')
  return value
}

beforeAll(async () => {
  state.stack = await bootStack()
  state.built = await buildSolidFixture(join(here, 'fixtures/presence-fixture.tsx'))
  state.page = await serveBuiltFixture(state.built, state.stack.core, '<div id="app"></div><div id="host"></div>')
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  if (state.built) removeFixtureDir(state.built)
  await state.stack?.stop()
})

describe('whiteboard presence (it) — remote cursors over the cursors table', () => {
  it("shows one peer's cursor on the other client", {timeout: 120_000}, async () => {
    const alice = await browser().newPage()
    await alice.goto(`${pageServer().base}/?room=presence&name=Alice`)
    await alice.waitForFunction(() => (window as unknown as {__ready?: boolean}).__ready === true, {timeout: 40_000})
    await alice.evaluate(() => (window as unknown as {move: (x: number, y: number) => void}).move(42, 84))

    const bob = await browser().newPage()
    await bob.goto(`${pageServer().base}/?room=presence&name=Bob`)
    await bob.getByText('peers:Alice', {exact: false}).waitFor({state: 'visible', timeout: 40_000})
    await bob.getByText('cursors:1', {exact: false}).waitFor({state: 'visible', timeout: 40_000})

    await alice.close()
    await bob.close()
  })
})
