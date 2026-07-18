import {describe, expect, it} from 'vitest'
import type {Page} from 'playwright-core'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

function replayShows(page: Page, text: string): Promise<boolean> {
  return page
    .frameLocator('iframe')
    .getByText(text, {exact: true})
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
  await expect.poll(() => replayShows(page, label), {timeout: 30_000}).toBe(true)
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
    await expect.poll(() => replayShows(page, followed), {timeout: 30_000}).toBe(true)
  }, 120_000)

  it('scrubbing back leaves the live edge and Go live returns to it', async () => {
    const page = api().page
    await openPanelStreaming(page)
    await page.waitForTimeout(1_500)
    const late = await addMarker(page)
    await expect.poll(() => replayShows(page, late), {timeout: 30_000}).toBe(true)

    await scrubBack(page, 4)
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => replayShows(page, late), {timeout: 30_000}).toBe(false)

    await page.getByRole('button', {name: 'Go live'}).click()
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => replayShows(page, late), {timeout: 30_000}).toBe(true)
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
    await expect.poll(() => replayShows(page, missed), {timeout: 30_000}).toBe(true)
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
  }, 120_000)
})
