import {describe, expect, it} from 'vitest'
import type {Page} from 'playwright-core'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

async function addPageButton(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(
    ([buttonId, label]) => {
      const button = document.createElement('button')
      button.textContent = String(label)
      button.id = String(buttonId)
      const slot = document.querySelectorAll('[data-dvr-fixture]').length
      button.setAttribute('data-dvr-fixture', '')
      const column = slot % 5
      const row = Math.floor(slot / 5)
      button.style.cssText = `position:fixed;bottom:${row * 36}px;left:${column * 180}px;z-index:2147483647`
      document.body.appendChild(button)
    },
    [id, text],
  )
  await page.click(`#${id}`)
}

function replayFrameContains(page: Page, text: string): Promise<boolean> {
  return page.evaluate((needle) => {
    const iframe = document.querySelector('.rr-player iframe')
    const body = iframe instanceof HTMLIFrameElement ? iframe.contentDocument?.body : null
    return (body?.textContent ?? '').includes(needle)
  }, text)
}

function hasController(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.querySelector('.rr-controller')))
}

async function openPanelFollowing(page: Page, marker: string): Promise<void> {
  await addPageButton(page, `fixture-${marker}`, `Marker ${marker}`)
  await page.getByRole('tab', {name: 'Recorder'}).click()
  await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
  await expect.poll(() => replayFrameContains(page, `Marker ${marker}`), {timeout: 20_000}).toBe(true)
}

describe('panel DVR mode model (real browser)', () => {
  it('follows live by default: LIVE badge and pause affordance, no dead controller', async () => {
    const page = api().page
    await openPanelFollowing(page, 'follow')
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Pause', exact: true}).waitFor({state: 'visible', timeout: 10_000})
    expect(await hasController(page)).toBe(false)
  }, 120_000)

  it('pause detaches from live and go live re-attaches to the tail', async () => {
    const page = api().page
    await openPanelFollowing(page, 'detach')
    await page.getByRole('button', {name: 'Pause', exact: true}).click()
    await page.getByRole('button', {name: 'Go live', exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => hasController(page), {timeout: 10_000}).toBe(true)

    await addPageButton(page, 'fixture-offair', 'Marker offair')
    await page.waitForTimeout(2_500)
    expect(await replayFrameContains(page, 'Marker offair')).toBe(false)

    await page.getByRole('button', {name: 'Go live', exact: true}).click()
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await expect.poll(() => replayFrameContains(page, 'Marker offair'), {timeout: 20_000}).toBe(true)
    expect(await hasController(page)).toBe(false)
  }, 120_000)

  it('paused timeline stays frozen while the page keeps producing events', async () => {
    const page = api().page
    await openPanelFollowing(page, 'freeze')
    await page.getByRole('button', {name: 'Pause', exact: true}).click()
    await expect.poll(() => hasController(page), {timeout: 10_000}).toBe(true)
    const readTimeline = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.rr-timeline__time'))
          .map((el) => el.textContent)
          .join('/'),
      )
    const before = await readTimeline()
    await addPageButton(page, 'fixture-freeze-noise-1', 'Marker freeze-noise-1')
    await page.waitForTimeout(1_500)
    await addPageButton(page, 'fixture-freeze-noise-2', 'Marker freeze-noise-2')
    await page.waitForTimeout(1_500)
    expect(await readTimeline()).toBe(before)
    await page.getByRole('button', {name: 'Go live', exact: true}).click()
    await expect.poll(() => replayFrameContains(page, 'Marker freeze-noise-2'), {timeout: 20_000}).toBe(true)
  }, 120_000)

  it('paused controller actually replays: scrub to start hides late content, play catches back up', async () => {
    const page = api().page
    await openPanelFollowing(page, 'scrub-base')
    await page.waitForTimeout(1_500)
    await addPageButton(page, 'fixture-scrub-late', 'Marker scrub-late')
    await expect.poll(() => replayFrameContains(page, 'Marker scrub-late'), {timeout: 20_000}).toBe(true)
    await page.waitForTimeout(1_500)
    await addPageButton(page, 'fixture-scrub-tail', 'Marker scrub-tail')
    await expect.poll(() => replayFrameContains(page, 'Marker scrub-tail'), {timeout: 20_000}).toBe(true)

    await page.getByRole('button', {name: 'Pause', exact: true}).click()
    await expect.poll(() => hasController(page), {timeout: 10_000}).toBe(true)
    expect(await replayFrameContains(page, 'Marker scrub-late')).toBe(true)

    const progress = await page.evaluate(() => {
      const bar = document.querySelector('.rr-progress')
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      return {left: rect.left, top: rect.top, width: rect.width, height: rect.height}
    })
    if (!progress) throw new Error('progress bar not visible')
    await page.mouse.click(progress.left + Math.round(progress.width * 0.05), progress.top + progress.height / 2)
    await expect.poll(() => replayFrameContains(page, 'Marker scrub-late'), {timeout: 10_000}).toBe(false)

    await page.mouse.click(progress.left + progress.width - 2, progress.top + progress.height / 2)
    await expect.poll(() => replayFrameContains(page, 'Marker scrub-late'), {timeout: 10_000}).toBe(true)
  }, 120_000)
})
