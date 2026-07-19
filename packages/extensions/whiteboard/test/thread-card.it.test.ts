import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

test('clicking a pin opens the thread card with its comment and replies', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await api.callTool('comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'agent left a note'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
      authorModel: 'Opus',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})
    await pin.focus()
    await pin.press('Enter')

    await api.page.getByText('agent left a note').waitFor({timeout: 30_000})
    await api.page.getByText('Opus').waitFor()

    const reply = api.page.getByRole('textbox', {name: 'Reply'})
    await reply.waitFor()
    await expect.poll(async () => reply.evaluate((element) => element.matches(':focus')).catch(() => false)).toBe(true)

    for (const name of ['Previous thread', 'Next thread', 'Resolve thread', 'Delete thread', 'Close thread'])
      await api.page.getByRole('button', {name}).waitFor()

    await api.callTool('comment.reply', {
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
