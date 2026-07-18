import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {makeExtRpcClient} from '@conciv/extension'
import recorderServer, {type RecorderRouter} from '@conciv/extension-recorder'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPanel} from './helpers/panel.js'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: 'Recording received', extensions: [recorderServer]})
  host = await serveHost(() =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: '<button>Embed fixture</button>',
    }),
  )
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

describe('recording attachment end to end in the real widget', () => {
  it('composes the card chip, sends log text to the model, renders the durable transcript card', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Embed fixture'}).click()
    await page.getByRole('button', {name: 'Embed fixture'}).click()

    const recorderRpc = makeExtRpcClient<RecorderRouter>(kit.base, 'recorder')
    await expect
      .poll(async () => (await recorderRpc.window({})).events.length, {timeout: 30_000})
      .toBeGreaterThanOrEqual(2)

    await openPanel(page)
    await page.getByRole('tab', {name: 'Recorder'}).click()
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
    await expect.poll(() => page.getByText('Recording received').first().isVisible(), {timeout: 30_000}).toBe(true)

    await expect.poll(() => kit.harness.__turnMessages.length, {timeout: 30_000}).toBeGreaterThanOrEqual(1)
    const turn = JSON.stringify(kit.harness.__turnMessages.at(-1))
    expect(turn).toContain('[click]')
    expect(turn).not.toContain('"type":"document"')

    const transcript = page.getByRole('log')
    await transcript
      .getByText(/Screen recording · \d+ action/)
      .first()
      .waitFor({state: 'visible', timeout: 15_000})
    await transcript.getByRole('button', {name: 'Play'}).first().waitFor({state: 'visible', timeout: 15_000})
    expect(await transcript.getByText('[click]').count()).toBe(0)
    expect(await page.getByRole('img').count()).toBe(0)

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await page
      .getByRole('log')
      .getByText(/Screen recording · \d+ action/)
      .first()
      .waitFor({state: 'visible', timeout: 20_000})
    await page.getByRole('log').getByRole('button', {name: 'Play'}).first().waitFor({state: 'visible', timeout: 15_000})

    await page.getByRole('log').getByRole('button', {name: 'Play'}).first().click()
    const modal = page.getByRole('alertdialog', {name: 'Screen recording replay'})
    await modal.waitFor({state: 'visible', timeout: 15_000})
    await modal.getByRole('button', {name: 'Close'}).click()
    await modal.waitFor({state: 'hidden', timeout: 15_000})
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    const composerAfterModal = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composerAfterModal.fill('still alive after replay')
    expect(await composerAfterModal.inputValue()).toBe('still alive after replay')
    await page.close()
  }, 120_000)
})
