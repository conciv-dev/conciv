import {readFile} from 'node:fs/promises'
import {createServer, type ServerResponse} from 'node:http'
import {createRequire} from 'node:module'
import path from 'node:path'
import {expect, test as base, type FullConfig, type Locator, type Page} from '@playwright/test'
import {magicLink} from '@conciv/harness-testkit/login'
import {bootCoreKit, type CoreKit} from './core-kit.js'
import {listenLocal} from './listen-local.js'
import {disposeAll} from './dispose.js'
import {dropChatTurns, failChatTurns} from './chat-fault.js'
import {watchChatWire, type ChatWireWatch} from './chat-wire.js'
import {abortRpcCalls, failRpcCalls, gateRpcCalls, type RpcFaultInjector, type RpcGate} from './rpc-fault.js'
import {rpcObserverFor, type RpcObserver} from './rpc-observer.js'
import {rpcSocketFor} from './rpc-socket.js'

export type FlowEngineOptions = Parameters<typeof bootCoreKit>[0]

export type FlowHost = {base: string; pageFor: (engine: CoreKit) => string}

export type WidgetDriver = {
  page: Page
  panel: Locator
  composer: Locator
  log: Locator
  openNewSession: () => Promise<string>
  send: (text: string) => Promise<void>
  queued: (text: string) => Locator
  reload: () => Promise<void>
  approve: () => Promise<void>
}

export type FlowFaults = {
  failRpc: (options: Parameters<typeof failRpcCalls>[1]) => Promise<RpcFaultInjector>
  abortRpc: (options?: Parameters<typeof abortRpcCalls>[1]) => Promise<RpcFaultInjector>
  gateRpc: (options?: Parameters<typeof gateRpcCalls>[1]) => Promise<RpcGate>
  failChatTurns: (options?: Parameters<typeof failChatTurns>[1]) => Promise<RpcFaultInjector>
  dropChatTurns: () => Promise<RpcFaultInjector>
}

export type FlowWire = {rpc: RpcObserver; chat: ChatWireWatch}

type FlowFixtures = {
  engineOptions: FlowEngineOptions
  engine: CoreKit
  widget: WidgetDriver
  faults: FlowFaults
  wire: FlowWire
}

type FlowWorkerFixtures = {widgetBundle: string | undefined; host: FlowHost}

function resolveWidgetBundle(config: FullConfig): string {
  const anchor = config.configFile ?? path.join(config.rootDir, 'package.json')
  try {
    return path.join(path.dirname(createRequire(anchor).resolve('@conciv/embed')), 'conciv-widget.global.js')
  } catch (error) {
    throw new Error(
      `could not resolve @conciv/embed from ${anchor}: add @conciv/embed as a devDependency or set use.widgetBundle to the built conciv-widget.global.js path`,
      {cause: error},
    )
  }
}

const HOST_BODY = '<main><h1>conciv flow host</h1></main>'

