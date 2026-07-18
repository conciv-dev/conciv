import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('panel opened before any interaction (real browser)', () => {
  it('recovers from the empty state and starts the live replay without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Late fixture'
      button.id = 'late-fixture'
      document.body.appendChild(button)
    })
    await api().page.click('#late-fixture')
    await api().page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expect
      .poll(
        () =>
          api().page.evaluate(() => {
            const iframe = document.querySelector('.rr-player iframe')
            const body = iframe instanceof HTMLIFrameElement ? iframe.contentDocument?.body : null
            return (body?.textContent ?? '').includes('Late fixture')
          }),
        {timeout: 20_000},
      )
      .toBe(true)
    expect(await api().page.evaluate(() => Boolean(document.querySelector('.rr-controller')))).toBe(true)
  }, 120_000)
})
