import {expect, test} from 'vitest'
import {bootWhiteboard, createFloatingComment, openCanvas} from './helpers/whiteboard-test-api.js'

test('deleting a thread root removes its replies and pin', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'thread to delete')
    await api.callTool('comment.reply', {cid, parts: [{type: 'text', text: 'a reply that should also go'}]})

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})

    await api.callTool('comment.delete', {cid})

    await expect.poll(async () => pin.count(), {timeout: 30_000, interval: 200}).toBe(0)
    expect(await api.page.getByText('thread to delete').count()).toBe(0)
    expect(await api.page.getByText('a reply that should also go').count()).toBe(0)
  } finally {
    await api.dispose()
  }
})
