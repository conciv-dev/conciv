import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, gotoTrusted} from '@conciv/e2e-utils/widget'

test('folder-installed tanstack extension boots the widget and shows its composer chip', async ({page}) => {
  const failures = collectFailures(page)
  await gotoTrusted(page, '/')
  await expectWidgetBoots(page, failures)

  const chip = page
    .getByRole('dialog', {name: 'conciv chat agent'})
    .getByRole('status', {name: 'TanStack inspector active'})
  await expect(chip).toBeVisible()
})
