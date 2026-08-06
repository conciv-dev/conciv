import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {z} from 'zod'
import {pageSpike} from './fixtures/page-spike.js'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'

const SPIKE_BODY = `
  <div id="probe">page-bus-ok</div>
  <h1 id="title">Embed page</h1>
  <button id="spike-btn" onclick="document.getElementById('clicked-flag').textContent='clicked'">Spike click target</button>
  <output id="clicked-flag"></output>
`

const SnapshotSchema = z.object({
  nodes: z.array(z.object({ref: z.string(), role: z.string(), name: z.string().optional()})),
})

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({extensions: [pageSpike]})
  host = await serveHost(() => handleHostPage(SPIKE_BODY))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function buttonRef(): Promise<string> {
  const snapshot = SnapshotSchema.parse(await kit.rpc.page.run({verb: 'snapshot'}))
  const node = snapshot.nodes.find((entry) => entry.role === 'button' && entry.name === 'Spike click target')
  if (!node) throw new Error('the snapshot did not list the spike button')
  return node.ref
}

describe('the page-tool dispatcher runs .client() bodies from server-initiated tool queries under bootConnect', () => {
  let page: Page

  beforeAll(async () => {
    page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.evaluate(() => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      window.concivTestHandle = window.ConcivHandle.makeSpikeConnectHandle()
      void window.concivTestHandle.mount(el)
    })
    await expectLocator(page.getByRole('status', {name: 'spike connect pane ready'})).toBeVisible({timeout: 30_000})
    const subscribed = page.waitForResponse((response) => response.url().endsWith('/rpc/page/queries'), {
      timeout: 30_000,
    })
    await page.evaluate((base) => window.dispatchEvent(new CustomEvent('spike:connect', {detail: {base}})), kit.base)
    await subscribed
  }, 60_000)

  afterAll(async () => {
    await page.close()
  })

  it('a plain read round-trips server -> browser -> result', async () => {
    await expect(kit.registry.call('pagespike.text', {selector: '#probe'})).resolves.toMatchObject({
      text: 'page-bus-ok',
    })
  })

  it('a mutating verb acts on the page, journals by declared meta, and fires the browser mirror', async () => {
    await expect(kit.registry.call('pagespike.click', {selector: '#spike-btn'})).resolves.toMatchObject({
      clicked: true,
    })
    await expect(kit.registry.call('pagespike.text', {selector: '#clicked-flag'})).resolves.toMatchObject({
      text: 'clicked',
    })
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toContain('pagespike.click')
    await expectLocator(page.locator('[data-conciv-cursor]')).toHaveCount(1, {timeout: 10_000})
  })

  it('a ref-consuming verb resolves its target through the shared refs machinery', async () => {
    const ref = await buttonRef()
    await expect(kit.registry.call('pagespike.attr', {ref, attribute: 'id'})).resolves.toMatchObject({
      value: 'spike-btn',
    })
  })

  it('a body-thrown toolError rebuilds into the declared error server-side', async () => {
    const ref = await buttonRef()
    await expect(kit.registry.call('pagespike.attr', {ref, attribute: 'data-none'})).rejects.toMatchObject({
      code: 'NO_ATTRIBUTE',
    })
  })

  it('a missing target rejects with the transport invalid-args mapping, not a success shape', async () => {
    await expect(kit.registry.call('pagespike.text', {selector: '#not-here'})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    })
  })
})

describe('the dispatcher also serves the plain apiBase boot', () => {
  it('round-trips a spike read under bootNormal', async () => {
    const page = await browser.newPage()
    const subscribed = page.waitForResponse((response) => response.url().endsWith('/rpc/page/queries'), {
      timeout: 30_000,
    })
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.evaluate((base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      void window.ConcivHandle.makeSpikeHandle(base).mount(el)
    }, kit.base)
    await subscribed
    await expect(kit.registry.call('pagespike.text', {selector: '#title'})).resolves.toMatchObject({
      text: 'Embed page',
    })
    await page.close()
  })
})
