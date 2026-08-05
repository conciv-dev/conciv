import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit()
  host = await serveHost(() =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: '<div id="probe">page-bus-ok</div><h1 id="title">Embed page</h1>',
    }),
  )
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openHostPage(): Promise<Page> {
  const page = await browser.newPage()
  const subscribed = page.waitForResponse((response) => response.url().endsWith('/rpc/page/queries'), {
    timeout: 30_000,
  })
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
  await subscribed
  return page
}

describe('startPagePlane executes core page verbs in the browser', () => {
  it('round-trips page.run text through rpc.page.queries to the DOM driver', async () => {
    const page = await openHostPage()
    expect(await kit.rpc.page.run({verb: 'text', selector: '#probe'})).toMatchObject({text: 'page-bus-ok'})
    await page.close()
  })

  it('a verb whose target does not exist rejects with a declared code, not a success-shaped string', async () => {
    const page = await openHostPage()
    await expect(kit.rpc.page.run({verb: 'text', selector: '#not-here'})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: 'no element for selector #not-here',
    })
    await page.close()
  })

  it('snapshot verb sees host page structure', async () => {
    const page = await openHostPage()
    expect(JSON.stringify(await kit.rpc.page.run({verb: 'snapshot'}))).toContain('Embed page')
    await page.close()
  })
})
