import {test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {bootWhiteboard, createFloatingComment, openCanvas} from './canvas-it-helpers.js'

test('clicking a pin opens the thread card with its comment and replies', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'agent left a note', {authorModel: 'Opus'})

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})
    await pin.focus()
    await pin.press('Enter')

    await api.page.getByText('agent left a note').waitFor({timeout: 30_000})
    await api.page.getByText('Opus').waitFor()

    const reply = api.page.getByRole('textbox', {name: 'Reply'})
    await reply.waitFor()
    await expectLocator(reply).toBeFocused({timeout: 30_000})

    for (const name of ['Previous thread', 'Next thread', 'Resolve thread', 'Delete thread', 'Close thread'])
      await api.page.getByRole('button', {name}).waitFor()

    await api.callToolApproved('comment.reply', {
      cid,
      parts: [{type: 'text', text: 'and here is a reply'}],
      authorKind: 'ai',
      authorModel: 'Opus',
    })
    await api.page.getByText('and here is a reply').waitFor({timeout: 30_000})
  } finally {
    await api.dispose()
  }
})
