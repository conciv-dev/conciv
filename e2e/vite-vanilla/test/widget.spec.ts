import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, holdEngineCall, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget on a plain vite page', () => {
  test('the user signs in by magic link and the widget opens on a plain vite page with no error', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
  })

  test('the model menu offers a harness for each agent CLI on the PATH and none for a CLI that is missing', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await page.getByRole('button', {name: /^Model: /}).click()

    const menu = page.getByRole('dialog', {name: 'Model'})
    await expect(menu.getByRole('group', {name: 'Codex'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'Gemini CLI'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'OpenCode'})).toHaveCount(0)
    await expect(menu.getByRole('group', {name: 'Pi'})).toHaveCount(0)
  })
})

test.describe('the user types into the host page with the panel open', () => {
  test('the keys go to the host field and the composer stays empty', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const search = page.getByRole('textbox', {name: 'Search plants'})

    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('Boston fern? /k')

    await expect(search).toHaveValue('Boston fern? /k')
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('')
  })
})

test.describe('the terminal gives focus back to the host', () => {
  test('a click on a host field moves focus out of the terminal and the keys go to the host field', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('tab', {name: 'Terminal'}).click()
    const terminalInput = page.getByRole('textbox', {name: 'Terminal input'})
    await expect(terminalInput).toBeFocused()

    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await expect(terminalInput).not.toBeFocused()
    await page.keyboard.type('ls -la')

    await expect(search).toHaveValue('ls -la')
    await expect(search).toBeFocused()
  })
})

test.describe('the user types in the page while the Recorder tab replays live', () => {
  test('a click on a page field takes focus out of the panel, and the live replay leaves it there while the user types', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('B')
    await expect(page.getByText('Searching for B')).toBeVisible()

    const replay = page.frames().find((frame) => frame !== page.mainFrame())
    if (!replay) throw new Error('the Recorder tab drew no replay frame')
    await expect(replay.getByText('Searching for B')).toBeVisible()
    await expect(search).toBeFocused()
    await page.keyboard.type('oston fern')

    await expect(search).toHaveValue('Boston fern')
    await expect(search).toBeFocused()
  })
})

