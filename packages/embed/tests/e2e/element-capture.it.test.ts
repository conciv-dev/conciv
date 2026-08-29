import {expect, test, type Page} from '@playwright/test'
import type {SessionCaptures} from '@conciv/protocol/element-capture-types'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {openPagePlaneHost} from './helpers/page-plane-host.js'
import {openPanel} from './helpers/panel.js'

const PASSWORD = 'hunter2-must-never-leave-the-page'

const HOST_BODY = `
  <style>.panel .cta {color: rgb(1, 2, 3);}</style>
  <section id="panel" class="panel theme-light">
    <button id="cta" class="cta">Send it</button>
    <p id="prose">original prose</p>
    <input id="secret" type="password" autocomplete="current-password" value="${PASSWORD}">
  </section>
`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}
let sessionId: string

test.beforeAll(async () => {
  kit = await bootEmbedKit()
  sessionId = await kit.session()
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_BODY}))
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

const openHostPage = (page: Page): Promise<Page> => openPagePlaneHost(page, host.base)

function rowIdentities(stored: SessionCaptures): string[] {
  return stored.captures.map((row) => `${row.toolCallId}:${row.kind}:${JSON.stringify(row.capture)}`).toSorted()
}

async function sendAndSettle(page: Page, message: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
}

test.describe('a page tool run through the widget stores a frozen picture of the element it touched', () => {
  test('keeps the pre-edit element after the page flips its theme and deletes the node', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    await kit.callTool('page_settext', {selector: '#prose', text: 'rewritten by the agent'}, sessionId)

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
  })

  test('never lets a password value reach the stored capture or the tool result', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    const result = await kit.callTool('page_fill', {selector: '#secret', value: 'typed by the agent'}, sessionId)
    const stored: SessionCaptures = await kit.rpc.captures.list({sessionId})
    const secretCaptures = stored.captures.filter((row) => row.capture.descriptor.selectorPath.includes('secret'))
    expect(secretCaptures.map((row) => row.kind).toSorted()).toEqual(['after'])
    for (const row of secretCaptures) expect(JSON.stringify(row.capture)).not.toContain(PASSWORD)
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
    expect(JSON.stringify(stored)).not.toContain(PASSWORD)
  })

  test('hands the harness a result with no capture in it', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    const result = await kit.callTool('page_click', {selector: '#cta'}, sessionId)
    expect(JSON.stringify(result)).not.toContain('cssBundleId')
    expect(JSON.stringify(result)).not.toContain('selectorPath')
    expect(JSON.stringify(result)).not.toContain('data-rr-target')
  })

  test('takes no capture for a read verb', async ({page}) => {
    test.setTimeout(90_000)
    await openHostPage(page)
    const before: SessionCaptures = await kit.rpc.captures.list({sessionId})
    await kit.callTool('page_text', {selector: '#cta'}, sessionId)
    const after: SessionCaptures = await kit.rpc.captures.list({sessionId})
    expect(rowIdentities(after)).toEqual(rowIdentities(before))
  })

  test('renders a page verb run through real code mode as one aggregated session card fed by the capture pipeline', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await openHostPage(page)
    await openPanel(page)
    kit.harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "await external_page_settext({selector: '#prose', text: 'rendered through the pipeline'})",
    })
    await sendAndSettle(page, 'rewrite the prose through code mode')
    const sessionCard = page.getByRole('button', {name: /Edited the page/})
    await expect(sessionCard).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('button', {name: /Set the text/})).toHaveCount(0)
    await sessionCard.click()
    const dialog = page.getByRole('dialog', {name: 'conciv chat agent'})
    const stepTarget = dialog.getByText('rendered through the pipeline', {exact: true})
    await expect(stepTarget).toBeVisible({timeout: 30_000})
    await dialog.getByRole('button', {name: 'Script'}).click()
    await expect(dialog.getByText(/external_page_settext/).first()).toBeVisible({timeout: 30_000})
  })
})
