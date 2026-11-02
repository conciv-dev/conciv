import type {AnyExtension} from '@conciv/extension'
import type {HarnessCommand, HarnessModel, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type Server, request as httpRequest, type IncomingMessage} from 'node:http'
import {listenLocal} from '@conciv/extension-testkit/listen-local'
import type {Duplex} from 'node:stream'
import {test, expect, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import type {DraftRow} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import {PageToNativeSchema, type PageToNativeMessage} from '@conciv/extension-ios/bridge'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'

export type EmbedKit = CoreKit

export async function bootEmbedKit(
  opts: {
    text?: string
    extensions?: AnyExtension[]
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    history?: HarnessSessionMeta[]
  } = {},
): Promise<EmbedKit> {
  const kit = await bootCoreKit({
    id: 'fake-embed',
    text: opts.text,
    extensions: opts.extensions,
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
  })
  return {
    ...kit,
    cleanup: async () => {
      try {
        await kit.cleanup()
      } catch (error) {
        console.error('[embed-testkit] kit cleanup failed:', error)
      }
    },
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))

const embedBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-widget.global.js'), 'utf8')

export function hostPage(opts: {apiBase: string; widget?: string; body?: string}): string {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="conciv-api-base" content="${opts.apiBase}">
    <meta name="conciv-widget" content='${opts.widget ?? '{}'}'>
  </head><body>
    ${opts.body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${embedBundle}</script>
  </body></html>`
}

export function handleHostPage(body?: string): string {
  const handleBundle = fs.readFileSync(path.join(dirname, 'dist/conciv-handle.global.js'), 'utf8')
  return `<!doctype html><html><head>
    <meta charset="utf-8">
  </head><body>
    ${body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${handleBundle}</script>
  </body></html>`
}

export async function reserveDeadPort(): Promise<{base: string; port: number}> {
  const probe: Server = createServer()
  const {port} = await listenLocal(probe)
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return {base: `http://127.0.0.1:${port}`, port}
}

export type ProxyCore = {
  base: string
  port: number
  trafficCount: () => number
  requestedPaths: () => string[]
  dropConnections: () => void
  close: () => Promise<void>
}

function handshakeResponse(upstream: IncomingMessage): string {
  const statusLine = `HTTP/1.1 ${upstream.statusCode ?? 101} ${upstream.statusMessage ?? 'Switching Protocols'}`
  const headers = upstream.rawHeaders.reduce<string[]>((lines, value, index) => {
    if (index % 2 === 1) return lines
    return [...lines, `${value}: ${upstream.rawHeaders[index + 1] ?? ''}`]
  }, [])
  return [statusLine, ...headers, '', ''].join('\r\n')
}

export async function proxyTo(targetBase: string, opts: {port?: number} = {}): Promise<ProxyCore> {
  const target = new URL(targetBase)
  let count = 0
  let upgrades = 0
  const requestedPaths: string[] = []
  const piped = new Set<Duplex>()
  const server: Server = createServer((req, res) => {
    count += 1
    requestedPaths.push(req.url ?? '')
    const proxyReq = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: {...req.headers, host: target.host},
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )
    proxyReq.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(proxyReq)
  })
  server.on('upgrade', (req, clientSocket: Duplex, head: Buffer) => {
    upgrades += 1
    requestedPaths.push(req.url ?? '')
    piped.add(clientSocket)
    clientSocket.on('close', () => piped.delete(clientSocket))
    const proxyReq = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: {...req.headers, host: target.host},
    })
    proxyReq.on('upgrade', (upstreamRes, upstreamSocket: Duplex, upstreamHead: Buffer) => {
      piped.add(upstreamSocket)
      upstreamSocket.on('close', () => piped.delete(upstreamSocket))
      clientSocket.write(handshakeResponse(upstreamRes))
      if (upstreamHead.length > 0) clientSocket.write(upstreamHead)
      if (head.length > 0) upstreamSocket.write(head)
      upstreamSocket.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => upstreamSocket.destroy())
      upstreamSocket.pipe(clientSocket)
      clientSocket.pipe(upstreamSocket)
    })
    proxyReq.on('error', () => clientSocket.destroy())
    proxyReq.end()
  })
  const {base, port, close} = await listenLocal(server, opts.port ?? 0)
  return {
    base: `${base}${target.pathname.replace(/\/$/, '')}`,
    port,
    trafficCount: () => count + upgrades,
    requestedPaths: () => [...requestedPaths],
    dropConnections: () => {
      for (const socket of piped) socket.destroy()
      piped.clear()
    },
    close: async () => {
      try {
        for (const socket of piped) socket.destroy()
        piped.clear()
        await close()
      } catch (error) {
        console.error('[embed-testkit] proxy close failed:', error)
      }
    },
  }
}

export type WidgetSuite = {
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
}

