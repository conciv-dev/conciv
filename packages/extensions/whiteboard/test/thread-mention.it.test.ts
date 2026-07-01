import {test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

// The TipTap composer runs inside the comment overlay's shadow root. Typing "@Op" must open the
// participant listbox (ProseMirror's shadow-DOM selection support is why this works at all), selecting
// inserts a mention chip, and submitting stores it so the rendered reply shows the @mention. Proves §11
// end to end where a textarea-caret or Slate/Lexical approach would fail.
test('the mention composer lists participants and stores a mention in the shadow overlay', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await api.callTool('comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'root note'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
      authorModel: 'Opus',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 15_000})
    await pin.focus()
    await pin.press('Enter')

    const editor = api.page.getByRole('textbox', {name: 'Reply'})
    await editor.waitFor()
    await editor.focus()
    await api.page.keyboard.type('ping @Op')

    await api.page.getByRole('option', {name: 'Opus'}).waitFor({timeout: 10_000})
    await api.page.keyboard.press('Enter')
    await api.page.getByText('@Opus').waitFor()

    await api.page.keyboard.press('Enter')

    // The submitted reply renders the stored mention part as a chip; the editor cleared, so the only
    // remaining @Opus is the persisted comment.
    await api.page.getByText('ping').waitFor({timeout: 10_000})
    await api.page.getByText('@Opus').waitFor()
  } finally {
    await api.dispose()
  }
})
