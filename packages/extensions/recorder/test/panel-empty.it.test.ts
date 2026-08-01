import {describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

describe('panel opened before any interaction (real browser)', () => {
  it('recovers from the empty state and starts the live replay without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const label = await addMarker(api().page)
    await api().page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expectLocator(api().page.frameLocator('iframe').getByText(label, {exact: true}).first()).toBeAttached({
      timeout: 30_000,
    })
    await api().page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await api().page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
  }, 120_000)
})
