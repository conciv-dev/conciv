import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const ANCHOR_NULL = 'thread anchor is null while open'

test('the human compose flow opens an anchored thread without a null anchor', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
  const anchorWarnings: string[] = []
  api.page.on(
    'console',
    (message) =>
      message.type() === 'warning' && message.text().includes(ANCHOR_NULL) && anchorWarnings.push(message.text()),
  )
  try {
    await openCanvas(api.page)

    await api.page
      .getByRole('button', {name: 'Comment on an element'})
      .evaluate((element: HTMLElement) => element.click())
    await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())

    const field = api.page.getByRole('textbox', {name: 'Comment'})
    await field.waitFor({timeout: 30_000})
    await field.focus()
    await api.page.keyboard.type('a fresh note')
    await api.page.keyboard.press('Enter')

    const note = api.page.getByText('a fresh note')
    await note.waitFor({timeout: 30_000})
    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 30_000})

    const noteBox = await note.boundingBox()
    const pinBox = await pin.boundingBox()
    expect(noteBox).not.toBeNull()
    expect(pinBox).not.toBeNull()
    expect(noteBox?.x ?? 0).toBeGreaterThanOrEqual(pinBox?.x ?? 0)
    expect(anchorWarnings).toEqual([])
  } finally {
    await api.dispose()
  }
})
