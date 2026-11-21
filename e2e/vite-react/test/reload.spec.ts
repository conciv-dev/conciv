import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('after a reload the panel reopens on the settings section the user left, and the typed draft is still in the composer', async ({
  page,
}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await composer.fill('a draft that outlives the reload')
  await page.getByRole('link', {name: 'Settings'}).click()
  await page.getByRole('tab', {name: 'Shortcuts'}).click()
  await expect(page.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
  await expect(page.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()
  await page.getByRole('button', {name: 'Back to chat'}).click()
  await expect(composer).toHaveText('a draft that outlives the reload')
})

test.describe('a draft typed in another browser', () => {
  test('the draft the engine saved from another browser replaces the copy this browser kept, after a reload', async ({
    page,
    browser,
  }) => {
    const other = await browser.newPage()
    try {
      const failures = collectFailures(page)
      await loginWidget(page)
      await expectWidgetBoots(page, failures)
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.fill('the copy this browser kept')

      const otherFailures = collectFailures(other)
      await loginWidget(other)
      await expectWidgetBoots(other, otherFailures)
      const otherComposer = other.getByRole('textbox', {name: 'Message the conciv agent'})
      await expect(otherComposer).toHaveText('the copy this browser kept')
      await otherComposer.fill('the draft typed in the other browser')

      await page.reload()

      await expect(composer).toHaveText('the draft typed in the other browser')
    } finally {
      await other.close()
    }
  })
})
