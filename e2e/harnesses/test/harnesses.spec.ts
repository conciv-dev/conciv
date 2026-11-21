import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('a message to a CLI that is not signed in ends in a visible error, never a hang', async ({page}, testInfo) => {
  const failures = collectFailures(page)
  await loginWidget(page, '/', `.conciv-${testInfo.project.name}`)
  await expectWidgetBoots(page, failures)
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await composer.fill('Reply with a short greeting')
  await composer.press('Enter')
  await expect(page.getByRole('alert').filter({has: page.getByRole('button', {name: 'Retry'})})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Stop generating'})).not.toBeVisible()
})