export function setupWidgetSuite(options: Parameters<typeof bootEmbedKit>[0] = {}): WidgetSuite {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit(options)
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterEach(async () => {
    kit.harness.script.release()
    await host.close()
    await kit.cleanup()
  })

  return {kit: () => kit, host: () => host}
}

type ProxiedEmbedSuite = {
  kit: () => EmbedKit
  core: () => ProxyCore
  host: () => {base: string; close: () => Promise<void>}
}

export function setupProxiedEmbedSuite(opts: {text?: string} = {}): ProxiedEmbedSuite {
  let kit: EmbedKit
  let core: ProxyCore
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit({text: opts.text})
    core = await proxyTo(kit.base)
    host = await serveHost(() => hostPage({apiBase: core.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterEach(async () => {
    await host.close()
    await core.close()
    await kit.cleanup()
  })

  return {
    kit: () => kit,
    core: () => core,
    host: () => host,
  }
}

const PANEL_TIMEOUT_MS = 30_000

export function chatLog(page: Page) {
  return page.getByRole('log')
}

export function chatBox(page: Page) {
  return page.getByRole('textbox', {name: 'Message the conciv agent'})
}

export async function openChatPanel(page: Page): Promise<void> {
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: PANEL_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect(chatBox(page)).toBeVisible({timeout: PANEL_TIMEOUT_MS})
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  await chatBox(page).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

export function untilPanelDraft(
  kit: EmbedKit,
  sessionId: string,
  matches: (draft: DraftRow) => boolean,
): Promise<void> {
  return until(
    async () => {
      const draft = await kit.hub.call('conciv:drafts:get', {sessionId})
      return draft !== null && matches(draft)
    },
    {hangGuardMs: 30_000, intervalMs: 100},
  )
}

export async function mountHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    window.concivTestElement = el
    window.concivTestHandle = window.ConcivHandle.makeHandle(base)
    void window.concivTestHandle.mount(el)
  }, apiBase)
}

export async function openHostWithHandle(page: Page, hostBase: string, apiBase: string): Promise<string[]> {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(hostBase, {waitUntil: 'domcontentloaded'})
  await mountHandle(page, apiBase)
  return pageErrors
}

export async function remountHandle(page: Page): Promise<void> {
  await page.evaluate(() => void window.concivTestHandle.mount(window.concivTestElement))
}

export async function unmountHandle(page: Page): Promise<void> {
  await page.evaluate(() => window.concivTestHandle.unmount())
}

export async function rebindHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => window.concivTestHandle.rebind(base), apiBase)
}

export type NativeBridge = {
  posted: PageToNativeMessage[]
  notify: (message: PageToNativeMessage) => void
}

export async function captureNativePosts(page: Page): Promise<NativeBridge> {
  const bridge: NativeBridge = {posted: [], notify: () => {}}
  await page.exposeFunction('concivNativePost', (message: unknown) => {
    const parsed = PageToNativeSchema.safeParse(message)
    if (!parsed.success) return
    bridge.posted.push(parsed.data)
    bridge.notify(parsed.data)
  })
  return bridge
}

export async function installNativeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.webkit = {
      messageHandlers: {concivBridge: {postMessage: (message) => void window.concivNativePost(message)}},
    }
  })
}

const PAGE_DRIVER_TIMEOUT_MS = 30_000

export async function openPagePlaneHost(page: Page, base: string): Promise<Page> {
  await awaitPagePlaneSubscribed(page, async () => {
    await page.goto(base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: PAGE_DRIVER_TIMEOUT_MS})
  })
  return page
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function openPanel(page: Page): Promise<void> {
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expect(composer.or(opener)).toBeVisible({timeout: 30_000})
  if (!(await composer.isVisible())) await opener.click()
  await expect(composer).toBeVisible({timeout: 30_000})
}

export async function switchToSessionByTitle(page: Page, title: string): Promise<void> {
  const sessionOptions = page.getByRole('button', {name: 'Session options'})
  await sessionOptions.click()
  await page.getByRole('button', {name: /^Session: /}).click()
  const option = page.getByRole('option', {name: new RegExp(escapeRegex(title))})
  await expect(option).toBeVisible({timeout: 30_000})
  await option.click()
  const pill = page.getByRole('button', {name: `Session: ${title}`})
  if (!(await pill.isVisible())) await sessionOptions.click()
  await expect(pill).toBeVisible({timeout: 30_000})
  await page.keyboard.press('Escape')
  await expect(pill).toBeHidden({timeout: 30_000})
}

export async function openPanelOnNewSession(page: Page, suite: WidgetSuite): Promise<string> {
  const {sessionId} = await suite.kit().hub.call('conciv:sessions:create', {})
  const title = `session under test ${sessionId.slice(-12)}`
  await suite.kit().hub.call('conciv:sessions:rename', {sessionId, title})
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  await switchToSessionByTitle(page, title)
  return sessionId
}

export async function sendMessage(page: Page, text: string, reply: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByText(reply).first()).toBeVisible({timeout: 30_000})
}
