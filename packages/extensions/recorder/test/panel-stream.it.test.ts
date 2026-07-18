import {describe, expect, it} from 'vitest'
import type {Page} from 'playwright-core'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

async function addPageButton(page: Page, text: string): Promise<void> {
  await page.evaluate((label) => {
    const button = document.createElement('button')
    button.textContent = label
    const slot = document.querySelectorAll('[data-stream-fixture]').length
    button.setAttribute('data-stream-fixture', '')
    const column = slot % 5
    const row = Math.floor(slot / 5)
    button.style.cssText = `position:fixed;bottom:${row * 36}px;left:${column * 180}px;z-index:2147483647`
    document.body.appendChild(button)
  }, text)
  await page.getByRole('button', {name: text}).click()
}

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

async function openPanelStreaming(page: Page, marker: string): Promise<void> {
  await addPageButton(page, `Marker ${marker}`)
  await page.getByRole('tab', {name: 'Recorder'}).click()
  await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
  await expect.poll(() => replayShows(page, `Marker ${marker}`), {timeout: 20_000}).toBe(true)
}

describe('panel stream replay (real browser)', () => {
  it('streams live by default with a working, accessible controller', async () => {
    const page = api().page
    await openPanelStreaming(page, 'alpha')
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Toggle playback'}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Toggle fullscreen'}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
    await addPageButton(page, 'Marker bravo')
    await expect.poll(() => replayShows(page, 'Marker bravo'), {timeout: 20_000}).toBe(true)
  }, 120_000)

  it('scrubbing back leaves the live edge and Go live returns to it', async () => {
    const page = api().page
    await openPanelStreaming(page, 'charlie')
    await page.waitForTimeout(1_500)
    await addPageButton(page, 'Marker delta')
    await expect.poll(() => replayShows(page, 'Marker delta'), {timeout: 20_000}).toBe(true)

    await scrubBack(page, 4)
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => replayShows(page, 'Marker delta'), {timeout: 10_000}).toBe(false)

    await page.getByRole('button', {name: 'Go live'}).click()
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => replayShows(page, 'Marker delta'), {timeout: 20_000}).toBe(true)
  }, 120_000)

  it('pausing playback detaches from live and playing catches back up', async () => {
    const page = api().page
    await openPanelStreaming(page, 'echo')
    await page.getByRole('button', {name: 'Toggle playback'}).click()
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})

    await addPageButton(page, 'Marker foxtrot')
    await page.waitForTimeout(2_500)
    expect(await replayShows(page, 'Marker foxtrot')).toBe(false)

    await page.getByRole('button', {name: 'Toggle playback'}).click()
    await expect.poll(() => replayShows(page, 'Marker foxtrot'), {timeout: 30_000}).toBe(true)
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
  }, 120_000)
})
