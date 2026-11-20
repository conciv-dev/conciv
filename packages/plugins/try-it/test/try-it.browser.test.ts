import {createServer as createHttpServer, type IncomingMessage, type Server as HttpServer} from 'node:http'
import {
  connect as connectSocket,
  createServer as createTcpServer,
  type Server as TcpServer,
  type Socket,
} from 'node:net'
import {randomUUID} from 'node:crypto'
import {readdirSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'vite'
import solid from 'vite-plugin-solid'
import {afterAll, beforeAll, describe, expect as expectValue} from 'vitest'
import {expect} from '@playwright/test'
import {test} from '@conciv/plugin-testkit/node'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {serveStaticDir, type ServedDir} from '@conciv/plugin-testkit/widget-suite'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const HOST_ENTRY = fileURLToPath(new URL('./host/app.ts', import.meta.url))
const WIDGET_DIR = dirname(createRequire(import.meta.url).resolve('@conciv/embed'))

const WAITING = 'Waiting for your agent…'
const BLOCKED_STEP =
  'Local network access was blocked. Click the site icon in the address bar, allow local network access, and reload.'
const BLOCKED_STATUS = "Local network access is blocked, so your agent can't reach this tab."
const HANDED_OFF = 'Agent connected. It’s driving this page from your machine.'

type Listening = {readonly port: number; readonly close: () => Promise<void>}

async function onConnectPort(server: HttpServer | TcpServer, port = CONNECT_FIRST_PORT): Promise<Listening> {
  if (port > CONNECT_LAST_PORT) throw new Error('every connect port is taken')
  const bound = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => resolve(true))
  })
  if (!bound) return onConnectPort(server, port + 1)
  return {port, close: () => new Promise((resolve) => server.close(() => resolve()))}
}

function probeLedger() {
  const probes = new Map<string, number>()
  const server = createHttpServer((request, response) => {
    const token = /^\/t\/([^/]+)\/health$/.exec(request.url ?? '')?.[1]
    if (token) probes.set(token, (probes.get(token) ?? 0) + 1)
    response.setHeader('access-control-allow-origin', '*')
    response.writeHead(404)
    response.end()
  })
  const probed = (token: string, more: number): Promise<void> => {
    const target = (probes.get(token) ?? 0) + more
    return new Promise((resolve) => {
      const check = (request: IncomingMessage): void => {
        if (!request.url?.startsWith(`/t/${token}/`) || (probes.get(token) ?? 0) < target) return
        server.off('request', check)
        resolve()
      }
      server.on('request', check)
    })
  }
  return {server, count: (token: string) => probes.get(token) ?? 0, probed}
}

function forwardTo(port: number): {server: TcpServer; sockets: Set<Socket>} {
  const sockets = new Set<Socket>()
  const server = createTcpServer((socket) => {
    const upstream = connectSocket(port, '127.0.0.1')
    sockets.add(socket).add(upstream)
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
    socket.pipe(upstream).pipe(socket)
  })
  return {server, sockets}
}

