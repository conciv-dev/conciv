import {expect, test} from '@internal/e2e-utils/fixtures'

test.describe('popping the chat out in a browser that refuses new windows', () => {
  test('the user pops the chat out, the browser refuses the window, and the chat stays inline with a notice that offers to pop out again', async ({
    page,
  }) => {
    await page.getByRole('button', {name: /, session options$/}).click()
    await page.getByRole('button', {name: 'Pop out to a window'}).click()

    await expect(page.getByText('The pop-out window could not be reopened.')).toBeVisible()
    await expect(page.getByRole('button', {name: 'Pop out again'})).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
