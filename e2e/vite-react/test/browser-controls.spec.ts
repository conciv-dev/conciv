import {expect, test} from '@conciv/e2e-utils/fixtures'
import {defaultEngineConnectionTimings} from '@conciv/contract'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the browser around the widget on a vite react page', () => {
  test('the user sends a message while the browser has just gone offline, is told conciv lost connection to the engine and the message is still in the composer, and back online the send button returns with the message kept', async ({
    page,
    context,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await page.clock.install()
    await page.reload({waitUntil: 'domcontentloaded'})
    await expectWidgetBoots(page, failures)
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await composer.pressSequentially('Ship the header fix')
    await expect(composer).toHaveText('Ship the header fix')

    await page.clock.pauseAt(Date.now() + defaultEngineConnectionTimings.offlineGraceMs)
    await context.setOffline(true)
    await expect(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeVisible()
    await composer.press('Enter')
    await expect(
      page.getByText('conciv lost connection to the engine. Your message is still in the composer.'),
    ).toBeVisible()
    await expect(composer).toHaveText('Ship the header fix')

    await context.setOffline(false)
    await page.clock.resume()
    await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await expect(composer).toHaveText('Ship the header fix')
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
