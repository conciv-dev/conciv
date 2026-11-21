import {expect, test} from '@playwright/test'
import {
  collectFailures,
  expectWidgetBoots,
  holdEngineCall,
  loginWidget,
  openLoginFromLockedLauncher,
} from '@conciv/e2e-utils/widget'

test.describe('signing in to the widget on a vite react page', () => {
  test('the user opens a magic link and the widget opens with no error', async ({page}) => {
    const failures = collectFailures(page)

    await loginWidget(page)

    await expect(page).not.toHaveURL(/conciv_otp/)
    await expectWidgetBoots(page, failures)
  })

  test('the user types the code the dev server printed into the locked launcher', async ({page}) => {
    const code = await openLoginFromLockedLauncher(page)

    await page.getByRole('textbox', {name: 'Digit 1 of 6'}).pressSequentially(code)

    await expect(page.getByRole('dialog', {name: 'Authorize conciv'})).not.toBeVisible()
    await expect(page.getByRole('button', {name: /conciv chat$/})).toBeVisible()
  })

  test('the user opens the locked launcher while the engine fails to issue a code, is told so, and Send a new code gets one printed', async ({
    page,
  }) => {
    const requestCode = await holdEngineCall(page, ['auth', 'requestCode'])
    await page.goto('/', {waitUntil: 'domcontentloaded'})

    await page.getByRole('button', {name: 'Unauthorized. Authorize conciv'}).click()
    const dialog = page.getByRole('dialog', {name: 'Authorize conciv'})
    await expect(dialog).toBeVisible()
    await requestCode.arrived
    requestCode.release('INTERNAL_SERVER_ERROR')
    await expect(dialog.getByRole('alert')).toHaveText('Could not ask the dev server for a code. Please try again.')

    await dialog.getByRole('button', {name: 'Send a new code'}).click()
    await expect(dialog.getByRole('status')).toHaveText('A new code was printed in your terminal.')
    await expect(dialog.getByRole('alert')).toHaveText('')
  })
})
