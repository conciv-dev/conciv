import {expect, test, type Page} from '@playwright/test'
import {z} from 'zod'
import {completeConnectHandshake} from '@conciv/extension-testkit/connect-handshake'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage, hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {openPagePlaneHost} from './helpers/page-plane-host.js'

const HOST_BODY = `
  <div id="probe">page-bus-ok</div>
  <h1 id="title">Embed page</h1>
  <button id="press-btn" onclick="document.getElementById('clicked-flag').textContent='clicked'">Press target</button>
  <output id="clicked-flag"></output>
`

const SnapshotSchema = z.object({
  nodes: z.array(z.looseObject({ref: z.string(), role: z.string(), name: z.string().optional()})),
})

const ChangesSchema = z.array(z.object({verb: z.string()}).loose())

type BootedPath = {kit: EmbedKit; page: Page}

async function buttonRef(kit: EmbedKit): Promise<string> {
  const snapshot = SnapshotSchema.parse(await kit.rpc.registry.call({name: 'page.snapshot', input: {}}))
  const node = snapshot.nodes.find((entry) => entry.role === 'button' && entry.name === 'Press target')
  if (!node) throw new Error('the snapshot did not list the press button')
  return node.ref
}

function verbGroupBattery(boot: () => BootedPath): void {
  test('read: page.text reports the live DOM', async () => {
    const {kit} = boot()
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#probe'}})).resolves.toMatchObject({
      text: 'page-bus-ok',
    })
  })

  test('read: page.attr resolves a snapshot ref through the shared refs machinery', async () => {
    const {kit} = boot()
    const ref = await buttonRef(kit)
    await expect(kit.rpc.registry.call({name: 'page.attr', input: {ref, attribute: 'id'}})).resolves.toMatchObject({
      value: 'press-btn',
    })
  })

  test('react: page.locate fails structurally on a page without a React tree', async () => {
    const {kit} = boot()
    await expect(kit.rpc.registry.call({name: 'page.locate', input: {selector: '#title'}})).rejects.toMatchObject({
      code: 'HANDLER_ERROR',
      message: expect.stringContaining('no React fiber'),
    })
  })

  test('act: page.click acts on the page, journals, and fires the browser mirror', async () => {
    const {kit, page} = boot()
    await expect(kit.rpc.registry.call({name: 'page.click', input: {selector: '#press-btn'}})).resolves.toMatchObject({
      ok: true,
    })
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#clicked-flag'}})).resolves.toMatchObject(
      {text: 'clicked'},
    )
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(changes.map((entry) => entry.verb)).toContain('page.click')
    await expect(page.locator('[data-conciv-cursor]')).toHaveCount(1, {timeout: 10_000})
  })

  test('edit-live: page.settext rewrites the DOM and journals by declared meta', async () => {
    const {kit} = boot()
    await expect(
      kit.rpc.registry.call({name: 'page.settext', input: {selector: '#title', text: 'Rewritten title'}}),
    ).resolves.toMatchObject({ok: true})
    await expect(kit.rpc.registry.call({name: 'page.text', input: {selector: '#title'}})).resolves.toMatchObject({
      text: 'Rewritten title',
    })
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(changes.map((entry) => entry.verb)).toContain('page.settext')
  })
}

test.describe('bootNormal: the widget embed serves every verb group through the dispatcher', () => {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}
  let page: Page

  test.beforeAll(async ({browser}) => {
    kit = await bootEmbedKit()
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
    page = await browser.newPage()
    await openPagePlaneHost(page, host.base)
  })

  test.afterAll(async () => {
    await page.close()
    await host.close()
    await kit.cleanup()
  })

  test.afterEach(async () => {
    await kit.rpc.page.clearChanges(undefined)
  })

  verbGroupBattery(() => ({kit, page}))
})

test.describe('bootConnect: the connect handle serves the same verb groups through the dispatcher', () => {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}
  let page: Page

  test.beforeAll(async ({browser}) => {
    kit = await bootEmbedKit()
    host = await serveHost(() => handleHostPage(HOST_BODY))
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
    await host.close()
    await kit.cleanup()
  })

  test.afterEach(async () => {
    await kit.rpc.page.clearChanges(undefined)
  })

  verbGroupBattery(() => ({kit, page}))
})
