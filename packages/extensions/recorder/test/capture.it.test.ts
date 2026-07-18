import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

describe('recorder end to end (real browser, real engine)', () => {
  it('records real page interaction and recording_pull returns a matching action log', async () => {
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Order pizza'
      button.id = 'order'
      document.body.appendChild(button)
    })
    await api().page.click('#order')
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
      button.id = 'during'
      document.body.appendChild(button)
    })
    await api().page.click('#during')
    const stopped = await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
    expect(JSON.stringify(stopped)).toContain('During capture')
  }, 120_000)

  it('panel loads a live replay (reconstructed page) and follows new page activity without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const send = api().page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    const readReplay = () =>
      api().page.evaluate(() => {
        const iframe = document.querySelector('.rr-player iframe')
        const body = iframe instanceof HTMLIFrameElement ? iframe.contentDocument?.body : null
        return {reconstructedChildren: body?.childElementCount ?? 0, reconstructedText: body?.textContent ?? ''}
      })
    await expect.poll(async () => (await readReplay()).reconstructedChildren, {timeout: 15_000}).toBeGreaterThan(0)
    expect((await readReplay()).reconstructedText).toContain('Comment target')
    await api().page.evaluate(() => {
      const marker = document.createElement('button')
      marker.textContent = 'Live follow marker'
      marker.id = 'live-marker'
      document.body.appendChild(marker)
    })
    await expect
      .poll(async () => (await readReplay()).reconstructedText, {timeout: 20_000})
      .toContain('Live follow marker')
  }, 120_000)
})
