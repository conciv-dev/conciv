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
  const js = await bundleFixture(join(here, 'fixtures/presence-fixture.ts'))
  const body = '<div id="host"></div><p id="status"></p><p id="peers">peers:</p>'
  state.page = await servePage(pageHtml(js, stack.core, body), stack.sync.hooks)
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  await state.stack?.stop()
})

describe('whiteboard presence (it) — remote cursors over Yjs awareness', () => {
  it("shows one peer's cursor and label on the other tab", async () => {
    const room = 'presence:room'
    const alice = await state.browser!.newPage()
    await alice.goto(`${state.page!.base}/?room=${room}&name=Alice&move=1`)
    await alice.getByText('ready').waitFor({state: 'visible', timeout: 30_000})

    const bob = await state.browser!.newPage()
    await bob.goto(`${state.page!.base}/?room=${room}&name=Bob`)
    await bob.getByText('ready').waitFor({state: 'visible', timeout: 30_000})

    const bobPeers = bob.locator('#peers')
    await bobPeers.getByText('peers:Alice', {exact: false}).waitFor({state: 'visible', timeout: 30_000})
    await bobPeers.getByText('cursors:1', {exact: false}).waitFor({state: 'visible', timeout: 30_000})

    await alice.close()
    await bob.close()
  })
})