function hostPage(apiBase: string, bundle: string): string {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="conciv-api-base" content="${apiBase}">
    <meta name="conciv-widget" content='{}'>
  </head><body>
    ${HOST_BODY}
    <script src="/${bundle}"></script>
  </body></html>`
}

function engineOrigin(url: URL): string | undefined {
  return URL.parse(url.searchParams.get('engine') ?? '')?.origin
}

function serveBundleFile(directory: string, pathname: string, response: ServerResponse): void {
  const file = path.join(directory, pathname)
  const notFound = (): void => {
    response.writeHead(404)
    response.end()
  }
  if (path.extname(file) !== '.js' || !file.startsWith(directory + path.sep)) {
    notFound()
    return
  }
  readFile(file).then((body) => {
    response.writeHead(200, {'content-type': 'text/javascript; charset=utf-8'})
    response.end(body)
  }, notFound)
}

async function serveHost(bundlePath: string): Promise<FlowHost & {close: () => Promise<void>}> {
  const directory = path.dirname(bundlePath)
  const bundle = path.basename(bundlePath)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const origin = engineOrigin(url)
    if (url.pathname === '/' && origin !== undefined) {
      response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      response.end(hostPage(origin, bundle))
      return
    }
    serveBundleFile(directory, url.pathname, response)
  })
  const served = await listenLocal(server)
  return {
    base: served.base,
    pageFor: (engine) => `${served.base}/?engine=${encodeURIComponent(engine.origin)}`,
    close: served.close,
  }
}

function driveWidget(page: Page, engine: CoreKit, host: FlowHost): WidgetDriver {
  const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  const opener = page.getByRole('button', {name: 'Open conciv chat'})

  const openPanel = async (): Promise<void> => {
    await expect(composer.or(opener)).toBeVisible()
    if (!(await composer.isVisible())) await opener.click()
    await expect(composer).toBeVisible()
  }

  const switchToSession = async (title: string): Promise<void> => {
    await page.getByRole('button', {name: 'Session options'}).click()
    await page.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('option', {name: title}).click()
    await expect(page.getByRole('button', {name: `${title}, session options`})).toBeVisible()
    await expect(page.getByRole('dialog', {name: 'Session options'})).toBeHidden()
  }

  return {
    page,
    panel,
    composer,
    log: page.getByRole('log'),
    openNewSession: async () => {
      const {sessionId} = await engine.rpc.sessions.create()
      const title = `session under test ${sessionId.slice(-12)}`
      await engine.rpc.sessions.rename({sessionId, title})
      await page.goto(await magicLink(engine.base, host.pageFor(engine)), {waitUntil: 'domcontentloaded'})
      await openPanel()
      await switchToSession(title)
      return sessionId
    },
    send: async (text) => {
      await composer.click()
      await composer.pressSequentially(text)
      await page.getByRole('button', {name: 'Send message'}).click()
    },
    queued: (text) => panel.getByRole('listitem').filter({hasText: text}),
    reload: async () => {
      await page.reload({waitUntil: 'domcontentloaded'})
      await openPanel()
    },
    approve: () => panel.getByRole('button', {name: 'Approve'}).click(),
  }
}

export const test = base.extend<FlowFixtures, FlowWorkerFixtures>({
  widgetBundle: [undefined, {scope: 'worker', option: true}],
  host: [
    async ({widgetBundle}, use, workerInfo) => {
      const host = await serveHost(widgetBundle ?? resolveWidgetBundle(workerInfo.config))
      await use(host)
      await host.close()
    },
    {scope: 'worker'},
  ],
  engineOptions: [{id: 'flow'}, {option: true}],
  engine: async ({engineOptions}, use) => {
    const engine = await bootCoreKit(engineOptions)
    await use(engine)
    engine.harness.script.release()
    await engine.cleanup()
  },
  widget: async ({page, engine, host}, use) => {
    await rpcSocketFor(page).installed
    await use(driveWidget(page, engine, host))
  },
  faults: async ({page}, use) => {
    const disposers: (() => Promise<void>)[] = []
    const tracked = async <Fault extends {dispose: () => Promise<void>}>(made: Promise<Fault>): Promise<Fault> => {
      const fault = await made
      disposers.push(fault.dispose)
      return fault
    }
    await use({
      failRpc: (options) => tracked(failRpcCalls(page, options)),
      abortRpc: (options) => tracked(abortRpcCalls(page, options)),
      gateRpc: (options) => tracked(gateRpcCalls(page, options)),
      failChatTurns: (options) => tracked(failChatTurns(page, options)),
      dropChatTurns: () => tracked(dropChatTurns(page)),
    })
    await disposeAll(disposers, 'parallel', 'a flow fault did not dispose cleanly')
  },
  wire: async ({page}, use) => {
    const rpc = rpcObserverFor(page)
    await use({rpc, chat: watchChatWire(page)})
    rpc.dispose()
  },
})
