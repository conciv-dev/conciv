import {spawn, type ChildProcess} from 'node:child_process'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/try'
import type {Engine} from '@conciv/core/start'

const SITE_PORT = 8787
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
    const panel = page.getByRole('region', {name: 'Try conciv live'})
    await expect.poll(() => panel.isVisible(), {timeout: 15_000}).toBe(true)
    expect(page.url()).toContain('try=1')
    const command = await page.getByText(/npx @conciv\/try --token/).textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: `http://127.0.0.1:${SITE_PORT}`,
    })
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => input.isVisible(), {timeout: 30_000}).toBe(true)
    await expect.poll(() => panel.isVisible()).toBe(false)
    const stamped = page.locator('[data-conciv-source]').first()
    const sourceRef = (await stamped.getAttribute('data-conciv-source')) ?? ''
    const sourceFile = sourceRef.split(':').slice(0, -2).join(':')
    expect(sourceFile).toMatch(/^src\//)
    expect(engine).not.toBeNull()
    if (engine) expect(existsSync(join(engine.cfg.stateRoot, sourceFile))).toBe(true)
    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(() => page.getByText('hello from e2e').first().isVisible(), {timeout: 30_000}).toBe(true)
    await page.reload({waitUntil: 'domcontentloaded'})
    const inputAfterReload = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => inputAfterReload.isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
  }, 180_000)

  it('closes to a launcher, remembers dismissal, reopens from hero and launcher', async () => {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${SITE_PORT}`, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('region', {name: 'Try conciv live'})
    await expect.poll(() => panel.isVisible(), {timeout: 15_000}).toBe(true)
    await page.getByRole('button', {name: 'Close the live demo panel'}).click()
    await expect.poll(() => panel.isVisible()).toBe(false)
    const launcher = page.getByRole('button', {name: 'Open the live demo panel'})
    await expect.poll(() => launcher.isVisible()).toBe(true)
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect.poll(() => launcher.isVisible(), {timeout: 15_000}).toBe(true)
    expect(await panel.isVisible()).toBe(false)
    expect(page.url()).not.toContain('try=1')
    await page.getByRole('button', {name: /try it live/i}).click()
    await expect.poll(() => panel.isVisible()).toBe(true)
    await page.getByRole('button', {name: 'Close the live demo panel'}).click()
    await launcher.click()
    await expect.poll(() => panel.isVisible()).toBe(true)
    await page.close()
  }, 60_000)
})
