import {describe, expect, it} from 'vitest'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

describe('send to agent (real browser, real store)', () => {
  it('saves the recording and attaches the real card chip, not a txt note', async () => {
    await addMarker(api().page)
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const send = api().page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    await send.click()

    await api()
      .page.getByText(/Screen recording · \d+ action/)
      .waitFor({state: 'visible', timeout: 15_000})
    await api().page.getByRole('button', {name: 'Play', exact: true}).waitFor({state: 'visible', timeout: 15_000})
    expect(await api().page.getByRole('note', {name: 'Attachment recording.txt'}).count()).toBe(0)
    expect(await api().page.getByRole('note', {name: 'Attachment Screen recording'}).count()).toBe(0)
  }, 120_000)
})
