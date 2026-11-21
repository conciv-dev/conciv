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
