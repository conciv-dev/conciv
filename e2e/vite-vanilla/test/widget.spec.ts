import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('the user signs in by magic link and the widget opens on a plain vite page with no error', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})

test.describe('the user types into the host page with the panel open', () => {
  test('the keys go to the host field and the composer stays empty', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const search = page.getByRole('textbox', {name: 'Search plants'})

    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('Boston fern? /k')

    await expect(search).toHaveValue('Boston fern? /k')
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('')
  })
})

test.describe('the terminal gives focus back to the host', () => {
  test('a click on a host field moves focus out of the terminal and the keys go to the host field', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('tab', {name: 'Terminal'}).click()
    const terminalInput = page.getByRole('textbox', {name: 'Terminal input'})
    await expect(terminalInput).toBeFocused()

    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await expect(terminalInput).not.toBeFocused()
    await page.keyboard.type('ls -la')

    await expect(search).toHaveValue('ls -la')
    await expect(search).toBeFocused()
  })
})

test.describe('the user types in the page while the Recorder tab replays live', () => {
  test('a click on a page field takes focus out of the panel, and the live replay leaves it there while the user types', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('B')
    await expect(page.getByText('Searching for B')).toBeVisible()

    const replay = page.frames().find((frame) => frame !== page.mainFrame())
    if (!replay) throw new Error('the Recorder tab drew no replay frame')
    await expect(replay.getByText('Searching for B')).toBeVisible()
    await expect(search).toBeFocused()
    await page.keyboard.type('oston fern')

    await expect(search).toHaveValue('Boston fern')
    await expect(search).toBeFocused()
  })
})
