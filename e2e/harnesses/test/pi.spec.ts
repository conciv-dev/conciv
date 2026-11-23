import {expect, test} from '@conciv/e2e-utils/fixtures'

test('a message to Pi ends in a visible error that says Pi is not installed or not yet supported, never a hang', async ({
  page,
}) => {
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: 'Start a new session'}).click()
  await expect(page.getByRole('status', {name: 'conciv announcements'})).toHaveText('Started a new session')
  await expect(page.getByRole('button', {name: 'Model: Pi'})).toBeVisible()
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await composer.fill('Reply with a short greeting')
  await composer.press('Enter')
  await expect(
    page
      .getByRole('alert', {name: 'pi is not installed or not yet supported'})
      .filter({has: page.getByRole('button', {name: 'Retry'})}),
  ).toBeVisible()
  await expect(page.getByRole('button', {name: 'Stop generating'})).not.toBeVisible()
})
