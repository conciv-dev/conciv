import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, holdEngineCall, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('settings on a vite react page when the engine fails to save them', () => {
  test('the user picks a color mode the engine fails to save, sees the field ask to change it again, and the next change is saved', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const save = await holdEngineCall(page, ['settings', 'set'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await page.getByRole('link', {name: 'Settings'}).click()
    await page.getByRole('tab', {name: 'General'}).click()
    const colorMode = page.getByRole('radiogroup', {name: 'Color mode'})
    await expect(colorMode.getByRole('radio', {name: 'Auto'})).toBeChecked()

    await colorMode.getByRole('radio', {name: 'Dark'}).click()
    await save.arrived
    save.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByText('Could not save this setting. Change it again to retry.')).toBeVisible()

    await colorMode.getByRole('radio', {name: 'Auto'}).click()
    await expect(colorMode.getByRole('radio', {name: 'Auto'})).toBeChecked()
    await expect(page.getByText('Could not save this setting. Change it again to retry.')).not.toBeVisible()
  })

  test('the user resets the shortcuts while the engine fails it, hears that the settings could not be reset, and the next reset works', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const reset = await holdEngineCall(page, ['settings', 'delete'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await page.getByRole('link', {name: 'Settings'}).click()
    await page.getByRole('tab', {name: 'Advanced'}).click()

    await page.getByRole('button', {name: 'Reset shortcuts'}).click()
    await reset.arrived
    await expect(page.getByRole('button', {name: 'Reset shortcuts'})).toBeDisabled()
    reset.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByRole('alert').filter({hasText: 'Could not reset the settings'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Reset shortcuts'})).toBeEnabled()

    await page.getByRole('button', {name: 'Reset shortcuts'}).click()
    await expect(page.getByRole('status').filter({hasText: 'Settings reset'})).toBeVisible()
  })
})
