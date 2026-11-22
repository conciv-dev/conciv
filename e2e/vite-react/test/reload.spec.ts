import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('after one reload the panel reopens on the settings section the user left, the typed draft is still in the composer, and the quick terminal opens at the height the user left it', async ({
  page,
}) => {
  const failures = collectFailures(page)
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await composer.click()
  await expect(composer).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Backquote')
  const separator = page.getByRole('separator', {name: 'Resize quick terminal height'})
  await expect(page.getByRole('dialog', {name: 'conciv quick terminal'})).toBeVisible()
  const opened = Number(await separator.getAttribute('aria-valuenow'))
  await separator.press('ArrowUp')
  await expect(separator).toHaveAttribute('aria-valuenow', String(opened - 24))
  await expect(separator).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Backquote')
  await expect(page.getByRole('dialog', {name: 'conciv quick terminal'})).not.toBeVisible()

  await expectWidgetBoots(page, failures)
  await composer.fill('a draft that outlives the reload')
  await page.getByRole('link', {name: 'Settings'}).click()
  await page.getByRole('tab', {name: 'Shortcuts'}).click()
  await expect(page.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
  await expect(page.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()
  await page.getByRole('button', {name: 'Back to chat'}).click()
  await expect(composer).toHaveText('a draft that outlives the reload')
  await composer.click()
  await expect(composer).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Backquote')
  await expect(separator).toHaveAttribute('aria-valuenow', String(opened - 24))
  await separator.press('ControlOrMeta+Backquote')
  await expect(page.getByRole('dialog', {name: 'conciv quick terminal'})).not.toBeVisible()
})

test.describe('a draft typed in another browser', () => {
  test.use({signedIn: false})

  test('the draft the engine saved from another browser replaces the copy this browser kept, after a reload', async ({
    page,
    secondPage,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill('the copy this browser kept')

    const otherFailures = collectFailures(secondPage)
    await loginWidget(secondPage)
    await expectWidgetBoots(secondPage, otherFailures)
    const otherComposer = secondPage.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect(otherComposer).toHaveText('the copy this browser kept')
    await otherComposer.fill('the draft typed in the other browser')

    await page.reload()

    await expect(composer).toHaveText('the draft typed in the other browser')
  })
})
