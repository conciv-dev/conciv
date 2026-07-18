import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('panel replay does not mutate solid stores (real browser)', () => {
  it('keeps rrweb writes off the query-cache events through scrub and return to live', async () => {
    const page = api().page
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Cannot mutate a Store')) warnings.push(message.text())
    })
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Isolation marker'
      button.style.cssText = 'position:fixed;bottom:0;left:0;z-index:2147483647'
      document.body.appendChild(button)
    })
    await page.getByRole('button', {name: 'Isolation marker'}).click()
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expect
      .poll(() => page.frameLocator('iframe').getByText('Isolation marker', {exact: true}).count(), {timeout: 20_000})
      .toBeGreaterThan(0)
    await page.waitForTimeout(1_500)
    await page.getByRole('button', {name: 'Isolation marker'}).click()
    await page.waitForTimeout(1_500)
    await page.getByRole('button', {name: 'Isolation marker'}).click()
    const timeline = page.getByRole('slider', {name: 'Timeline'})
    await timeline.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.getByRole('button', {name: 'Toggle playback'}).click()
    await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Go live'}).click()
    await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.waitForTimeout(1_000)
    expect(warnings).toEqual([])
  }, 120_000)
})
