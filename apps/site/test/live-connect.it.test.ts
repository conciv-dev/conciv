import {spawn, type ChildProcess} from 'node:child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/connect'
import type {Engine} from '@conciv/core/start'

const SITE_PORT = 8787
let site: ChildProcess
let browser: Browser
let engine: Engine | null = null

beforeAll(async () => {
  site = spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', String(SITE_PORT)], {cwd: import.meta.dirname + '/..'})
  await new Promise<void>((resolve, reject) => {
    site.stdout?.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('Ready')) resolve()
    })
    site.on('exit', () => reject(new Error('wrangler dev exited')))
  })
  browser = await chromium.launch({
    args: [`--ip-address-space-overrides=127.0.0.1:${SITE_PORT}=public`],
  })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await engine?.stop()
  site?.kill()
})

describe('live connect on the built site', () => {
  it('pairs, mounts the widget and completes a chat turn', async () => {
    const page = await browser.newPage()
    await page.context().grantPermissions(['local-network-access'], {origin: `http://127.0.0.1:${SITE_PORT}`})
    await page.goto(`http://127.0.0.1:${SITE_PORT}`, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: /try it live/i}).click()
    const command = await page.getByText(/npx @conciv\/connect --token/).textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: `http://127.0.0.1:${SITE_PORT}`,
    })
    await expect
      .poll(
        () =>
          page
            .getByText(/connected/i)
            .first()
            .isVisible(),
        {timeout: 30_000},
      )
      .toBe(true)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => input.isVisible(), {timeout: 15_000}).toBe(true)
    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(() => page.getByText('hello from e2e').first().isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
  }, 180_000)
})
