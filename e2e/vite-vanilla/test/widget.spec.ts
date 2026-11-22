import {stat} from 'node:fs/promises'
import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget on a plain vite page', () => {
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
