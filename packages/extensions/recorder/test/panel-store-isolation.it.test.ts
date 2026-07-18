import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

describe('panel replay does not mutate solid stores (real browser)', () => {
  it('keeps rrweb writes off the query-cache events through scrub and return to live', async () => {
    const page = api().page
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Cannot mutate a Store')) warnings.push(message.text())
    })
    const label = await addMarker(page)
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expect
      .poll(() => page.frameLocator('iframe').getByText(label, {exact: true}).count(), {timeout: 20_000})
      .toBeGreaterThan(0)
    await page.waitForTimeout(1_500)
    await addMarker(page)
    await page.waitForTimeout(1_500)
    await addMarker(page)
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
