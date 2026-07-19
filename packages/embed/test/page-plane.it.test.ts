import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
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

describe('startPagePlane executes core page verbs in the browser', () => {
  it('round-trips page.run text through rpc.page.queries to the DOM driver', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
    await expect
      .poll(
        async () => {
          const body = await kit.rpc.page.run({verb: 'text', selector: '#probe'}).catch(() => null)
          return body !== null && 'text' in body ? body.text : null
        },
        {timeout: 30_000},
      )
      .toBe('page-bus-ok')
    await page.close()
  })

  it('snapshot verb sees host page structure', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
    await expect
      .poll(
        async () => {
          const body = await kit.rpc.page.run({verb: 'snapshot'}).catch(() => null)
          return body === null ? '' : JSON.stringify(body)
        },
        {timeout: 30_000},
      )
      .toContain('Embed page')
    await page.close()
  })
})
