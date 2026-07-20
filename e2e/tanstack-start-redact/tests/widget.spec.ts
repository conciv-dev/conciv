import {test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'

test('widget boots in a tanstack start app rendered with @tanstack/redact', async ({page}) => {
  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)
})
