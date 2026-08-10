import {expect, test, type Page} from '@playwright/test'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit()
  host = await serveHost(() =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: '<div id="probe">page-bus-ok</div><h1 id="title">Embed page</h1>',
    }),
  )
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

async function openHostPage(page: Page): Promise<Page> {
  const observer = observeRpc(page)
  const subscribed = observer.completed({path: ['page', 'queries'], timeout: 30_000})
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
  await subscribed
  observer.dispose()
  return page
}

test.describe('startPagePlane executes registry page tools in the browser', () => {
  test('round-trips page.text through rpc.page.queries to the DOM dispatcher', async ({page}) => {
    await openHostPage(page)
    expect(await kit.rpc.registry.call({name: 'page.text', input: {selector: '#probe'}})).toMatchObject({
      text: 'page-bus-ok',
    })
  })

  test('a verb whose target does not exist rejects with a declared code, not a success-shaped string', async ({
    page,
  }) => {
    await openHostPage(page)
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#not-here'}})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: 'page.text: no element for selector #not-here',
    })
  })

  test('the snapshot tool sees host page structure', async ({page}) => {
    await openHostPage(page)
    expect(JSON.stringify(await kit.rpc.registry.call({name: 'page.snapshot', input: {}}))).toContain('Embed page')
  })
})
