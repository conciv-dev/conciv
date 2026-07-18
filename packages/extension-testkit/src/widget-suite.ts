import fs from 'node:fs'
import path from 'node:path'
import {createServer, type Server} from 'node:http'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from './core-kit.js'

export type ServedDir = {base: string; close: () => Promise<void>}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

export async function serveStaticDir(dir: string): Promise<ServedDir> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const file = path.join(dir, rel)
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, {'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'})
    res.end(fs.readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

export function widgetComponentSuite(opts: {id: string; distDir: string}): void {
  let browser: Browser
  let kit: CoreKit
  let host: ServedDir

  beforeAll(async () => {
    browser = await chromium.launch()
    kit = await bootCoreKit({id: opts.id})
    host = await serveStaticDir(opts.distDir)
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    await host.close()
    await kit.cleanup()
  })

  const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

  async function openPage(): Promise<Page> {
    const page = await browser.newPage()
    await page.goto(`${host.base}/?core=${encodeURIComponent(kit.base)}`, {waitUntil: 'domcontentloaded'})
    return page
  }

  describe('ConcivWidget component', () => {
    it('mounts exactly one widget', async () => {
      const page = await openPage()
      await expect.poll(() => fab(page).count(), {timeout: 30_000}).toBe(1)
      expect(await fab(page).count()).toBe(1)
      await page.close()
    })

    it('removing the component removes the widget, re-adding restores it', async () => {
      const page = await openPage()
      await expect.poll(() => fab(page).isVisible(), {timeout: 30_000}).toBe(true)
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expect.poll(() => fab(page).count(), {timeout: 30_000}).toBe(0)
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expect.poll(() => fab(page).isVisible(), {timeout: 30_000}).toBe(true)
      await page.close()
    })

    it('a settings prop change remounts the widget with the new configuration', async () => {
      const page = await openPage()
      await expect.poll(() => fab(page).isVisible(), {timeout: 30_000}).toBe(true)
      await page.getByRole('button', {name: 'open by default'}).click()
      await expect
        .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
        .toBe(true)
      expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(1)
      await page.close()
    })
  })
}
