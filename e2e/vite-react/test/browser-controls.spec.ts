import {expect, test} from '@playwright/test'
import {defaultEngineConnectionTimings} from '@conciv/contract'
import {collectFailures, expectWidgetBoots, holdEngineSocket, loginWidget} from '@conciv/e2e-utils/widget'

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

test.describe('the widget on a vite react page when its engine socket cannot connect', () => {
  test("the user opens the chat while the engine socket cannot connect, sees that conciv couldn't reach the engine, and once the network is back Retry brings the chat back", async ({
    page,
  }) => {
    await loginWidget(page)
    const engineSocket = await holdEngineSocket(page)
    await page.clock.install()
    await page.reload({waitUntil: 'domcontentloaded'})
    await engineSocket.arrived

    await page.clock.runFor(defaultEngineConnectionTimings.authTimeoutMs)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await page.clock.runFor(
      defaultEngineConnectionTimings.callDeadlineMs + defaultEngineConnectionTimings.connectionLossRetryDelayMs,
    )
    await expect(
      page.getByText("conciv couldn't reach the engine. Check that the dev server is still running."),
    ).toBeVisible()

    engineSocket.release()
    await page.getByRole('button', {name: 'Retry'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
