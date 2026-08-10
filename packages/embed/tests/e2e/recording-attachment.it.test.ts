import {expect, test} from '@playwright/test'
import {makeExtRpcClient} from '@conciv/extension'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'
import recorderServer, {type RecorderRouter} from '@conciv/extension-recorder'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {openPanel} from './helpers/panel.js'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: 'Recording received', extensions: [recorderServer]})
  host = await serveHost(() =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: '<button>Embed fixture</button>',
    }),
  )
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

test.describe('recording attachment end to end in the real widget', () => {
  test('composes the card chip, sends log text to the model, renders the durable transcript card', async ({page}) => {
    test.setTimeout(480_000)
    const observer = observeRpc(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await openPanel(page)
    const flushPath = ['ext', 'recorder', 'flush']
    const firstFlush = observer.completed({path: flushPath, timeout: 30_000})
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await firstFlush

    const interactionFlush = observer.completed({path: flushPath, since: observer.mark(), timeout: 30_000})
    await page.getByRole('button', {name: 'Embed fixture'}).click()
    await page.getByRole('button', {name: 'Embed fixture'}).click()

    const recorderRpc = makeExtRpcClient<RecorderRouter>(kit.base, 'recorder')
    await interactionFlush
    expect((await recorderRpc.window({})).events.length).toBeGreaterThanOrEqual(2)

    const send = page.getByRole('button', {name: 'Send to agent'})
    await send.waitFor({state: 'visible', timeout: 15_000})
    await send.click()

    await page
      .getByText(/Screen recording · \d+ action/)
      .first()
      .waitFor({state: 'visible', timeout: 15_000})
    expect(await page.getByText('recording.txt').count()).toBe(0)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('here is what I did')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByText('Recording received').first()).toBeVisible({timeout: 30_000})

    const sessions = await kit.rpc.sessions.list()
    const chatSession = sessions[0]?.id
    if (!chatSession) throw new Error('widget session not found')
    const attachAbort = new AbortController()
    const stream = await kit.attach(chatSession, {signal: attachAbort.signal})
    const snapshot = await stream.waitFor(
      (chunk) => chunk.type === 'MESSAGES_SNAPSHOT' && JSON.stringify(chunk).includes('[click]'),
      {hangGuardMs: 30_000},
    )
    expect(JSON.stringify(snapshot)).toContain('"modelOnly":true')
    attachAbort.abort()

    const transcript = page.getByRole('log')
    await transcript
      .getByText(/Screen recording · \d+ action/)
      .first()
      .waitFor({state: 'visible', timeout: 15_000})
    await transcript.getByRole('button', {name: 'Play'}).first().waitFor({state: 'visible', timeout: 15_000})
    expect(await transcript.getByText('[click]').count()).toBe(0)
    expect(await page.getByRole('img').count()).toBe(0)

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await page
      .getByRole('log')
      .getByText(/Screen recording · \d+ action/)
      .first()
      .waitFor({state: 'visible', timeout: 20_000})
    await page.getByRole('log').getByRole('button', {name: 'Play'}).first().waitFor({state: 'visible', timeout: 15_000})

    await page.getByRole('log').getByRole('button', {name: 'Play'}).first().click()
    const modal = page.getByRole('dialog', {name: 'Screen recording replay'})
    await modal.waitFor({state: 'visible', timeout: 15_000})
    await modal.getByRole('button', {name: 'Close'}).click()
    await modal.waitFor({state: 'hidden', timeout: 15_000})
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    const composerAfterModal = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composerAfterModal.fill('still alive after replay')
    await expect(composerAfterModal).toHaveText('still alive after replay')
  })
})
