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

test('a failed run on screen hides while the browser is offline, the send button says the connection is lost, and back online the run error and its Retry return', async ({
  page,
  context,
}, testInfo) => {
  const failures = collectFailures(page)
  await loginWidget(page, '/', `.conciv-${testInfo.project.name}`)
  await expectWidgetBoots(page, failures)
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  const runError = page
    .getByRole('alert')
    .filter({has: page.getByRole('button', {name: 'Retry'})})
    .filter({hasNotText: 'conciv lost connection to the engine'})
  await composer.fill('Reply with a short greeting')
  await composer.press('Enter')
  await expect(runError).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeVisible()
  await expect(runError).toBeHidden()

  await context.setOffline(false)
  await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  await expect(runError).toBeVisible()
})
