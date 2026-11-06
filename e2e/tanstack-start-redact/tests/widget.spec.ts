import {test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('widget boots in a tanstack start app rendered with @tanstack/redact', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})
