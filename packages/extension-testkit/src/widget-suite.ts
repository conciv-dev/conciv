import fs from 'node:fs'
import path from 'node:path'
import {createServer, type Server} from 'node:http'
import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {listenLocal} from './listen-local.js'
import {manageBrowserSuite} from './bounded-close.js'

export type ServedDir = {base: string; close: () => Promise<void>}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

const GRACEFUL_STATIC_CLOSE_MS = 2_000

function closeStaticServer(server: Server, gracefulCloseMs: number): () => Promise<void> {
  return async () => {
    const stopped = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    const forceClose = setTimeout(() => server.closeAllConnections(), gracefulCloseMs)
    try {
      await stopped
    } finally {
      clearTimeout(forceClose)
    }
  }
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
  const port = await listenLocal(server)
  return {
    base: `http://127.0.0.1:${port}`,
    close: closeStaticServer(server, GRACEFUL_STATIC_CLOSE_MS),
  }
}

export function widgetComponentSuite(opts: {id: string; distDir: string}): void {
  const suite = manageBrowserSuite<CoreKit, ServedDir>(async () => ({
    kit: await bootCoreKit({id: opts.id}),
    host: await serveStaticDir(opts.distDir),
  }))

  const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

  async function openPage(): Promise<Page> {
    const page = await suite.browser().newPage()
    await page.goto(`${suite.host().base}/?core=${encodeURIComponent(suite.kit().base)}`, {
      waitUntil: 'domcontentloaded',
    })
    return page
  }

  describe('ConcivWidget component', () => {
    it('mounts exactly one widget', async () => {
      const page = await openPage()
      await expectLocator(fab(page)).toHaveCount(1, {timeout: 30_000})
      expect(await fab(page).count()).toBe(1)
      await page.close()
    })

    it('removing the component removes the widget, re-adding restores it', async () => {
      const page = await openPage()
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.close()
    })

    it('a settings prop change remounts the widget with the new configuration', async () => {
      const page = await openPage()
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'open by default'}).click()
      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(1)
      await page.close()
    })
  })
}
