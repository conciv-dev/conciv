import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright-core'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

const replayed = (page: Page, text: string) => page.frameLocator('iframe').getByText(text, {exact: true}).first()

function replayShows(page: Page, text: string): Promise<boolean> {
  return replayed(page, text)
    .count()
    .then((found) => found > 0)
}

async function scrubBack(page: Page, presses: number): Promise<void> {
  const timeline = page.getByRole('slider', {name: 'Timeline'})
  await timeline.focus()
  for (let press = 0; press < presses; press += 1) await page.keyboard.press('ArrowLeft')
}

async function openPanelStreaming(page: Page): Promise<string> {
  const label = await addMarker(page)
  await page.getByRole('tab', {name: 'Recorder'}).click()
  await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
  await expectLocator(replayed(page, label)).toBeAttached({timeout: 30_000})
  return label
}

describe('panel stream replay (real browser)', () => {
  it('streams live by default with a working, accessible controller', async () => {
    const page = api().page
    await openPanelStreaming(page)
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Toggle playback'}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Toggle fullscreen'}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
    const followed = await addMarker(page)
    await expectLocator(replayed(page, followed)).toBeAttached({timeout: 30_000})
  }, 120_000)

  it('scrubbing back leaves the live edge and Go live returns to it', async () => {
    const page = api().page
    await openPanelStreaming(page)
    await page.waitForTimeout(1_500)
    const late = await addMarker(page)
    await expectLocator(replayed(page, late)).toBeAttached({timeout: 30_000})

    await scrubBack(page, 4)
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
    await expectLocator(replayed(page, late)).not.toBeAttached({timeout: 30_000})

    await page.getByRole('button', {name: 'Go live'}).click()
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await expectLocator(replayed(page, late)).toBeAttached({timeout: 30_000})
  }, 120_000)

  it('pausing playback detaches from live and playing catches back up', async () => {
    const page = api().page
    await openPanelStreaming(page)
    await page.getByRole('button', {name: 'Toggle playback'}).click()
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})

    const missed = await addMarker(page)
    await page.waitForTimeout(2_500)
    expect(await replayShows(page, missed)).toBe(false)

    await page.getByRole('button', {name: 'Toggle playback'}).click()
    await expectLocator(replayed(page, missed)).toBeAttached({timeout: 30_000})
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
  }, 120_000)
})
