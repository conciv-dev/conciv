import {expect, test} from '@internal/e2e-utils/fixtures'
import {loginWidget} from '@internal/e2e-utils/widget'

test.describe('the widget in a browser that refuses site storage', () => {
  test.use({signedIn: false})

  test('the user types a draft that another browser then shows from the engine, adds to it and closes the panel, after a reload signs in again and gets the longer draft back from the engine, and changing a plugin setting tells the user that changes are not being saved', async ({
    page,
    secondPage,
  }) => {
    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill('a draft only the engine keeps')

    await loginWidget(secondPage)
    await secondPage.getByRole('button', {name: /conciv chat$/}).click()
    await expect(secondPage.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText(
      'a draft only the engine keeps',
    )

    await composer.fill('a draft only the engine keeps, and a line added before closing the panel')
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await expect(composer).not.toBeVisible()

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('button', {name: 'Unauthorized. Authorize conciv'})).toBeVisible()

    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText(
      'a draft only the engine keeps, and a line added before closing the panel',
    )

    await page.getByRole('button', {name: 'Remember this choice'}).click()
    await expect(page.getByText('Some changes are not being saved')).toBeVisible()
    await expect(
      page.getByText("This browser's storage is full or unavailable, so plugin settings may be lost when you reload."),
    ).toBeVisible()
  })
})
