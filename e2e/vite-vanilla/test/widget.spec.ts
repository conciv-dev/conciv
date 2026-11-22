import {stat} from 'node:fs/promises'
import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

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
