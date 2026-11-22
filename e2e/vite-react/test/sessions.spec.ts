import {expect, test} from '@conciv/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, holdEngineCall, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('a session renamed in another browser', () => {
  test('the user renames the open session in a second browser, and the first browser shows the new title in its open rail', async ({
    page,
    secondPage,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const otherFailures = collectFailures(secondPage)
    await loginWidget(secondPage)
    await expectWidgetBoots(secondPage, otherFailures)
    await secondPage.getByRole('button', {name: 'Rename session'}).click()
    const otherTitle = secondPage.getByRole('textbox', {name: 'Session title'})
    await expect(otherTitle).toBeFocused()
    await otherTitle.press('ControlOrMeta+A')
    await otherTitle.pressSequentially('Renamed in the other browser')
    await otherTitle.press('Enter')
    await expect(secondPage.getByRole('button', {name: 'Renamed in the other browser, session options'})).toBeVisible()

    await expect(page.getByRole('button', {name: 'Renamed in the other browser, session options'})).toBeVisible()
  })
})

test.describe('searching the sessions on a vite react page when the engine is slow or fails to answer', () => {
  test("the user searches the sessions, sees the search spinner while the engine has not answered, that conciv couldn't load sessions when it fails, and Retry loads them", async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const sessionSearch = await holdEngineCall(page, ['sessions', 'search'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: /, session options$/}).click()
    await page.getByRole('button', {name: /^Session: /}).click()
    const searchBox = page.getByRole('combobox', {name: 'Search sessions'})
    await searchBox.click()
    await expect(searchBox).toBeFocused()
    await searchBox.pressSequentially('session')
    await sessionSearch.arrived
    await expect(page.getByRole('progressbar', {name: 'Searching sessions'})).toBeVisible()

    sessionSearch.release('INTERNAL_SERVER_ERROR')
    const failed = page.getByRole('status').filter({hasText: "Couldn't load sessions"})
    await expect(failed).toBeVisible()
    await expect(page.getByRole('progressbar', {name: 'Searching sessions'})).toBeHidden()

    await failed.getByRole('button', {name: 'Retry'}).click()
    await expect(failed).toBeHidden()
    await expect(searchBox).toHaveValue('session')

    await page.getByRole('button', {name: 'Clear search'}).click()
    await expect(searchBox).toHaveValue('')
  })
})
