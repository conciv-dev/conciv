import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

// Regression: an open thread whose root comment disappears must close the card, not leave a bare header
// toolbar floating ("stays open"). The popover is gated on the root still existing.
test('the thread card closes when its root comment is gone, leaving no empty header', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await api.callTool('comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'open then vanish'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 15_000})
    await pin.focus()
    await pin.press('Enter')
    await api.page.getByRole('button', {name: 'Close thread'}).waitFor({timeout: 10_000})

    await api.callTool('comment.delete', {cid})

    await expect
      .poll(async () => api.page.getByRole('button', {name: 'Close thread'}).count(), {timeout: 10_000})
      .toBe(0)
    expect(await api.page.getByRole('button', {name: 'Resolve thread'}).count()).toBe(0)
  } finally {
    await api.dispose()
  }
})
