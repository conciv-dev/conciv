import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('grabbing an element of the vite react host page', () => {
  test('the user picks a heading of the host page, the composer stages it with its source file and line, and the user removes it', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Select an element from the page'}).click()
    await page.getByRole('heading', {name: 'Get started'}).click()

    await expect(page.getByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await expect(page.getByText(/^in .*src\/App\.tsx:\d+/)).toBeVisible()

    await page.getByRole('button', {name: 'Remove Grabbed element'}).click()
    await expect(page.getByRole('button', {name: 'Open grabbed element'})).not.toBeVisible()
  })
})
