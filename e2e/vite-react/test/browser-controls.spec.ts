import {expect, test} from '@playwright/test'
import {defaultEngineConnectionTimings} from '@conciv/contract'
import {
  collectFailures,
  expectWidgetBoots,
  holdEngineCall,
  refuseEngineSocket,
  loginWidget,
} from '@conciv/e2e-utils/widget'

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
    const engineSocket = await refuseEngineSocket(page)
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

  test("the user sees that conciv couldn't reach the engine, and once the engine trusts the browser again the chat comes back without a click", async ({
    page,
  }) => {
    await loginWidget(page)
    const engineSocket = await refuseEngineSocket(page)
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
    await page.clock.runFor(defaultEngineConnectionTimings.reconnectMaxDelayMs)
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await expect(
      page.getByText("conciv couldn't reach the engine. Check that the dev server is still running."),
    ).not.toBeVisible()
  })
})

test.describe('the widget on a vite react page when the engine is slow or fails to say which session to open', () => {
  test('the user reloads with the chat open, sees conciv loading while the engine has not answered, and the chat once it does', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const resolve = await holdEngineCall(page, ['sessions', 'resolve'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await resolve.arrived

    await expect(page.getByText('Reconnecting to your workspace.')).toBeVisible()

    resolve.release()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })

  test("the user reloads with the chat open, sees the engine's error when it fails to answer, and Retry brings the chat back", async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const resolve = await holdEngineCall(page, ['sessions', 'resolve'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await resolve.arrived

    resolve.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByRole('alert').filter({hasText: 'Internal server error'})).toBeVisible()

    await page.getByRole('button', {name: 'Retry'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})

test.describe('the chat on a vite react page when the engine is slow or fails to load or compact the conversation', () => {
  test('the user reloads, sees the conversation loading while the engine holds it, the load error when it fails, and Retry brings the chat back', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const history = await holdEngineCall(page, ['chat', 'hydrate'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await history.arrived

    await expect(page.getByRole('status', {name: 'Loading conversation'})).toBeVisible()

    history.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByRole('alert').filter({hasText: 'Couldn’t load this conversation'})).toBeVisible()
    await expect(page.getByRole('status', {name: 'Loading conversation'})).toBeHidden()

    await page.getByRole('alert').getByRole('button', {name: 'Retry'}).click()
    await expect(page.getByText('How can I help you today?')).toBeVisible()
    await expect(page.getByRole('alert').filter({hasText: 'Couldn’t load this conversation'})).toBeHidden()
  })

  test('the user compresses a session the engine no longer has and is told it no longer exists', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const compact = await holdEngineCall(page, ['sessions', 'compact'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Compress the conversation'}).click()
    await compact.arrived
    compact.release('NOT_FOUND')

    await expect(page.getByText('This session no longer exists.')).toBeVisible()
  })

  test('the user compresses while the engine refuses and is told to try again in a moment', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const compact = await holdEngineCall(page, ['sessions', 'compact'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Compress the conversation'}).click()
    await compact.arrived
    compact.release('INTERNAL_SERVER_ERROR')

    await expect(page.getByText('Compaction failed. The session may be busy. Try again in a moment.')).toBeVisible()
  })
})

test.describe('the composer on a vite react page when one engine answer fails', () => {
  test('the user types @ while the engine fails to list the agents, and the list still offers the tools', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const agents = await holdEngineCall(page, ['agent', 'list'])
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).pressSequentially('@')
    await agents.arrived
    agents.release('INTERNAL_SERVER_ERROR')

    await expect(page.getByRole('listbox', {name: 'Context'}).getByRole('group', {name: 'Tools'})).toBeVisible()
  })

  test('the user types while the engine refuses to save the draft, sees it is kept only in this browser, and Retry saves it', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const save = await holdEngineCall(page, ['drafts', 'set'])
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('Ship the header fix')
    await save.arrived
    save.release('APPROVAL_DENIED')
    const unsaved = page.getByText(
      'conciv could not save your draft. It is kept in this browser, but the engine copy failed, so it is not on your other devices or in other browsers.',
    )
    await expect(unsaved).toBeVisible()

    await page.getByRole('button', {name: 'Retry'}).click()
    await expect(unsaved).not.toBeVisible()
  })
})
