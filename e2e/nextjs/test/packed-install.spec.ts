import {test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('installing conciv in a next app from its packed tarballs', () => {
  test('the user signs in and the widget from instrumentation-client opens on the engine register() booted', async ({
    page,
  }) => {
    const failures = collectFailures(page)

    await loginWidget(page)

    await expectWidgetBoots(page, failures)
  })
})
