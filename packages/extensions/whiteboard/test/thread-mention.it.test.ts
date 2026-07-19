import {test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

test('the mention composer lists participants and stores a mention in the shadow overlay', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await api.callTool('comment.create', {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'root note'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
      authorModel: 'Opus',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})
    await pin.focus()
    await pin.press('Enter')

    const editor = api.page.getByRole('textbox', {name: 'Reply'})
    await editor.waitFor()
    await editor.focus()
    await api.page.keyboard.type('ping @Op')

    await api.page.getByRole('option', {name: 'Opus'}).waitFor({timeout: 30_000})
    await api.page.keyboard.press('Enter')
    await api.page.getByText('@Opus').waitFor()

    await api.page.keyboard.press('Enter')

    await api.page.getByText('ping').waitFor({timeout: 30_000})
    await api.page.getByText('@Opus').waitFor()
  } finally {
    await api.dispose()
  }
})
