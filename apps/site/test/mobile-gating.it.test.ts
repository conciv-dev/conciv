import {spawn, type ChildProcess} from 'node:child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, devices, type Browser} from 'playwright'

const SITE_PORT = 8788
const INSPECTOR_PORT = 9788
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
let site: ChildProcess
let browser: Browser

beforeAll(async () => {
  site = spawn(
    'pnpm',
    ['exec', 'wrangler', 'dev', '--port', String(SITE_PORT), '--inspector-port', String(INSPECTOR_PORT)],
    {cwd: import.meta.dirname + '/..'},
  )
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
  site?.kill()
})

describe('landing gates the dev-only demo behind a non-mobile pointer', () => {
  it('mounts the live widget and shows the install + try-it CTAs on desktop', async () => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expect.poll(() => page.locator('[data-conciv-root]').count(), {timeout: 20_000}).toBe(1)
    await expect.poll(() => page.getByRole('button', {name: 'Copy install command'}).isVisible()).toBe(true)
    await expect.poll(() => page.getByRole('button', {name: /Try it live/i}).isVisible()).toBe(true)

    await page.close()
  }, 60_000)

  it('does not mount the live widget or the CTAs on a mobile device', async () => {
    const context = await browser.newContext(devices['iPhone 13'])
    const page = await context.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expect.poll(() => page.getByRole('button', {name: 'Copy install command'}).count(), {timeout: 20_000}).toBe(0)
    await expect.poll(() => page.getByRole('button', {name: /Try it live/i}).count()).toBe(0)
    await expect.poll(() => page.locator('[data-conciv-root]').count()).toBe(0)

    await context.close()
  }, 60_000)
})
