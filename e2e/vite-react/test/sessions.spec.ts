import {expect, test} from '@conciv/e2e-utils/fixtures'

test.describe('a session renamed in another browser', () => {
  test('the user renames the open session in a second browser, and the first browser shows the new title in its open rail', async ({
    page,
    secondPage,
  }) => {
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
