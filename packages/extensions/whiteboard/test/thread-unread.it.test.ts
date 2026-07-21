import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

test('an agent comment is unread until the dev opens it', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
  try {
    await openCanvas(api.page)
    await api.callTool('comment.create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text: 'please review'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
      authorModel: 'Opus',
    })

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
