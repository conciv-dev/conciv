import {test} from 'vitest'
import {bootWhiteboard, createFloatingComment, openCanvas} from './helpers/whiteboard-test-api.js'

test('the mention composer lists participants and stores a mention in the shadow overlay', async () => {
  const api = await bootWhiteboard()
  try {
    await openCanvas(api.page)
    const cid = crypto.randomUUID()
    await createFloatingComment(api, cid, 'root note', {authorModel: 'Opus'})

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
