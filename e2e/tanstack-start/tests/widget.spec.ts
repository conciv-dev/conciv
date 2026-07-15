import {test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a tanstack start app', async ({page}) => {
  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)
})
