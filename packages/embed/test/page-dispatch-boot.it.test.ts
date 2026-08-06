import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {z} from 'zod'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'

const HOST_BODY = `
  <div id="probe">page-bus-ok</div>
  <h1 id="title">Embed page</h1>
  <button id="press-btn" onclick="document.getElementById('clicked-flag').textContent='clicked'">Press target</button>
  <output id="clicked-flag"></output>
`

const SnapshotSchema = z.object({
  nodes: z.array(z.looseObject({ref: z.string(), role: z.string(), name: z.string().optional()})),
})

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit()
  host = await serveHost(() => handleHostPage(HOST_BODY))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function buttonRef(): Promise<string> {
  const snapshot = SnapshotSchema.parse(await kit.rpc.registry.call({name: 'page.snapshot', input: {}}))
  const node = snapshot.nodes.find((entry) => entry.role === 'button' && entry.name === 'Press target')
  if (!node) throw new Error('the snapshot did not list the press button')
  return node.ref
}

describe('the page-tool dispatcher serves registry page tools under bootConnect', () => {
  let page: Page

  beforeAll(async () => {
    page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.evaluate(() => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      window.concivTestHandle = window.ConcivHandle.makeConnectHandle()
      void window.concivTestHandle.mount(el)
    })
    await expectLocator(page.getByRole('status', {name: 'connect pane ready'})).toBeVisible({timeout: 30_000})
    const subscribed = page.waitForResponse((response) => response.url().endsWith('/rpc/page/queries'), {
      timeout: 30_000,
    })
    await page.evaluate(
      (base) => window.dispatchEvent(new CustomEvent('embedtest:connect', {detail: {base}})),
      kit.base,
    )
    await subscribed
  }, 60_000)

  afterAll(async () => {
    await page.close()
  })

  it('a plain read round-trips server -> browser -> result', async () => {
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#probe'}})).resolves.toMatchObject({
      text: 'page-bus-ok',
    })
  })

  it('a mutating tool acts on the page, journals by declared meta, and fires the browser mirror', async () => {
    await expect(kit.rpc.registry.call({name: 'page.click', input: {selector: '#press-btn'}})).resolves.toMatchObject({
      ok: true,
    })
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#clicked-flag'}})).resolves.toMatchObject(
      {text: 'clicked'},
    )
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toContain('page.click')
    await expectLocator(page.locator('[data-conciv-cursor]')).toHaveCount(1, {timeout: 10_000})
  })

  it('a ref-consuming tool resolves its target through the shared refs machinery', async () => {
    const ref = await buttonRef()
    await expect(kit.rpc.registry.call({name: 'page.attr', input: {ref, attribute: 'id'}})).resolves.toMatchObject({
      value: 'press-btn',
    })
  })

  it('a missing target rejects with the transport invalid-args mapping, not a success shape', async () => {
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#not-here'}})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    })
  })

  describe('the page.effect verb drives host-registered effects', () => {
    it('lists the highlight effect the widget registers', async () => {
      await expect(kit.rpc.registry.call({name: 'page.effect', input: {action: 'list'}})).resolves.toMatchObject({
        effects: [{name: 'highlight', enabled: false}],
      })
    })

    it('enable shows the highlight inspector on the page, disable reverts, toggle flips', async () => {
      await expect(
        kit.rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expectLocator(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page.effect', input: {action: 'disable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expectLocator(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page.effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expectLocator(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page.effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expectLocator(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})
    })

    it('an unknown effect name rejects with the declared error', async () => {
      await expect(
        kit.rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'confetti'}}),
      ).rejects.toMatchObject({code: 'UNKNOWN_EFFECT'})
    })
  })
})
