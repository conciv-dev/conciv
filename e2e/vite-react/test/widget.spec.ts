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

  test('the code the dev server prints in its log signs the browser in', async ({page}) => {
    const code = await openLoginFromLockedLauncher(page)

    await page.getByRole('textbox', {name: 'Digit 1 of 6'}).pressSequentially(code)

    await expect(page.getByRole('dialog', {name: 'Authorize conciv'})).not.toBeVisible()
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

test.describe('attaching files with the Add attachment button', () => {
  test('the user picks two files in the file chooser, they show as chips, and the sent message in the thread carries both', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', {name: 'Add attachment'}).click()
    await (
      await chooser
    ).setFiles([
      {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Buy milk')},
      {name: 'plan.md', mimeType: 'text/plain', buffer: Buffer.from('Step one')},
    ])
    await expect(page.getByRole('button', {name: 'notes.txt'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'plan.md'})).toBeVisible()

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill('Read my files')
    await expect(composer).toBeFocused()
    await page.keyboard.press('Enter')

    const sent = page.getByRole('article', {name: /^You: Read my files/})
    await expect(sent).toContainText('Attachment notes.txt:')
    await expect(sent).toContainText('Buy milk')
    await expect(sent).toContainText('Attachment plan.md:')
    await expect(sent).toContainText('Step one')
    await expect(page.getByRole('button', {name: 'notes.txt'})).toHaveCount(0)
    await expect(composer).toHaveText('')
  })
})
