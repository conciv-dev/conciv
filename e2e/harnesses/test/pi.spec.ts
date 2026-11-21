import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('a message to Pi says Pi is not installed or not yet supported', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page, '/', '.conciv-pi')
  await expectWidgetBoots(page, failures)
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await composer.fill('Reply with a short greeting')
  await composer.press('Enter')
  await expect(page.getByRole('alert', {name: 'pi is not installed or not yet supported'})).toBeVisible()
})
