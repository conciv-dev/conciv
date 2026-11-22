import {readFile} from 'node:fs/promises'
import {expect, test} from '@conciv/e2e-utils/fixtures'

test.describe('the widget on a vite solid page', () => {
  test('the user types a draft, the project plugin is rebuilt, and the widget shows the new line in place with the draft and focus kept', async ({
    page,
    rebuildPlugin,
  }) => {
    await expect(page.getByText('live line first')).toBeVisible()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await composer.pressSequentially('a draft the rebuild keeps')

    await rebuildPlugin('live-line', 'live line first', 'live line second')

    await expect(page.getByText('live line second')).toBeVisible()
    await expect(page.getByText('live line first')).toHaveCount(0)
    await expect(composer).toHaveText('a draft the rebuild keeps')
    await expect(composer).toBeFocused()
  })
})

test.describe('a project plugin that saves a file and opens a link on a vite solid page', () => {
  test('the user saves the notes as a download, and opening conciv.dev opens it in a new browser tab', async ({
    page,
    context,
  }) => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Save notes'}).click()
    const notes = await download
    expect(notes.suggestedFilename()).toBe('notes.txt')
    expect(await readFile(await notes.path(), 'utf8')).toBe('notes the plugin saved')

    const opened = context.waitForEvent('page')
    await page.getByRole('button', {name: 'Open conciv.dev'}).click()
    const tab = await opened
    expect(tab.url()).toBe('https://conciv.dev/')
    await tab.close()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
