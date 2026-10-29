import {expect, test, type Page} from '@playwright/test'
import {z} from 'zod'
import {completeConnectHandshake} from '@conciv/extension-testkit/connect-handshake'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'

const HOST_BODY = `
  <div id="probe">page-bus-ok</div>
  <h1 id="title">Embed page</h1>
  <button id="press-btn" onclick="document.getElementById('clicked-flag').textContent='clicked'">Press target</button>
  <output id="clicked-flag"></output>
`

const SnapshotSchema = z.object({
  nodes: z.array(z.looseObject({ref: z.string(), role: z.string(), name: z.string().optional()})),
})

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit()
  host = await serveHost(() => handleHostPage(HOST_BODY))
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

async function buttonRef(): Promise<string> {
  const snapshot = SnapshotSchema.parse(await kit.rpc.registry.call({name: 'page_snapshot', input: {}}))
  const node = snapshot.nodes.find((entry) => entry.role === 'button' && entry.name === 'Press target')
  if (!node) throw new Error('the snapshot did not list the press button')
  return node.ref
}

test.describe('the page-tool dispatcher serves registry page tools under bootConnect', () => {
  let page: Page

  test.beforeAll(async ({browser}) => {
    page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.evaluate(() => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      window.concivTestHandle = window.ConcivHandle.makeConnectHandle()
      void window.concivTestHandle.mount(el)
    })
    await completeConnectHandshake(page, kit.base, await kit.session())
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('a plain read round-trips server -> browser -> result', async () => {
    await expect(kit.rpc.registry.call({name: 'page_text', input: {selector: '#probe'}})).resolves.toMatchObject({
      text: 'page-bus-ok',
    })
  })

  test('a mutating tool acts on the page, journals by declared meta, and fires the browser mirror', async () => {
    await expect(kit.rpc.registry.call({name: 'page_click', input: {selector: '#press-btn'}})).resolves.toMatchObject({
      ok: true,
    })
    await expect(kit.rpc.registry.call({name: 'page_text', input: {selector: '#clicked-flag'}})).resolves.toMatchObject(
      {text: 'clicked'},
    )
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toContain('page_click')
    await expect(page.locator('[data-conciv-cursor]')).toHaveCount(1, {timeout: 10_000})
  })

  test('a ref-consuming tool resolves its target through the shared refs machinery', async () => {
    const ref = await buttonRef()
    await expect(kit.rpc.registry.call({name: 'page_attr', input: {ref, attribute: 'id'}})).resolves.toMatchObject({
      value: 'press-btn',
    })
  })

  test('a missing target rejects with the transport invalid-args mapping, not a success shape', async () => {
    await expect(kit.rpc.registry.call({name: 'page_text', input: {selector: '#not-here'}})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    })
  })

  test.describe('the page_effect verb drives host-registered effects', () => {
    test('lists the highlight effect the widget registers', async () => {
      await expect(kit.rpc.registry.call({name: 'page_effect', input: {action: 'list'}})).resolves.toMatchObject({
        effects: [{name: 'highlight', enabled: false}],
      })
    })

    test('enable shows the highlight inspector on the page, disable reverts, toggle flips', async () => {
      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'enable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'disable', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: true})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(1, {timeout: 10_000})

      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'toggle', effect: 'highlight'}}),
      ).resolves.toMatchObject({effect: 'highlight', enabled: false})
      await expect(page.locator('[data-conciv-capture]')).toHaveCount(0, {timeout: 10_000})
    })

    test('an unknown effect name rejects with the declared error', async () => {
      await expect(
        kit.rpc.registry.call({name: 'page_effect', input: {action: 'enable', effect: 'confetti'}}),
      ).rejects.toMatchObject({code: 'UNKNOWN_EFFECT'})
    })
  })
})
