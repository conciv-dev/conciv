import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

// Deleting a thread root cascades: the root, every reply, and the canvas pin all disappear. Proves the
// §10 server-side threadId cascade (the client header trash shares the same intent).
test('deleting a thread root removes its replies and pin', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await api.callTool('comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'thread to delete'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
    })
    await api.callTool('comment.reply', {cid, parts: [{type: 'text', text: 'a reply that should also go'}]})

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 15_000})

    await api.callTool('comment.delete', {cid})

    await expect.poll(async () => pin.count(), {timeout: 10_000, interval: 200}).toBe(0)
    expect(await api.page.getByText('thread to delete').count()).toBe(0)
    expect(await api.page.getByText('a reply that should also go').count()).toBe(0)
  } finally {
    await api.dispose()
  }
})
