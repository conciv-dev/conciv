import fs from 'node:fs'
import path from 'node:path'
import {createServer, type Server} from 'node:http'
import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Browser, Page} from 'playwright'
import {test as browserTest} from '@conciv/browser-fixture'
import {magicLink} from '@conciv/harness-testkit/login'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {listenLocal} from './listen-local.js'

export type ServedDir = {base: string; close: () => Promise<void>}

export type PluginWidget = {page: Page; kit: CoreKit; close: () => Promise<void>}

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

export function serveStaticDir(dir: string): Promise<ServedDir> {
  return serveFiles(dir, undefined)
}

async function serveFiles(dir: string, page: string | undefined): Promise<ServedDir> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/' && page !== undefined) {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(page)
      return
    }
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
  const {port} = await listenLocal(server)
  return {
    base: `http://127.0.0.1:${port}`,
    close: closeStaticServer(server, GRACEFUL_STATIC_CLOSE_MS),
  }
}

function hostPage(apiBase: string, bundle: string, body: string): string {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="conciv-api-base" content="${apiBase}">
    <meta name="conciv-widget" content='{}'>
  </head><body>
    ${body}
    <script src="/${bundle}"></script>
  </body></html>`
}

function closeInOrder(...closers: (() => Promise<void>)[]): () => Promise<void> {
  return async () => {
    const failures = await closers.reduce<Promise<unknown[]>>(async (pending, closer) => {
      const failed = await pending
      return closer().then(
        () => failed,
        (error: unknown) => [...failed, error],
      )
    }, Promise.resolve([]))
    if (failures.length > 0) throw new AggregateError(failures, 'the plugin widget did not close cleanly')
  }
}

async function startedOrClosed<Value>(start: () => Promise<Value>, close: () => Promise<void>): Promise<Value> {
  try {
    return await start()
  } catch (error) {
    await close().catch((closeError: unknown) => {
      throw new AggregateError([error, closeError], 'the plugin widget failed to open and did not close cleanly', {
        cause: error,
      })
    })
    throw error
  }
}

export async function openPluginWidget(
  browser: Browser,
  opts: {
    id: string
    plugins: NonNullable<ConcivConfig['plugins']>
    widgetBundle: string
    files?: Readonly<Record<string, string>>
    stateRoot?: string
    body?: string
  },
): Promise<PluginWidget> {
  const kit = await bootCoreKit({id: opts.id, plugins: opts.plugins, files: opts.files, stateRoot: opts.stateRoot})
  const page = hostPage(
    kit.origin,
    path.basename(opts.widgetBundle),
    opts.body ?? '<div id="probe">page-probe-ok</div>',
  )
  const host = await startedOrClosed(() => serveFiles(path.dirname(opts.widgetBundle), page), kit.cleanup)
  const closeServers = closeInOrder(host.close, kit.cleanup)
  const opened = await startedOrClosed(() => browser.newPage(), closeServers)
  const close = closeInOrder(() => opened.close(), closeServers)
  await startedOrClosed(async () => {
    await opened.goto(await magicLink(kit.base, `${host.base}/`), {waitUntil: 'domcontentloaded'})
  }, close)
  return {page: opened, kit, close}
}

export function widgetComponentSuite(opts: {id: string; distDir: string}): void {
  const test = browserTest.extend<{$file: {kit: CoreKit; host: ServedDir}}>({
    kit: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const kit = await bootCoreKit({id: opts.id})
        await use(kit)
        await kit.cleanup()
      },
      {scope: 'file'},
    ],
    host: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const host = await serveStaticDir(opts.distDir)
        await use(host)
        await host.close()
      },
      {scope: 'file'},
    ],
  })

  const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

  async function openPage(browser: Browser, host: ServedDir, kit: CoreKit): Promise<Page> {
    const page = await browser.newPage()
    const pageUrl = `${host.base}/?core=${encodeURIComponent(kit.origin)}`
    await page.goto(await magicLink(kit.base, pageUrl), {waitUntil: 'domcontentloaded'})
    return page
  }

  test.describe('ConcivWidget component', () => {
    test('mounts exactly one widget', async ({browser, host, kit}) => {
      const page = await openPage(browser, host, kit)
      await expectLocator(fab(page)).toHaveCount(1, {timeout: 30_000})
      expect(await fab(page).count()).toBe(1)
      await page.close()
    })

    test('removing the component removes the widget, re-adding restores it', async ({browser, host, kit}) => {
      const page = await openPage(browser, host, kit)
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
      await page.getByRole('button', {name: 'toggle widget'}).click()
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.close()
    })

    test('a settings prop change remounts the widget with the new configuration', async ({browser, host, kit}) => {
      const page = await openPage(browser, host, kit)
      await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'open by default'}).click()
      await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(1)
      await page.close()
    })

    test('the grabProvider prop reaches the widget: Select an element stages what it picks', async ({
      browser,
      host,
      kit,
    }) => {
      const page = await openPage(browser, host, kit)
      await page.getByRole('button', {name: 'open by default'}).click()
      await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
      await page.getByRole('button', {name: 'More composer actions'}).click()
      await page.getByRole('menuitem', {name: 'Select an element from the page'}).click()
      await expectLocator(page.getByText('FixtureHeading at src/fixture.tsx:3')).toBeVisible({timeout: 30_000})
      await page.close()
    })
  })
}
