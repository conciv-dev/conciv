import {spawn, type ChildProcess} from 'node:child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/try'
import type {Engine} from '@conciv/core/start'

const SITE_PORT = 8787
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
let site: ChildProcess
let browser: Browser
let engine: Engine | null = null

beforeAll(async () => {
  site = spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', String(SITE_PORT)], {cwd: import.meta.dirname + '/..'})
  await new Promise<void>((resolve, reject) => {
    const output: string[] = []
    site.stdout?.on('data', (chunk: Buffer) => {
      output.push(String(chunk))
      if (String(chunk).includes('Ready')) resolve()
    })
    site.stderr?.on('data', (chunk: Buffer) => output.push(String(chunk)))
    site.on('exit', () => reject(new Error(`wrangler dev exited:\n${output.join('')}`)))
  })
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await engine?.stop()
  site?.kill()
})

describe('widget-native live connect on the built site', () => {
  it('boots the widget into connect steps and hands off in place to live chat', async () => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect
      .poll(() => panel.getByText('Drive this page with your agent.').isVisible(), {timeout: 20_000})
      .toBe(true)

    const command = await panel.getByText(/^npx @conciv\/try --token \S+$/).textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')

    const before = await panel.elementHandle()
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: ORIGIN,
    })

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => input.isVisible(), {timeout: 30_000}).toBe(true)

    const sameNode = await page.evaluate(
      (node) => node === document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('[data-pw-panel]'),
      before,
    )
    expect(sameNode).toBe(true)
    await expect
      .poll(() => panel.getByText('Agent connected — it’s driving this page from your machine.').isVisible(), {
        timeout: 10_000,
      })
      .toBe(true)

    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(() => page.getByText('hello from e2e').first().isVisible(), {timeout: 30_000}).toBe(true)

    await page.reload({waitUntil: 'domcontentloaded'})
    const inputAfterReload = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => inputAfterReload.isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()

    await engine.stop()
    engine = null
  }, 180_000)

  it('remembers a pre-connect dismissal, and ?try=1 forces the panel open again', async () => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect
      .poll(() => panel.getByText('Drive this page with your agent.').isVisible(), {timeout: 20_000})
      .toBe(true)

    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect.poll(() => panel.isVisible(), {timeout: 10_000}).toBe(false)

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 20_000})
      .toBe(true)
    expect(await panel.isVisible()).toBe(false)

    await page.goto(`${ORIGIN}/?try=1`, {waitUntil: 'domcontentloaded'})
    await expect
      .poll(() => panel.getByText('Drive this page with your agent.').isVisible(), {timeout: 20_000})
      .toBe(true)
    await page.close()
  }, 90_000)
})
