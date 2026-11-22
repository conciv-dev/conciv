import {expect, test} from '@conciv/e2e-utils/fixtures'
import {
  collectFailures,
  expectWidgetBoots,
  holdEngineCall,
  refuseEngineSocket,
  loginWidget,
} from '@conciv/e2e-utils/widget'

test.describe('sessions on a vite react page when the engine fails a session change', () => {
  test('the user renames the session, sees the new title while the engine holds the rename, hears it fail when the engine refuses it, and the old title comes back', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const rename = await holdEngineCall(page, ['sessions', 'rename'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'Rename session'}).click()
    const title = page.getByRole('textbox', {name: 'Session title'})
    await expect(title).toBeFocused()
    await title.press('ControlOrMeta+A')
    await title.pressSequentially('Title the engine refuses')
    await title.press('Enter')
    await rename.arrived
    await expect(page.getByRole('button', {name: 'Title the engine refuses, session options'})).toBeVisible()

    rename.release('INTERNAL_SERVER_ERROR')
    await expect(page.getByRole('alert').filter({hasText: 'Rename failed'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Title the engine refuses, session options'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: 'New session, session options'})).toBeVisible()
  })

  test('the user starts a new session while the engine fails to create it, is told to check the engine, and the next try starts one', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const create = await holdEngineCall(page, ['sessions', 'create'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: /, session options$/}).click()
    await page.getByRole('button', {name: /^Session: /}).click()
    const newSession = page.getByRole('button', {name: 'New session', exact: true})
    await newSession.click()
    await create.arrived
    create.release('INTERNAL_SERVER_ERROR')
    await expect(
      page.getByText('Could not start a new session. Check that the engine is running, then try again.'),
    ).toBeVisible()

    await newSession.click()
    await expect(page.getByRole('status').filter({hasText: 'Started a new session'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'New session, session options'})).toBeVisible()
  })
})

test.describe('a session renamed in another browser', () => {
  test('the user renames the open session in a second browser, and the first browser shows the new title in its open rail', async ({
    page,
    secondPage,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const otherFailures = collectFailures(secondPage)
    await loginWidget(secondPage)
    await expectWidgetBoots(secondPage, otherFailures)
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

test.describe('searching the sessions on a vite react page when the engine is slow or fails to answer', () => {
  test("the user searches the sessions, sees the search spinner while the engine has not answered, that conciv couldn't load sessions when it fails, and Retry loads them", async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const sessionSearch = await holdEngineCall(page, ['sessions', 'search'])
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: /, session options$/}).click()
    await page.getByRole('button', {name: /^Session: /}).click()
    const searchBox = page.getByRole('combobox', {name: 'Search sessions'})
    await searchBox.click()
    await expect(searchBox).toBeFocused()
    await searchBox.pressSequentially('session')
    await sessionSearch.arrived
    await expect(page.getByRole('progressbar', {name: 'Searching sessions'})).toBeVisible()

    sessionSearch.release('INTERNAL_SERVER_ERROR')
    const failed = page.getByRole('status').filter({hasText: "Couldn't load sessions"})
    await expect(failed).toBeVisible()
    await expect(page.getByRole('progressbar', {name: 'Searching sessions'})).toBeHidden()

    await failed.getByRole('button', {name: 'Retry'}).click()
    await expect(failed).toBeHidden()
    await expect(searchBox).toHaveValue('session')

    await page.getByRole('button', {name: 'Clear search'}).click()
    await expect(searchBox).toHaveValue('')
  })
})

test.describe('paging the sessions on a vite react page when the engine fails the next page', () => {
  test("the user names the session, starts 31 more, moves past the first page of sessions while the engine fails the next one, sees that conciv couldn't load more sessions, and once the engine answers again Retry loads the named one", async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const nextPage = await holdEngineCall(page, ['sessions', 'list'], {
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
      armed: false,
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await page.getByRole('button', {name: 'Rename session'}).click()
    const title = page.getByRole('textbox', {name: 'Session title'})
    await expect(title).toBeFocused()
    await title.press('ControlOrMeta+A')
    await title.pressSequentially('The oldest session')
    await title.press('Enter')
    await expect(page.getByRole('button', {name: 'The oldest session, session options'})).toBeVisible()

    const sessionOptions = page.getByRole('dialog', {name: 'Session options'})
    for (let started = 1; started <= 31; started += 1) {
      await page.getByRole('button', {name: /, session options$/}).click()
      await sessionOptions.getByRole('button', {name: /^Session: /}).click()
      await page.getByRole('button', {name: 'New session', exact: true}).click()
      await expect(sessionOptions).toBeHidden()
    }
    await expect(page.getByRole('button', {name: 'New session, session options'})).toBeVisible()

    await page.getByRole('button', {name: 'New session, session options'}).click()
    await sessionOptions.getByRole('button', {name: 'Session: New session'}).click()
    await expect(page.getByRole('option', {name: /^New session, /, selected: true})).toBeVisible()
    await expect(page.getByRole('option', {name: /^The oldest session, /})).toHaveCount(0)

    nextPage.arm()
    const searchBox = page.getByRole('combobox', {name: 'Search sessions'})
    for (let row = 1; row <= 29; row += 1) await searchBox.press('ArrowDown')
    await nextPage.arrived
    const failed = page.getByRole('status').filter({hasText: "Couldn't load more sessions"})
    await expect(failed).toBeVisible()

    nextPage.release()
    await failed.getByRole('button', {name: 'Retry'}).click()
    await expect(page.getByRole('option', {name: /^The oldest session, /})).toBeVisible()
    await expect(failed).toBeHidden()
  })
})

test.describe('the quick terminal on a vite react page when the engine goes away', () => {
  test('the user opens the quick terminal while the engine is away, sees that conciv could not start a pane, and the pane starts once the engine is back', async ({
    page,
    context,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const engineSocket = await refuseEngineSocket(page)
    await context.setOffline(true)
    await expect(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeVisible()

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Backquote')
    const terminal = page.getByRole('dialog', {name: 'conciv quick terminal'})
    await expect(
      terminal.getByText('conciv could not start a pane. Check the engine connection and retry.'),
    ).toBeVisible()

    await context.setOffline(false)
    engineSocket.release()
    await expect(terminal.getByRole('button', {name: /^Session: /})).toBeVisible()

    await terminal.getByRole('button', {name: 'Close quick terminal'}).click()
    await expect(terminal).toBeHidden()
  })
})

test.describe('the quick terminal on a vite react page when the engine fails to start a pane', () => {
  test('the user opens the quick terminal while the engine fails to resolve a session, is told conciv could not start a pane, and once the engine answers again Retry starts it', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const resolve = await holdEngineCall(page, ['sessions', 'resolve'], {
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
      armed: false,
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect(composer).toBeVisible()

    resolve.arm()
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Backquote')
    await resolve.arrived
    const terminal = page.getByRole('dialog', {name: 'conciv quick terminal'})
    const startFailed = terminal.getByText('conciv could not start a pane. Check the engine connection and retry.')
    await expect(startFailed).toBeVisible()

    resolve.release()
    await terminal.getByRole('button', {name: 'Retry'}).click()
    await expect(terminal.getByRole('button', {name: /^Session: /})).toBeVisible()
    await expect(startFailed).toBeHidden()

    await terminal.getByRole('button', {name: 'Close quick terminal'}).click()
    await expect(terminal).toBeHidden()
  })
})

test.describe('a session deleted in another browser on a vite react page', () => {
  test('the user keeps a draft in a session another browser closes in its quick terminal, sees the session was deleted, and New session carries the draft over', async ({
    page,
    secondPage,
  }) => {
    const draft = 'a draft that outlives its session'
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await composer.pressSequentially(draft)
    await expect(composer).toHaveText(draft)

    const otherFailures = collectFailures(secondPage)
    await loginWidget(secondPage)
    await expectWidgetBoots(secondPage, otherFailures)
    const otherComposer = secondPage.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect(otherComposer).toHaveText(draft)
    await otherComposer.click()
    await expect(otherComposer).toBeFocused()
    await secondPage.keyboard.press('ControlOrMeta+Backquote')
    const terminal = secondPage.getByRole('dialog', {name: 'conciv quick terminal'})
    await expect(terminal.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText(draft)

    await terminal.getByRole('button', {name: 'Close pane'}).click()
    const deleted = page.getByRole('region', {name: 'Deleted session'})
    await expect(deleted.getByRole('status')).toHaveText('This session was deleted.')
    await expect(deleted.getByText('Your draft moves to the new session.')).toBeVisible()

    await deleted.getByRole('button', {name: 'New session'}).click()
    await expect(page.getByText('Started a new session')).toBeVisible()
    await expect(composer).toHaveText(draft)
  })
})
