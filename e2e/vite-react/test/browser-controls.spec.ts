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
  test("the user opens the chat while the engine socket cannot connect, sees one Retry where conciv says it couldn't reach the engine, clicks it, and the chat comes back once the network is back", async ({
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
    const unreachable = page
      .getByRole('alert')
      .filter({hasText: "conciv couldn't reach the engine. Check that the dev server is still running."})
    await expect(unreachable).toBeVisible()
    await page.clock.runFor(defaultEngineConnectionTimings.offlineGraceMs)
    await expect(page.getByRole('button', {name: 'Retry'})).toHaveCount(1)

    await unreachable.getByRole('button', {name: 'Retry'}).click()
    engineSocket.release()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })

  test("the user clicks Retry where conciv says it couldn't reach the engine while the socket waits to try again, and the socket connects at once without waiting out the back-off", async ({
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
    const unreachable = page
      .getByRole('alert')
      .filter({hasText: "conciv couldn't reach the engine. Check that the dev server is still running."})
    await expect(unreachable).toBeVisible()

    await page.clock.pauseAt(
      Date.now() +
        defaultEngineConnectionTimings.authTimeoutMs +
        defaultEngineConnectionTimings.callDeadlineMs +
        defaultEngineConnectionTimings.connectionLossRetryDelayMs,
    )
    engineSocket.release()
    const engineSocketOpened = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await unreachable.getByRole('button', {name: 'Retry'}).click()
    await expect(engineSocketOpened).resolves.toBeTruthy()

    await page.clock.resume()
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

  test('the user reloads with the chat open while the engine socket cannot connect, is told conciv lost connection to the engine with a Retry, and once the socket connects again the notice goes and the chat comes back on its own', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const engineSocket = await refuseEngineSocket(page)
    await page.clock.install()
    await page.reload({waitUntil: 'domcontentloaded'})
    await engineSocket.arrived

    await page.clock.runFor(
      defaultEngineConnectionTimings.authTimeoutMs + defaultEngineConnectionTimings.offlineGraceMs,
    )
    await expect(page.getByText('conciv lost connection to the engine.')).toBeVisible()
    await expect(page.getByRole('button', {name: 'Retry'}).first()).toBeVisible()

    engineSocket.release()
    await page.clock.runFor(defaultEngineConnectionTimings.reconnectMaxDelayMs)
    await expect(page.getByText('conciv lost connection to the engine.')).not.toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })

  test('the user reloads with the chat open during a short socket blip, and the chat opens with no error once the socket connects again', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const engineSocket = await refuseEngineSocket(page)
    await page.clock.install()
    await page.reload({waitUntil: 'domcontentloaded'})
    await engineSocket.arrived

    engineSocket.release()
    await page.clock.runFor(defaultEngineConnectionTimings.reconnectMaxDelayMs)
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Retry'})).toHaveCount(0)
  })
})

test.describe('the widget on a vite react page when the engine does not answer the trust check', () => {
  test("the user opens the chat while the engine has not answered the trust check, sees that conciv couldn't reach the engine, and Retry asks again and brings the chat back", async ({
    page,
  }) => {
    await loginWidget(page)
    const trust = await holdEngineCall(page, ['auth', 'trust'])
    await page.clock.install()
    await page.reload({waitUntil: 'domcontentloaded'})
    await trust.arrived

    await page.clock.runFor(defaultEngineConnectionTimings.authTimeoutMs)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await page.clock.runFor(
      defaultEngineConnectionTimings.callDeadlineMs + defaultEngineConnectionTimings.connectionLossRetryDelayMs,
    )
    await expect(
      page.getByText("conciv couldn't reach the engine. Check that the dev server is still running."),
    ).toBeVisible()

    trust.release()
    await page.getByRole('button', {name: 'Retry'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
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

test.describe('the widget on a vite react page when the engine holds a later call, fails every call, or holds a call only once armed', () => {
  test('the user starts a new session, then another while the engine holds the second create, and only the second is told it could not start', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const create = await holdEngineCall(page, ['sessions', 'create'], {when: (count) => count === 2})
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    const sessionOptions = page.getByRole('dialog', {name: 'Session options'})
    const startFailed = page.getByText(
      'Could not start a new session. Check that the engine is running, then try again.',
    )

    await page.getByRole('button', {name: /, session options$/}).click()
    await sessionOptions.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('button', {name: 'New session', exact: true}).click()
    await expect(page.getByRole('status').filter({hasText: 'Started a new session'})).toBeVisible()
    await expect(sessionOptions).toBeHidden()

    await page.getByRole('button', {name: /, session options$/}).click()
    await sessionOptions.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('button', {name: 'New session', exact: true}).click()
    await create.arrived
    await expect(startFailed).toBeHidden()

    create.release('INTERNAL_SERVER_ERROR')
    await expect(startFailed).toBeVisible()
  })

  test("the user reloads while the engine fails every load of the session, sees that the session couldn't load under the title Session, and once the engine answers again Retry brings the title back", async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const session = await holdEngineCall(page, ['sessions', 'get'], {
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await session.arrived

    const failed = page.getByRole('alert').filter({hasText: 'Couldn’t load this session'})
    await expect(failed).toBeVisible()
    await expect(page.getByRole('button', {name: 'This session could not be loaded, session options'})).toHaveText(
      'Session',
    )

    session.release()
    await failed.getByRole('button', {name: 'Retry'}).click()
    await expect(failed).toBeHidden()
    await expect(page.getByRole('button', {name: 'New session, session options'})).toBeVisible()
  })

  test('the user opens the quick terminal after the chat has loaded, sees it starting a pane while the engine holds the session it asked for, and the pane once the engine answers', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const resolve = await holdEngineCall(page, ['sessions', 'resolve'], {when: () => true, armed: false})
    await page.reload({waitUntil: 'domcontentloaded'})
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect(composer).toBeVisible()

    resolve.arm()
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Backquote')
    await resolve.arrived
    const terminal = page.getByRole('dialog', {name: 'conciv quick terminal'})
    await expect(terminal.getByText('Starting a pane…')).toBeVisible()

    resolve.release()
    await expect(terminal.getByRole('button', {name: /^Session: /})).toBeVisible()
    await terminal.getByRole('button', {name: 'Close quick terminal'}).click()
    await expect(terminal).toBeHidden()
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
