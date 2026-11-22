import {stat} from 'node:fs/promises'
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
  test('keys typed in the host field reach the host page key handler, and keys typed in the composer never do', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await expect(page.getByText('Keys the page received: 0')).toBeVisible()

    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('fern')
    await expect(search).toHaveValue('fern')
    await expect(page.getByText('Keys the page received: 4')).toBeVisible()

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.type('water the fern')
    await expect(composer).toHaveText('water the fern')

    await expect(page.getByText('Keys the page received: 4')).toBeVisible()
    await expect(search).toHaveValue('fern')
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
      await holdEngineCall(page, ['sessions', 'switchHarness'], {fail: code})
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

test.describe('exporting a screen recording of the vite vanilla page', () => {
  test('the user exports the live recording as a video, sends it to the composer, plays it and exports the same video from the replay', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE')).toBeVisible()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await page.keyboard.type('Boston fern')
    await expect(page.getByText('Searching for Boston fern')).toBeVisible()

    const panelDownload = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Export video'}).click()
    const panelVideo = await panelDownload
    expect(panelVideo.suggestedFilename()).toBe('recording.webm')
    expect((await stat(await panelVideo.path())).size).toBeGreaterThan(0)

    await page.getByRole('button', {name: 'Send to agent'}).click()
    const notes = page.getByRole('list', {name: 'Notes'})
    await expect(notes.getByText('Screen recording', {exact: true})).toBeVisible()
    await notes.getByRole('button', {name: 'Play'}).click()
    const replay = page.getByRole('dialog', {name: 'Screen recording replay'})
    await expect(replay).toBeVisible()

    const replayDownload = page.waitForEvent('download')
    await replay.getByRole('button', {name: 'Export video'}).click()
    const replayVideo = await replayDownload
    expect(replayVideo.suggestedFilename()).toBe('recording.webm')
    expect((await stat(await replayVideo.path())).size).toBeGreaterThan(0)
  })
})

test.describe('the engine address a vite vanilla page gives the widget', () => {
  test('an address the page sets as a global wins over the meta tag, and the meta tag wins over ?core=', async ({
    page,
  }) => {
    const globalSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await page.goto('/api-base.html', {waitUntil: 'domcontentloaded'})
    expect(new URL((await globalSocket).url()).host).toBe('127.0.0.1:1')

    const failures = collectFailures(page)
    await loginWidget(page, '/?core=http://127.0.0.1:1')
    await expectWidgetBoots(page, failures)
  })
})

test.describe('the standalone conciv page on the vite vanilla engine', () => {
  test('the standalone page takes its engine address from ?core= and opens the panel because ?settings= says so', async ({
    page,
  }) => {
    const hostSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    const engine = new URL((await hostSocket).url())
    engine.protocol = engine.protocol === 'wss:' ? 'https:' : 'http:'
    const standalone = new URL('http://localhost:4330/')
    standalone.searchParams.set('core', engine.origin)
    standalone.searchParams.set('settings', JSON.stringify({defaultOpen: true}))

    await loginWidget(page, standalone.href)

    await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  })
})
