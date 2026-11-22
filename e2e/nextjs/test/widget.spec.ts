import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget on a next page', () => {
  test('the user signs in by magic link and the widget opens on a next page with no error', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
  })

  test('the user types a draft, the project plugin is rebuilt, and the widget shows the new line in place with the draft and focus kept', async ({
    page,
    rebuildPlugin,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await page.getByRole('tab', {name: 'Chat'}).click()
    await expectWidgetBoots(page, failures)
    await expect(page.getByText('live line first')).toBeVisible()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await composer.pressSequentially('a draft the rebuild keeps')

    await rebuildPlugin('live-line', 'live line first', 'live line second')

    await expect(page.getByText('live line second')).toBeVisible()
    await expect(page.getByText('live line first')).toHaveCount(0)
    await expect(composer).toHaveText('a draft the rebuild keeps')
    await expect(composer).toBeFocused()
  })
})
