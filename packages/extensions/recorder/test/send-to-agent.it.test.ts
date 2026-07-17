import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import recorderServer from '../src/server.js'

const clientEntry = fileURLToPath(new URL('../src/client.tsx', import.meta.url))

const ctx: {api?: ExtensionTestApi} = {}

beforeAll(async () => {
  ctx.api = await getExtensionTestApi({server: recorderServer, clientEntry})
}, 120_000)

afterAll(async () => ctx.api?.dispose())

function api(): ExtensionTestApi {
  if (!ctx.api) throw new Error('testkit not booted')
  return ctx.api
}

describe('send to agent (real browser, real store)', () => {
  it('saves the recording and attaches the real card chip, not a txt note', async () => {
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Send fixture'
      button.id = 'send-fixture'
      document.body.appendChild(button)
    })
    await api().page.click('#send-fixture')
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

    await api().page.getByRole('tab', {name: 'Recorder'}).click()
    const send = api().page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    await send.click()

    await api()
      .page.getByText(/Screen recording · \d+ action/)
      .waitFor({state: 'visible', timeout: 15_000})
    await api().page.getByRole('button', {name: 'Play'}).waitFor({state: 'visible', timeout: 15_000})
    expect(await api().page.getByRole('note', {name: 'Attachment recording.txt'}).count()).toBe(0)
    expect(await api().page.getByRole('note', {name: 'Attachment Screen recording'}).count()).toBe(0)
  }, 120_000)
})
