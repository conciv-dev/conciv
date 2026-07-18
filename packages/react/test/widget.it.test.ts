import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootWidgetKit, type WidgetKit} from './helpers/boot.js'
import {serveDist} from './helpers/host.js'

let browser: Browser
let kit: WidgetKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootWidgetKit()
  host = await serveDist()
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openPage(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(`${host.base}/?core=${encodeURIComponent(kit.base)}`, {waitUntil: 'domcontentloaded'})
  return page
}

const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

describe('ConcivWidget in a real React app', () => {
  it('mounts exactly one widget under StrictMode', async () => {
    const page = await openPage()
    await expect.poll(() => fab(page).count(), {timeout: 15_000}).toBe(1)
    expect(await fab(page).count()).toBe(1)
    await page.close()
  })

  it('removing the component removes the widget, re-adding restores it', async () => {
    const page = await openPage()
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect.poll(() => fab(page).count(), {timeout: 10_000}).toBe(0)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.close()
  })

  it('a settings prop change remounts the widget with the new configuration', async () => {
    const page = await openPage()
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.getByRole('button', {name: 'open by default'}).click()
    await expect.poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 15_000}).toBe(true)
    expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(1)
    await page.close()
  })
})