async function hostFolder(): Promise<string> {
  const folder = tempDir('conciv-try-it-host-')
  await build({
    configFile: false,
    logLevel: 'silent',
    mode: 'production',
    plugins: [solid()],
    build: {
      outDir: folder,
      emptyOutDir: false,
      rollupOptions: {input: HOST_ENTRY, output: {format: 'es', entryFileNames: 'app.js'}},
    },
  })
  readdirSync(WIDGET_DIR).forEach((entry) => symlinkSync(join(WIDGET_DIR, entry), join(folder, entry)))
  writeFileSync(
    join(folder, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>try-it host</title></head><body><script type="module" src="/app.js"></script></body></html>',
  )
  return folder
}

describe('try-it composed into the widget', () => {
  const ledger = probeLedger()
  const held: {site?: ServedDir; kit?: CoreKit; ledger?: Listening} = {}

  beforeAll(async () => {
    held.site = await serveStaticDir(await hostFolder())
    held.ledger = await onConnectPort(ledger.server)
    held.kit = await bootCoreKit({id: 'try-it', text: 'hello from try-it', allowedOrigins: [held.site.base]})
  }, 120_000)

  afterAll(async () => {
    await held.kit?.cleanup()
    await held.ledger?.close()
    await held.site?.close()
  })

  const site = () => held.site?.base ?? ''

  test('covers the panel with the connect steps, then hands off in place to the core that answers', async ({
    browser,
  }) => {
    const kit = held.kit
    if (!kit) throw new Error('the core did not boot')
    const token = new URL(kit.base).pathname.split('/')[2] ?? ''
    const forward = forwardTo(Number(new URL(kit.base).port))
    const holdingPage = await browser.newPage()
    const holding = holdingPage.getByRole('dialog', {name: 'conciv chat agent'})
    const page = await browser.newPage()
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    const forwarder: {current?: Listening} = {}
    try {
      await holdingPage.goto(`${site()}/?token=${token}&holdMs=600000`, {waitUntil: 'domcontentloaded'})
      await page.goto(`${site()}/?token=${token}&holdMs=1`, {waitUntil: 'domcontentloaded'})
      await expect(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})
      await expect(panel.getByText(WAITING)).toBeVisible()
      await expect(panel.getByText(`npx @conciv/try --token ${token}`)).toBeVisible()
      await expect(holding.getByText(WAITING)).toBeVisible({timeout: 20_000})

      forwarder.current = await onConnectPort(forward.server)

      await expect(holding.getByText('Agent connected', {exact: true})).toBeVisible({timeout: 10_000})
      await expect(holding.getByText('Drive this page with your agent.')).toBeVisible()
      await expect(holding.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveCount(0)

      await expect(panel.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 20_000})
      await expect(panel.getByText(HANDED_OFF)).toBeVisible()
      await expect(panel.getByText('Drive this page with your agent.')).toBeHidden()

      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(panel.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 20_000})
    } finally {
      await holdingPage.close()
      await page.close()
      forward.sockets.forEach((socket) => socket.destroy())
      await forwarder.current?.close()
    }
  }, 120_000)

  test('a denied local-network permission replaces the waiting line, and granting it restores the wait', async ({
    browser,
  }) => {
    const page = await browser.newPage()
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    const origin = new URL(site()).origin
    const pageSession = await page.context().newCDPSession(page)
    const {targetInfo} = await pageSession.send('Target.getTargetInfo')
    const browserSession = await browser.newBrowserCDPSession()
    await browserSession.send('Browser.setPermission', {
      permission: {name: 'local-network-access'},
      setting: 'denied',
      origin,
      browserContextId: targetInfo.browserContextId,
    })
    await page.goto(`${site()}/?token=${randomUUID()}`, {waitUntil: 'domcontentloaded'})
    await expect(panel.getByRole('alert')).toHaveText(BLOCKED_STEP, {timeout: 20_000})
    await expect(panel.getByText(BLOCKED_STATUS)).toBeVisible()
    await expect(panel.getByText(WAITING)).toBeHidden()

    await page.context().grantPermissions(['local-network-access'], {origin})
    await expect(panel.getByText(WAITING)).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await browserSession.detach()
    await page.close()
  }, 60_000)

  test('stops probing once the widget is unmounted', async ({browser}) => {
    const token = randomUUID()
    const page = await browser.newPage()
    await page.goto(`${site()}/?token=${token}`, {waitUntil: 'domcontentloaded'})
    await expect(page.getByText(WAITING)).toBeVisible({timeout: 20_000})
    await page.getByRole('button', {name: 'Unmount widget'}).click()
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toHaveCount(0)

    const sealed = ledger.count(token)
    const witness = randomUUID()
    const watching = await browser.newPage()
    const swept = ledger.probed(witness, 3)
    await watching.goto(`${site()}/?token=${witness}`, {waitUntil: 'domcontentloaded'})
    await swept
    expectValue(ledger.count(token)).toBe(sealed)
    await watching.close()
    await page.close()
  }, 60_000)
})
