import {stat} from 'node:fs/promises'
import {expect, test} from '@internal/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@internal/e2e-utils/widget'

test.describe('grabbing an element of the vite react host page', () => {
  test('the user picks a heading of the host page, the composer stages it with its source file and line, and the user removes it', async ({
    page,
  }) => {
    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Select an element from the page'}).click()
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await page.getByRole('heading', {name: 'Get started'}).click({force: true})

    await expect(page.getByRole('button', {name: 'Open grabbed element'})).toBeVisible()
    await expect(page.getByText(/^in .*src\/App\.tsx:\d+/)).toBeVisible()

    await page.getByRole('button', {name: 'Remove Grabbed element'}).click()
    await expect(page.getByRole('button', {name: 'Open grabbed element'})).not.toBeVisible()
  })
})

test.describe('the user types into the host page with the panel open', () => {
  test('a click on a host field moves focus out of the terminal and the keys go to the host field, and keys typed in the composer never reach the host page key handler', async ({
    page,
  }) => {
    await expect(page.getByText('Keys the page received: 0')).toBeVisible()

    await page.getByRole('tab', {name: 'Terminal'}).click()
    const terminalInput = page.getByRole('textbox', {name: 'Terminal input'})
    await expect(terminalInput).toBeFocused()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await expect(terminalInput).not.toBeFocused()
    await page.keyboard.type('fern')
    await expect(search).toHaveValue('fern')
    await expect(search).toBeFocused()
    await expect(page.getByText('Keys the page received: 4')).toBeVisible()

    await page.getByRole('tab', {name: 'Chat'}).click()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await page.keyboard.type('water the fern')
    await expect(composer).toHaveText('water the fern')

    await expect(page.getByText('Keys the page received: 4')).toBeVisible()
    await expect(search).toHaveValue('fern')
  })
})

test.describe('the engine address a vite react page gives the widget', () => {
  test.use({signedIn: false})

  test('an address the page sets as a global wins over the meta tag, and the meta tag wins over ?core=', async ({
    page,
    secondPage,
  }) => {
    const globalSocket = secondPage.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/rpc-ws')
    await secondPage.goto('/api-base.html', {waitUntil: 'domcontentloaded'})
    expect(new URL((await globalSocket).url()).host).toBe('127.0.0.1:1')

    const failures = collectFailures(page)
    await loginWidget(page, '/?core=http://127.0.0.1:1')
    await expectWidgetBoots(page, failures)
  })
})

test.describe('the Recorder tab recording the vite react host page', () => {
  test('a click on a page field takes focus out of the panel and the live replay leaves it there while the user types, then the user exports the live recording as a video, sends it to the composer, plays it and exports the same video from the replay', async ({
    page,
  }) => {
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByText('LIVE', {exact: true})).toBeVisible()
    const search = page.getByRole('textbox', {name: 'Search plants'})
    await search.click()
    await expect(search).toBeFocused()
    await page.keyboard.type('B')
    await expect(page.getByText('Searching for B')).toBeVisible()

    const replayFrame = page.frames().find((frame) => frame !== page.mainFrame())
    if (!replayFrame) throw new Error('the Recorder tab drew no replay frame')
    await expect(replayFrame.getByText('Searching for B')).toBeVisible()
    await expect(search).toBeFocused()
    await page.keyboard.type('oston fern')

    await expect(search).toHaveValue('Boston fern')
    await expect(search).toBeFocused()
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
