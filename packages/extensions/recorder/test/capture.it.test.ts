import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeExtRpcClient} from '@conciv/extension'
import type {RecorderRouter} from '../src/server.js'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('recorder end to end (real browser, real engine)', () => {
  it('records real page interaction and recording_pull returns a matching action log', async () => {
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Order pizza'
      document.body.appendChild(button)
    })
    await api().page.getByRole('button', {name: 'Order pizza'}).click()
    const result = await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    const text = JSON.stringify(result)
    expect(text).toContain('click')
    expect(text).toContain('Order pizza')
  }, 120_000)

  it('marked capture start/stop brackets the actions in between', async () => {
    const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'During capture'
      document.body.appendChild(button)
    })
    await api().page.getByRole('button', {name: 'During capture'}).click()
    const stopped = await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
    expect(JSON.stringify(stopped)).toContain('During capture')
  }, 120_000)

  it('never captures conciv-injected light-DOM styles, so no multi-megabyte events', async () => {
    await api().page.evaluate(() => {
      const style = document.createElement('style')
      style.setAttribute('data-conciv-fonts', '')
      style.textContent = `@font-face{font-family:'Fake';src:url(data:font/woff2;base64,${'A'.repeat(2_000_000)}) format('woff2')}`
      document.head.appendChild(style)
      const button = document.createElement('button')
      button.textContent = 'After fonts'
      document.body.appendChild(button)
    })
    await api().page.getByRole('button', {name: 'After fonts'}).click()
    const rpc = makeExtRpcClient<RecorderRouter>(api().apiBase, 'recorder')
    await expect
      .poll(async () => JSON.stringify((await rpc.window({})).events).includes('After fonts'), {timeout: 20_000})
      .toBe(true)
    const {events} = await rpc.window({})
    const largest = Math.max(...events.map((event) => JSON.stringify(event).length))
    expect(largest).toBeLessThan(500_000)
  }, 120_000)

  it('panel loads a live replay (reconstructed page) and follows new page activity without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const send = api().page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    const replay = api().page.frameLocator('iframe')
    await expect
      .poll(() => replay.getByText('Comment target', {exact: true}).count(), {timeout: 15_000})
      .toBeGreaterThan(0)
    await api().page.evaluate(() => {
      const marker = document.createElement('button')
      marker.textContent = 'Live follow marker'
      document.body.appendChild(marker)
    })
    await expect
      .poll(() => replay.getByText('Live follow marker', {exact: true}).count(), {timeout: 20_000})
      .toBeGreaterThan(0)
  }, 120_000)
})
