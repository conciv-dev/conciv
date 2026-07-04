// widget bundle (with the terminal extension client) against a real engine running the terminal

import {mkdtempSync, realpathSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {start, type Engine} from '@conciv/core'
import terminalServer from '@conciv/extension-terminal'
import {widgetBundle} from './it-fixture.js'

const PROMPT = 'reply with exactly the word tty-it-check and nothing else'

function pageHtml(apiBase: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="${apiBase}">
  </head><body>
    <script>${widgetBundle}</script>
  </body></html>`
}

async function bufferText(page: Page): Promise<string> {
  return page
    .locator('[data-terminal-screen]')
    .first()
    .evaluate((el: HTMLDivElement & {__concivTerminal?: {buffer(): string}}) => el.__concivTerminal?.buffer() ?? '')
}

async function untilBuffer(page: Page, pattern: RegExp, ms: number): Promise<string> {
  const startAt = Date.now()
  const text = {current: ''}
  while (!pattern.test(text.current)) {
    if (Date.now() - startAt > ms) {
      const status = await page.locator('[data-terminal-root]').first().getAttribute('data-status')
      throw new Error(`terminal buffer never matched ${pattern} (status=${status}):\n${text.current}`)
    }
    await page.waitForTimeout(300)
    text.current = await bufferText(page)
  }
  return text.current
}

describe('terminal extension e2e (real engine, real claude)', () => {
  let browser: Browser
  let engine: Engine
  let server: Server
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-terminal-it-')))
  const state = {base: ''}

  beforeAll(async () => {
    engine = await start({
      options: {systemPrompt: false},
      root,
      launchEditor: () => {},
      extensions: [terminalServer],
    })
    const html = pageHtml(`http://127.0.0.1:${engine.port}`)
    server = createServer((req, res) => {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(html)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
    await engine?.stop()
    rmSync(root, {recursive: true, force: true})
  })

  it('tab bar, sliding indicator singleton, full claude loop, chat rehydration', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()

    const chatTab = page.getByRole('tab', {name: 'Chat'}).first()
    const terminalTab = page.getByRole('tab', {name: 'Terminal'}).first()
    await expect.poll(() => chatTab.isVisible()).toBe(true)
    await expect.poll(() => terminalTab.isVisible()).toBe(true)

    const panelList = page.locator('[data-scope=tabs][data-part=list]', {has: terminalTab}).first()
    await expect.poll(() => panelList.locator('[data-part=indicator]').count()).toBe(1)

    await terminalTab.click()

    await expect.poll(() => page.getByRole('button', {name: 'Start a new session'}).first().isVisible()).toBe(true)
    await expect.poll(() => page.getByRole('button', {name: 'Open externally'}).first().isVisible()).toBe(true)
    await expect.poll(() => page.getByRole('button', {name: 'Select model'}).first().isVisible()).toBe(true)

    await page.locator('[data-terminal-screen]').first().click()
    const booted = await untilBuffer(page, /trust this folder|auto mode on/, 60_000)
    if (booted.includes('trust this folder')) {
      await page.keyboard.press('Enter')
      await untilBuffer(page, /auto mode on/, 60_000)
    }
    await page.keyboard.type(PROMPT)
    await page.keyboard.press('Enter')
    const settled = await untilBuffer(page, /[⏺●] tty-it-check/, 120_000)
    expect(settled).toContain('tty-it-check')

    await page.getByRole('button', {name: 'Activity'}).first().click()
    const mirrorLog = page.getByRole('log', {name: 'Terminal activity'}).first()
    await expect.poll(async () => (await mirrorLog.textContent()) ?? '', {timeout: 10_000}).toContain('tty-it-check')
    await page.getByRole('button', {name: 'Activity'}).first().click()

    await expect.poll(() => panelList.locator('[data-part=indicator]').count()).toBe(1)

    const rehydrated = page.getByText('tty-it-check', {exact: true}).filter({visible: true})
    await expect
      .poll(
        async () => {
          await chatTab.click()
          await page.waitForTimeout(1500)
          if ((await rehydrated.count()) > 0) return true
          await terminalTab.click()
          await page.waitForTimeout(500)
          return false
        },
        {timeout: 60_000},
      )
      .toBe(true)

    await terminalTab.click()
    await untilBuffer(page, /[⏺●] tty-it-check/, 10_000)

    await page.getByRole('button', {name: 'Select model'}).first().click()
    const haiku = page.getByRole('option', {name: /haiku/i}).first()
    await expect.poll(() => haiku.isVisible(), {timeout: 10_000}).toBe(true)
    await haiku.click()
    await untilBuffer(page, /— conciv: resumed session —/, 30_000)

    await page.getByRole('button', {name: 'Start a new session'}).first().click()
    await expect
      .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).first().isVisible(), {timeout: 15_000})
      .toBe(true)

    await page.close()
  }, 240_000)

  it('renders the tab bar in the quick-terminal pane as well', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect
      .poll(() => page.locator('[data-scope=tabs][data-part=list]').count(), {timeout: 15_000})
      .toBeGreaterThanOrEqual(2)
    await page.close()
  })
})
