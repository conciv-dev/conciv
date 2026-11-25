import {expect, test} from '@internal/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@internal/e2e-utils/widget'

test.describe('signing in to the widget', () => {
  test.use({signedIn: false})

  test('the user signs in by magic link and the widget opens on a tanstack start page with no error, also while the page is still hydrating', async ({
    page,
    request,
  }) => {
    const hydrationHold = '/api/hydration-hold'
    const failures = collectFailures(page)
    await loginWidget(page)
    const holding = page.waitForRequest((sent) => new URL(sent.url()).pathname === hydrationHold)
    await page.goto('/?hold=true', {waitUntil: 'domcontentloaded'})
    await holding
    try {
      const launcher = page.getByRole('button', {name: 'Open conciv chat'})
      await expect(launcher).toBeVisible()
      await launcher.click()
      await expect(page.getByRole('tab', {name: 'Chat'})).toBeVisible()
      await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()
    } finally {
      await request.post(hydrationHold)
    }

    await page.getByRole('button', {name: /^Theme mode: auto/}).press('Enter')
    await expect(page.getByRole('button', {name: /^Theme mode: light/})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()
    await expectWidgetBoots(page, failures)
  })
})