test.describe('the user exports, sends and restarts a recording while the engine fails the recorder calls', () => {
  test('a failed export, send and new recording each show their toast, and the export tried again downloads the video', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)

    const failedExport = await holdEngineCall(page, ['plugin', 'call'], {
      armed: false,
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    failedExport.arm()
    await page.getByRole('button', {name: 'Export video'}).click()
    await expect(page.getByRole('alert').filter({hasText: 'Could not export the recording. Try again.'})).toBeVisible()
    failedExport.release()

    const download = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Export video'}).click()
    expect((await download).suggestedFilename()).toBe('recording.webm')
    await expect(page.getByRole('button', {name: 'Export video'})).toBeEnabled()

    const failedSend = await holdEngineCall(page, ['plugin', 'call'], {
      armed: false,
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    failedSend.arm()
    await page.getByRole('button', {name: 'Send to agent'}).click()
    await expect(page.getByRole('alert').filter({hasText: 'Could not save the recording. Try again.'})).toBeVisible()
    failedSend.release()

    const failedReset = await holdEngineCall(page, ['plugin', 'call'], {
      armed: false,
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    failedReset.arm()
    await page.getByRole('button', {name: 'New recording'}).click()
    await expect(
      page.getByRole('alert').filter({hasText: 'Could not start a new recording. Is the page still connected?'}),
    ).toBeVisible()
    failedReset.release()
  })
})

test.describe('the Recorder tab when its recording cannot be read', () => {
  test('a failed recording read shows Could not load the recording, and Retry brings the live replay back', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const failedRead = await holdEngineCall(page, ['plugin', 'call'], {
      armed: false,
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    failedRead.arm()
    await page.getByRole('tab', {name: 'Recorder'}).click()
    const notice = page.getByRole('alert').filter({hasText: 'Could not load the recording.'})
    await expect(notice).toBeVisible()
    failedRead.release()
    await notice.getByRole('button', {name: 'Retry'}).click()

    await expect(page.getByText('LIVE')).toBeVisible()
    await expect(notice).toHaveCount(0)
  })

  test('a capture library the engine cannot serve leaves the tab saying recording is unavailable', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await holdEngineCall(page, ['plugin', 'experimentalChunk'], {when: () => true, fail: 'PLUGIN_CHUNK_NOT_FOUND'})
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('tab', {name: 'Recorder'}).click()

    await expect(page.getByText('Recording is unavailable: capture failed to start on this page.')).toBeVisible()
    await expect(page.getByText('LIVE')).toHaveCount(0)
  })

  test('with the page plugin failed to load, the tab says recording is off', async ({page}) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await page.route(/\/renderer-[^/]*\.js(\?|$)/, async (route) => {
      const response = await route.fetch()
      if ((await response.text()).includes('Page tools stopped working. Reload the page.')) return route.abort()
      return route.fulfill({response})
    })
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('tab', {name: 'Recorder'}).click()

    await expect(
      page.getByText('Recording is off: the page plugin is not active, so nothing is recorded.'),
    ).toBeVisible()
    await expect(page.getByText('LIVE')).toHaveCount(0)
  })
})

test.describe('the terminal when its code fails to load', () => {
  test('a terminal chunk that fails to load shows Couldn’t open the terminal, and Retry opens it once the chunk loads', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const terminalChunk = /\/terminal-surface[^/]*\.js(\?|$)/
    await page.route(terminalChunk, (route) => route.abort())

    await page.getByRole('tab', {name: 'Terminal'}).click()
    const notice = page.getByRole('alert').filter({hasText: 'Couldn’t open the terminal.'})
    await expect(notice).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Terminal input'})).toHaveCount(0)

    await page.unroute(terminalChunk)
    await notice.getByRole('button', {name: 'Retry'}).click()

    await expect(page.getByRole('textbox', {name: 'Terminal input'})).toBeFocused()
    await expect(notice).toHaveCount(0)
  })
})

test.describe('switching to another harness when the engine refuses the switch', () => {
  const refusals: {
    code: 'SESSION_RUNNING' | 'UNKNOWN_HARNESS' | 'UNKNOWN_MODEL' | 'INTERNAL_SERVER_ERROR'
    notice: string
  }[] = [
    {code: 'SESSION_RUNNING', notice: 'Wait for the reply to finish, then switch to Gemini CLI.'},
    {code: 'UNKNOWN_HARNESS', notice: 'Gemini CLI is no longer available.'},
    {code: 'UNKNOWN_MODEL', notice: 'gemini-2.5-flash (Gemini CLI) is no longer available.'},
    {code: 'INTERNAL_SERVER_ERROR', notice: 'Couldn’t switch to gemini-2.5-flash (Gemini CLI).'},
  ]
  for (const {code, notice} of refusals) {
    test(`the user picks a Gemini CLI model, the engine refuses the switch with ${code}, a notice says "${notice}", and the session keeps its model`, async ({
      page,
    }) => {
      const failures = collectFailures(page)
      await loginWidget(page)
      await expectWidgetBoots(page, failures)
      await holdEngineCall<['sessions', 'switchHarness']>(page, ['sessions', 'switchHarness'], {fail: code})
      await page.reload({waitUntil: 'domcontentloaded'})

      await page.getByRole('button', {name: /^Model: /}).click()
      const search = page.getByRole('textbox', {name: 'Search models'})
      await expect(search).toBeFocused()
      await search.pressSequentially('gemini-2.5-flash')
      await page.getByRole('option', {name: 'gemini-2.5-flash (Gemini CLI)'}).click()

      await expect(page.getByRole('status').filter({hasText: notice})).toBeVisible()
      await expect(page.getByRole('button', {name: /^Model: /})).toBeVisible()
      await expect(page.getByRole('button', {name: /^Model: gemini-2\.5-flash/})).toHaveCount(0)
    })
  }
})

test.describe('the model menu when the engine fails to list models', () => {
  test('the engine fails every read of the session’s models, the prompt says conciv couldn’t load models, and once the engine answers Retry shows the session model', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const models = await holdEngineCall(page, ['meta', 'models'], {when: () => true, fail: 'INTERNAL_SERVER_ERROR'})
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('button', {name: 'Couldn’t load models'}).click()
    const retry = page.getByRole('button', {name: 'Couldn’t load models: Retry loading models'})
    await expect(retry).toBeVisible()

    models.release()
    await retry.click()
    await expect(page.getByRole('button', {name: /^Model: /})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Couldn’t load models'})).toHaveCount(0)
  })

  test('the engine fails every read of the other harnesses, the menu says conciv couldn’t load them, and once the engine answers Retry lists Codex and Gemini CLI', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const harnesses = await holdEngineCall(page, ['meta', 'harnesses'], {
      when: () => true,
      fail: 'INTERNAL_SERVER_ERROR',
    })
    await page.reload({waitUntil: 'domcontentloaded'})

    await page.getByRole('button', {name: /^Model: /}).click()
    const menu = page.getByRole('dialog', {name: 'Model'})
    const retry = menu.getByRole('button', {name: 'Couldn’t load the other harnesses: Retry loading models'})
    await expect(retry).toBeVisible()
    await expect(menu.getByRole('group', {name: 'Gemini CLI'})).toHaveCount(0)

    harnesses.release()
    await retry.click()
    await expect(menu.getByRole('group', {name: 'Codex'})).toBeVisible()
    await expect(menu.getByRole('group', {name: 'Gemini CLI'})).toBeVisible()
    await expect(retry).toHaveCount(0)
  })
})
