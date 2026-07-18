import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeExtRpcClient} from '@conciv/extension'
import type {RecorderRouter} from '../src/server.js'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

function recorderRpc() {
  return makeExtRpcClient<RecorderRouter>(api().apiBase, 'recorder')
}

async function windowJson(): Promise<string> {
  return JSON.stringify((await recorderRpc().window({})).events)
}

describe('recorder end to end (real browser, real engine)', () => {
  it('records real page interaction and recording_pull returns a matching action log', async () => {
    await addMarker(api().page)
    const result = await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    const text = JSON.stringify(result)
    expect(text).toContain('click')
    expect(text).toContain('Add marker')
  }, 120_000)

  it('marked capture start/stop brackets the actions in between', async () => {
    const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
    await addMarker(api().page)
    const stopped = await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
    expect(JSON.stringify(stopped)).toContain('Add marker')
  }, 120_000)

  it('strips script bodies from snapshots (slimDOM) so page code never bloats the ring', async () => {
    const label = await addMarker(api().page)
    await expect.poll(async () => (await windowJson()).includes(label), {timeout: 30_000}).toBe(true)
    const stored = await windowJson()
    expect(stored).toContain('Comment target')
    expect(stored).not.toContain('FIXTURE_SCRIPT_BODY')
  }, 120_000)

  it('samples input events to the last value instead of one event per keystroke', async () => {
    const field = api().page.getByRole('textbox', {name: 'Fixture input'})
    await field.click()
    await field.pressSequentially('sampling', {delay: 40})
    await field.press('Tab')
    await expect.poll(async () => (await windowJson()).includes('sampling'), {timeout: 30_000}).toBe(true)
    const {events} = await recorderRpc().window({})
    const inputEvents = events.filter((event) => JSON.stringify(event).includes('"text":"s'))
    expect(inputEvents.length).toBeLessThan(4)
  }, 120_000)

  it('never captures conciv-marked light-DOM styles, so no multi-megabyte events', async () => {
    const label = await addMarker(api().page)
    await expect.poll(async () => (await windowJson()).includes(label), {timeout: 30_000}).toBe(true)
    const {events} = await recorderRpc().window({})
    expect(JSON.stringify(events)).not.toContain('CONCIV_FONT_FIXTURE')
    const largest = Math.max(...events.map((event) => JSON.stringify(event).length))
    expect(largest).toBeLessThan(500_000)
  }, 120_000)

  it('panel loads a live replay (reconstructed page) and follows new page activity without reopening', async () => {
    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const send = api().page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    const replay = api().page.frameLocator('iframe')
    await expect
      .poll(() => replay.getByText('Comment target', {exact: true}).count(), {timeout: 30_000})
      .toBeGreaterThan(0)
    const label = await addMarker(api().page)
    await expect.poll(() => replay.getByText(label, {exact: true}).count(), {timeout: 30_000}).toBeGreaterThan(0)
  }, 120_000)
})
