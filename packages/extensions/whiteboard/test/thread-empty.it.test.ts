import {expect, test} from 'vitest'
import {bootWhiteboard, createFloatingComment, openCanvas} from './helpers/whiteboard-test-api.js'

test('the thread card closes when its root comment is gone, leaving no empty header', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'open then vanish')

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})
    await pin.focus()
    await pin.press('Enter')
    await api.page.getByRole('button', {name: 'Close thread'}).waitFor({timeout: 30_000})

    await api.callTool('comment.delete', {cid})

    await expect
      .poll(async () => api.page.getByRole('button', {name: 'Close thread'}).count(), {timeout: 30_000})
      .toBe(0)
    expect(await api.page.getByRole('button', {name: 'Resolve thread'}).count()).toBe(0)
  } finally {
    await api.dispose()
  }
})
