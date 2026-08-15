import {expect, test} from '@playwright/test'
import type {Grab} from '@conciv/grab'
import {GRAB_FILE_NAME, GRAB_MIME, grabToPayload} from '@conciv/grab/grab-attachment'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Parts received'
const GRAB_TEXT = '<h1>Payroll Deposit</h1> at src/routes/index.tsx:12:9'
const MESSAGE_TEXT = 'what is wrong with this element'

const GRAB: Grab = {
  text: GRAB_TEXT,
  snippet: '<h1>Payroll Deposit</h1>',
  preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

const GRAB_JSON = JSON.stringify(grabToPayload(GRAB))

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

test.describe('a send that carries an attachment', () => {
  test('reaches the wire as content parts the wire watcher reports without throwing', async ({page}) => {
    test.setTimeout(120_000)
    const wire = watchRpcWire(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const addAttachment = page.getByRole('button', {name: 'Add attachment'})
    await expect(addAttachment).toBeEnabled({timeout: 30_000})
    const opened = page.waitForEvent('filechooser', {timeout: 30_000})
    await addAttachment.click()
    const chooser = await opened
    await chooser.setFiles({name: GRAB_FILE_NAME, mimeType: GRAB_MIME, buffer: Buffer.from(GRAB_JSON)})
    await expect(page.getByRole('button', {name: 'Open grabbed element'})).toBeVisible({timeout: 30_000})

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(MESSAGE_TEXT)
    const sent = wire.nextChatSend()
    await page.getByRole('button', {name: 'Send message'}).click()

    const frame = await sent
    expect(frame.content).toEqual([
      {type: 'text', content: MESSAGE_TEXT},
      {type: 'document', source: {type: 'data', mimeType: GRAB_MIME, value: Buffer.from(GRAB_JSON).toString('base64')}},
    ])
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
  })
})
