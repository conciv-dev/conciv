import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'

test('folder-installed tanstack extension boots the widget and shows its composer chip', async ({page}) => {
  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)

  const chip = page
    .getByRole('dialog', {name: 'conciv chat agent'})
    .getByRole('status', {name: 'TanStack inspector active'})
  await expect(chip).toBeVisible()
})
