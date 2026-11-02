import {test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, gotoTrusted} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a vanilla vite app', async ({page}) => {
  const failures = collectFailures(page)
  await gotoTrusted(page, '/')
  await expectWidgetBoots(page, failures)
})
