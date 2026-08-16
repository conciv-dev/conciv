import {expect, test} from '@playwright/test'
import {rpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {setupWidgetSuite, type WidgetSuite} from './helpers/suite.js'
import {openPanelOnNewSession} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Reply that no test waits for'
const TYPED_TEXT = 'the only draft this pane ever stores'
const DRAFT_WRITE_TIMEOUT_MS = 15_000

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

async function storedDraftText(widget: WidgetSuite, sessionId: string): Promise<string | null> {
  const row = await widget.kit().rpc.drafts.get({sessionId})
  return row?.text ?? null
}

test.describe('an empty composer stores nothing', () => {
  test('writes the first draft only once the user types, never on mount', async ({page}) => {
    test.setTimeout(120_000)
    const drafts = rpcCallCursor(page)
    const sessionId = await openPanelOnNewSession(page, suite)

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(TYPED_TEXT)
    await expect.poll(() => storedDraftText(suite, sessionId), {timeout: DRAFT_WRITE_TIMEOUT_MS}).toBe(TYPED_TEXT)

    expect(drafts.startedSince(['drafts', 'set'])).toBe(1)
  })
})
