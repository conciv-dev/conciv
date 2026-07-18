import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const create = async (
  api: Awaited<ReturnType<typeof getExtensionTestApi>>,
  text: string,
  model: string,
): Promise<void> => {
  await api.callTool('comment.create', {
    cid: crypto.randomUUID(),
    kind: 'floating',
    parts: [{type: 'text', text}],
    x: 200,
    y: 200,
    authorKind: 'ai',
    authorModel: model,
  })
}

test('the inbox lists threads, marks all read, and opens a thread', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await create(api, 'first inbox note', 'Opus')
    await create(api, 'second inbox note', 'Sonnet')
    await api.page
      .getByRole('button', {name: /comment, open/})
      .first()
      .waitFor({timeout: 30_000})

    const toggle = api.page.getByRole('button', {name: 'Toggle comments inbox'})
    await toggle.focus()
    await toggle.press('Enter')

    await api.page.getByText('first inbox note').waitFor({timeout: 30_000})
    await api.page.getByText('second inbox note').waitFor()
    expect(await api.page.getByRole('button', {name: /unread/}).count()).toBeGreaterThan(0)

    const markAll = api.page.getByRole('button', {name: 'Mark all as read'})
    await markAll.focus()
    await markAll.press('Enter')
    await expect.poll(async () => api.page.getByRole('button', {name: /unread/}).count(), {timeout: 30_000}).toBe(0)

    const item = api.page.getByRole('button', {name: /^Opus/})
    await item.focus()
    await item.press('Enter')
    await api.page.getByRole('textbox', {name: 'Reply'}).waitFor({timeout: 30_000})
  } finally {
    await api.dispose()
  }
})
