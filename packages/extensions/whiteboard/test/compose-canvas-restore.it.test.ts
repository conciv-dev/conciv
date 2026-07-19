import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas} from './canvas-it-helpers.js'

const canvasToolbar = (page: Page) => page.getByRole('radio', {name: 'Rectangle'})

const pickAndCompose = async (page: Page, text: string): Promise<void> => {
  await page.getByRole('button', {name: 'Comment on an element'}).evaluate((element: HTMLElement) => element.click())
  await page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
  const field = page.getByRole('textbox', {name: 'Comment'})
  await field.waitFor({timeout: 30_000})
  await field.focus()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('picking hides an open canvas and adding the comment restores it', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.page
      .getByRole('button', {name: 'Comment on an element'})
      .evaluate((element: HTMLElement) => element.click())
    await expect.poll(() => canvasToolbar(api.page).isVisible()).toBe(false)

    await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
    const field = api.page.getByRole('textbox', {name: 'Comment'})
    await field.waitFor({timeout: 30_000})
    expect(await canvasToolbar(api.page).isVisible()).toBe(false)

    await field.focus()
    await api.page.keyboard.type('note over the page')
    await api.page.keyboard.press('Enter')

    await expect.poll(() => canvasToolbar(api.page).isVisible(), {timeout: 30_000}).toBe(true)
    await api.page.getByText('note over the page').waitFor({timeout: 30_000})
  } finally {
    await api.dispose()
  }
})

test('a comment picked while the canvas is closed leaves it closed and toasts', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await pickAndCompose(api.page, 'silent note')
    await api.page.getByText('Comment added to the whiteboard').waitFor({timeout: 30_000})
    expect(await canvasToolbar(api.page).isVisible()).toBe(false)
    expect(await api.page.getByText('silent note').isVisible()).toBe(false)
  } finally {
    await api.dispose()
  }
})

test('cancelling the compose restores the canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.page
      .getByRole('button', {name: 'Comment on an element'})
      .evaluate((element: HTMLElement) => element.click())
    await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
    const field = api.page.getByRole('textbox', {name: 'Comment'})
    await field.waitFor({timeout: 30_000})
    expect(await canvasToolbar(api.page).isVisible()).toBe(false)

    await api.page.getByRole('button', {name: 'Cancel comment'}).evaluate((element: HTMLElement) => element.click())
    await expect.poll(() => canvasToolbar(api.page).isVisible(), {timeout: 30_000}).toBe(true)
  } finally {
    await api.dispose()
  }
})
