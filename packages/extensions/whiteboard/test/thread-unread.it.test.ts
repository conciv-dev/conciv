import {expect, test} from 'vitest'
import {bootWhiteboard, createFloatingComment, openCanvas} from './helpers/whiteboard-test-api.js'

test('an agent comment is unread until the dev opens it', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    await createFloatingComment(api, crypto.randomUUID(), 'please review', {authorModel: 'Opus'})

    const unread = api.page.getByRole('button', {name: /comment, open, unread/})
    await unread.waitFor({timeout: 30_000})

    await unread.focus()
    await unread.press('Enter')

    await expect.poll(async () => api.page.getByRole('button', {name: /unread/}).count(), {timeout: 30_000}).toBe(0)
    await api.page.getByRole('button', {name: /comment, open/}).waitFor()
  } finally {
    await api.dispose()
  }
})
