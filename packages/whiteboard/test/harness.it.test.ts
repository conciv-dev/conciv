import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import getPort from 'get-port'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import {bootStack, type Stack} from './helpers/boot-stack.js'
import {runTool, sessionId} from './helpers/run-tool.js'
import {bundleFixture, pageHtml, servePage, type PageServer} from './helpers/page.js'

const here = dirname(fileURLToPath(import.meta.url))

const state: {stack?: Stack; browser?: Browser; page?: PageServer; echo?: Server; echoBase: string} = {echoBase: ''}

beforeAll(async () => {
  state.stack = await bootStack()
  const echoApp = new H3()
  echoApp.post('/api/tools/run', (event) => ({seen: event.req.headers.get(MANDARAX_SESSION_HEADER)}))
  const echo = serve({fetch: echoApp.fetch, port: await getPort(), hostname: '127.0.0.1'})
  state.echo = echo
  await echo.ready()
  state.echoBase = new URL(echo.url ?? '').origin
  state.browser = await chromium.launch()
}, 90_000)

afterAll(async () => {
  await state.browser?.close()
  await state.page?.close()
  await state.echo?.close()
  await state.stack?.stop()
})

describe('whiteboard IT harness', () => {
  it('the node runTool helper sends a real MANDARAX_SESSION_HEADER', async () => {
    const res = await runTool(state.echoBase, sessionId('xyz'), 'whiteboard.ping', {})
    expect((await res.json()) as {seen: unknown}).toEqual({seen: 'mandarax_xyz'})
  })

  it('bundles a browser fixture and serves it on a fresh port', async () => {
    const js = await bundleFixture(join(here, 'fixtures/harness-smoke-fixture.ts'))
    state.page = await servePage(pageHtml(js, state.stack!.core, '<p id="out"></p>'), state.stack!.sync.hooks)
    const page = await state.browser!.newPage()
    await page.goto(`${state.page.base}/`)
    await page.getByText(`core ${state.stack!.core}`).waitFor({state: 'visible', timeout: 15_000})
    await page.close()
  })
})
