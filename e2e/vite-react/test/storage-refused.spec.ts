import {expect, test} from '@conciv/e2e-utils/fixtures'
import {loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget in a browser that refuses site storage', () => {
  test('the user types a draft that another browser then shows from the engine, adds to it and closes the panel, and after a reload signs in again and gets the longer draft back from the engine', async ({
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
  })
})
