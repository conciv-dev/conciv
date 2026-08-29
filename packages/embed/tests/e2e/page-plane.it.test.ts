import {expect, test, type Page} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {openPagePlaneHost} from './helpers/page-plane-host.js'

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

const openHostPage = (page: Page): Promise<Page> => openPagePlaneHost(page, host.base)

test.describe('startPagePlane executes registry page tools in the browser', () => {
  test('round-trips page_text through rpc.page.queries to the DOM dispatcher', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    expect(await kit.rpc.registry.call({name: 'page_text', input: {selector: '#probe'}})).toMatchObject({
      text: 'page-bus-ok',
    })
  })

  test('a verb whose target does not exist rejects with a declared code, not a success-shaped string', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    await expect(kit.rpc.registry.call({name: 'page_text', input: {selector: '#not-here'}})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: 'page_text: no element for selector #not-here',
    })
  })

  test('the snapshot tool sees host page structure', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    expect(JSON.stringify(await kit.rpc.registry.call({name: 'page_snapshot', input: {}}))).toContain('Embed page')
  })
})
