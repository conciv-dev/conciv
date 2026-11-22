import {expect, test} from '@conciv/e2e-utils/fixtures'
import {loginWidget} from '@conciv/e2e-utils/widget'

test.describe('a plugin setting in a browser that refuses site storage', () => {
  test.use({signedIn: false})

  test('the user changes a plugin setting and is told that changes are not being saved', async ({page}) => {
    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'Remember this choice'}).click()

    await expect(page.getByText('Some changes are not being saved')).toBeVisible()
    await expect(
      page.getByText("This browser's storage is full or unavailable, so plugin settings may be lost when you reload."),
    ).toBeVisible()
  })
})
