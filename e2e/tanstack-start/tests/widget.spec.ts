import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget, openLoginFromLockedLauncher} from '@conciv/e2e-utils/widget'

test('folder-installed tanstack extension boots the widget and shows its composer chip', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)

  const chip = page
    .getByRole('dialog', {name: 'conciv chat agent'})
    .getByRole('status', {name: 'TanStack inspector active'})
  await expect(chip).toBeVisible()
})

test('a login opened from the locked launcher before the host hydrates leaves the host markup to React', async ({
  page,
}) => {
  const failures = collectFailures(page)
  const hydration = Promise.withResolvers<void>()
  await page.route(/react-dom/, async (route) => {
    await hydration.promise
    await route.continue()
  })
  const code = await openLoginFromLockedLauncher(page)
  hydration.resolve()
  await expect(page.getByRole('button', {name: 'Open TanStack Devtools', includeHidden: true})).toBeAttached()
  await page.getByRole('textbox', {name: 'Digit 1 of 6'}).pressSequentially(code)
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  await expectWidgetBoots(page, failures)
})
