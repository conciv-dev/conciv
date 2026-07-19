import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const openInbox = async (page: Page): Promise<void> => {
  const toggle = page.getByRole('button', {name: 'Toggle comments inbox'})
  await toggle.focus()
  await toggle.press('Enter')
}

test('the inbox shows empty, single-comment, and no-results edge states', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await openInbox(api.page)
    await api.page.getByText('No comments yet').waitFor({timeout: 30_000})

    await api.callTool('comment.create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text: 'a lonely note'}],
      x: 200,
      y: 200,
      authorKind: 'ai',
      authorModel: 'Opus',
    })
    const item = api.page.getByRole('button', {name: /^Opus/})
    await item.waitFor({timeout: 30_000})
    expect((await item.innerText()).toLowerCase()).not.toContain('repl')

    const search = api.page.getByRole('textbox', {name: 'Quick search'})
    await search.focus()
    await api.page.keyboard.type('zzznomatch')
    await api.page.getByText(/No comments match/).waitFor({timeout: 30_000})
  } finally {
    await api.dispose()
  }
})
