import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel, sendMessage} from './helpers/panel.js'

const ASSISTANT_REPLY = [
  'Here is the fix:',
  '',
  '```ts',
  'const greeting: string = "hello from the highlighter"',
  '```',
].join('\n')

const MESSAGE_TEXT = 'show me the fix'

const suite = setupWidgetSuite({text: ASSISTANT_REPLY})

test.describe('code fences highlight through the worker on the built bundle', () => {
  test('renders a shiki-highlighted code block for the fenced reply', async ({page}) => {
    test.setTimeout(120_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await sendMessage(page, MESSAGE_TEXT, 'Here is the fix:')

    const highlighted = page.locator('pre.shiki span[style*="color"]').first()
    await expect(highlighted).toBeVisible({timeout: 30_000})
  })
})
