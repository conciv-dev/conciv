import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('panel opened before any interaction (real browser)', () => {
  it('recovers from the empty state and starts the live replay without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Late fixture'
      button.style.cssText = 'position:fixed;bottom:0;left:0;z-index:2147483647'
      document.body.appendChild(button)
    })
    await api().page.getByRole('button', {name: 'Late fixture'}).click()
    await api().page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expect
      .poll(() => api().page.frameLocator('iframe').getByText('Late fixture', {exact: true}).count(), {timeout: 20_000})
      .toBeGreaterThan(0)
    await api().page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await api().page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
  }, 120_000)
})
