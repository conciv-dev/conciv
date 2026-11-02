import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, gotoTrusted} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a nextjs app', async ({page}) => {
  const failures = collectFailures(page)
  await gotoTrusted(page, '/')
  await expectWidgetBoots(page, failures)
})

test('the terminal builtin server extension loaded and can hand back a real connect command', async ({page}) => {
  const failures = collectFailures(page)
  await gotoTrusted(page, '/')
  await expectWidgetBoots(page, failures)
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: 'Copy command'}).click()
  await expect(page.getByText(/--mcp-config/)).toBeVisible()
})
