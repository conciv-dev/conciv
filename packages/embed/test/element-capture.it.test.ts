import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import type {SessionCaptures} from '@conciv/protocol/element-capture-types'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPagePlaneHost} from './helpers/page-plane-host.js'

const PASSWORD = 'hunter2-must-never-leave-the-page'

const HOST_BODY = `
  <style>.panel .cta {color: rgb(1, 2, 3);}</style>
  <section id="panel" class="panel theme-light">
    <button id="cta" class="cta">Send it</button>
    <p id="prose">original prose</p>
    <input id="secret" type="password" autocomplete="current-password" value="${PASSWORD}">
  </section>
`

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}
let sessionId: string

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit()
  sessionId = await kit.session()
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

const openHostPage = (): Promise<Page> => openPagePlaneHost(browser, host.base)

function rowIdentities(stored: SessionCaptures): string[] {
  return stored.captures.map((row) => `${row.toolCallId}:${row.kind}:${JSON.stringify(row.capture)}`).toSorted()
}

describe('a page tool run through the widget stores a frozen picture of the element it touched', () => {
  it('keeps the pre-edit element after the page flips its theme and deletes the node', async () => {
    const page = await openHostPage()
    await kit.callTool('page.settext', {selector: '#prose', text: 'rewritten by the agent'}, sessionId)

    await page.evaluate(() => {
      document.querySelector('#panel')?.classList.replace('theme-light', 'theme-dark')
      document.querySelector('#prose')?.remove()
    })

    const stored: SessionCaptures = await kit.rpc.captures.list({sessionId})
    const edit = stored.captures.filter((row) => row.capture.descriptor.selectorPath.includes('prose'))
    expect(edit.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
    const before = edit.find((row) => row.kind === 'before')
    const after = edit.find((row) => row.kind === 'after')
    expect(before?.capture.descriptor.accessibleName).toBe('original prose')
    expect(after?.capture.descriptor.accessibleName).toBe('rewritten by the agent')
    expect(JSON.stringify(before?.capture.node)).toContain('theme-light')
    expect(JSON.stringify(before?.capture.node)).not.toContain('theme-dark')
    expect(JSON.stringify(before?.capture.node)).toContain('data-rr-target')
    expect(JSON.stringify(after?.capture.node)).toContain('theme-light')
    expect(JSON.stringify(after?.capture.node)).not.toContain('theme-dark')
    const cssBundleId = before?.capture.cssBundleId
    expect(cssBundleId === undefined ? '' : stored.cssBundles[cssBundleId]).toContain('.panel .cta')
    await page.close()
  }, 60_000)

  it('never lets a password value reach the stored capture or the tool result', async () => {
    const page = await openHostPage()
    const result = await kit.callTool('page.fill', {selector: '#secret', value: 'typed by the agent'}, sessionId)
    const stored: SessionCaptures = await kit.rpc.captures.list({sessionId})
    const secretCaptures = stored.captures.filter((row) => row.capture.descriptor.selectorPath.includes('secret'))
    expect(secretCaptures.map((row) => row.kind).toSorted()).toEqual(['after'])
    for (const row of secretCaptures) expect(JSON.stringify(row.capture)).not.toContain(PASSWORD)
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
    expect(JSON.stringify(stored)).not.toContain(PASSWORD)
    await page.close()
  }, 60_000)

  it('hands the harness a result with no capture in it', async () => {
    const page = await openHostPage()
    const result = await kit.callTool('page.click', {selector: '#cta'}, sessionId)
    expect(JSON.stringify(result)).not.toContain('cssBundleId')
    expect(JSON.stringify(result)).not.toContain('selectorPath')
    expect(JSON.stringify(result)).not.toContain('data-rr-target')
    await page.close()
  }, 60_000)

  it('takes no capture for a read verb', async () => {
    const page = await openHostPage()
    const before: SessionCaptures = await kit.rpc.captures.list({sessionId})
    await kit.callTool('page.text', {selector: '#cta'}, sessionId)
    const after: SessionCaptures = await kit.rpc.captures.list({sessionId})
    expect(rowIdentities(after)).toEqual(rowIdentities(before))
    await page.close()
  }, 60_000)
})
