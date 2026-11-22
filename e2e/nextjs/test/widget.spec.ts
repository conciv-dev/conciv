import {test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget on a next page', () => {
  test.use({signedIn: false})

  test('the user signs in by magic link and the widget opens on a next page with no error', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
  })
})
