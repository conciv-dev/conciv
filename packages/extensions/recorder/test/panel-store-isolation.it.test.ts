import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('panel replay does not mutate solid stores (real browser)', () => {
  it('keeps rrweb writes off the query-cache events through a full mode cycle', async () => {
    const page = api().page
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Cannot mutate a Store')) warnings.push(message.text())
    })
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Isolation marker'
      button.id = 'isolation-marker'
      button.style.cssText = 'position:fixed;bottom:0;left:0;z-index:2147483647'
      document.body.appendChild(button)
    })
    await page.click('#isolation-marker')
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const iframe = document.querySelector('.rr-player iframe')
            const body = iframe instanceof HTMLIFrameElement ? iframe.contentDocument?.body : null
            return (body?.textContent ?? '').includes('Isolation marker')
          }),
        {timeout: 20_000},
      )
      .toBe(true)
    await page.getByRole('button', {name: 'Pause', exact: true}).click()
    await page.getByRole('button', {name: 'Go live', exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.getByRole('button', {name: 'Go live', exact: true}).click()
    await page.getByRole('button', {name: 'Pause', exact: true}).waitFor({state: 'visible', timeout: 10_000})
    await page.waitForTimeout(1_000)
    expect(warnings).toEqual([])
  }, 120_000)
})
