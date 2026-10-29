import {expect, test, type Page} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Read the pipeline.'
const RESULT_MARKER = 'pipeline body renders on the built bundle'

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

async function sendAndOpenTrace(page: Page, message: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  await expect(page.getByRole('button', {name: /Hide trace$/}).last()).toBeVisible({timeout: 30_000})
}

test.describe('tool result code bodies on the built bundle', () => {
  test('renders the lines of a tool result code body', async ({page}) => {
    test.setTimeout(180_000)
    suite.kit().harness.script.scriptTurn({
      toolCalls: [{name: 'Read', input: {filePath: 'pipeline.ts'}, result: RESULT_MARKER}],
      text: ASSISTANT_TEXT,
    })
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await sendAndOpenTrace(page, 'read the pipeline file')

    await expect(page.getByText(RESULT_MARKER).first()).toBeVisible({timeout: 30_000})
  })
})
