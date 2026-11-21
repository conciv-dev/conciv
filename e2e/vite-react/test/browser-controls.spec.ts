import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the browser around the widget on a vite react page', () => {
  test('when the browser goes offline the send button says the engine connection is lost, and back online it is the send button again', async ({
    page,
    context,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible()

    await context.setOffline(true)
    await expect(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  })

  test('the user pops the chat out to a window, the composer is there, and closing the window brings the chat back inline', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('button', {name: /, session options$/}).click()
    const popupOpened = page.waitForEvent('popup')
    await page.getByRole('button', {name: 'Pop out to a window'}).click()
    const popup = await popupOpened
    await expect(popup.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).not.toBeVisible()

    await popup.close()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
