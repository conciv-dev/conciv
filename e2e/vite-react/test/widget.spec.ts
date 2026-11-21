import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget, openLoginFromLockedLauncher} from '@conciv/e2e-utils/widget'

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
})
