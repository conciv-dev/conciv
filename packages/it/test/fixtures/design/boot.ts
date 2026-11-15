import {fork} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {chromium, type Browser, type Page} from 'playwright'
import {z} from 'zod'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, type SessionId} from '@conciv/protocol/chat-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {magicLink} from '@conciv/harness-testkit/login'
import type {} from '@conciv/extension-design/client'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {HOST_ROOT, serveDesignHost, type DesignConfigInput} from './host-server.js'
import {renderTargets} from './render-targets.js'

export async function bootDesignHost(
  options: {config?: DesignConfigInput; stateRoot?: string; homeDir?: string; spawned?: boolean} = {},
): Promise<Kit> {
  const stateRoot = options.stateRoot ?? (await mkdtemp(join(tmpdir(), 'conciv-design-state-')))
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-design-endpoint-'))
  const homeDir = options.homeDir ?? (await mkdtemp(join(tmpdir(), 'conciv-design-home-')))
  const owned = [
    ...(options.stateRoot === undefined ? [stateRoot] : []),
    ...(options.homeDir === undefined ? [homeDir] : []),
  ]
  const printed: string[] = []
  const host = await hostOf({
    spawned: options.spawned === true,
    hosted: {stateRoot, homeDir, devEndpointDir, config: options.config, print: (line) => printed.push(line)},
  })
  const {origin} = host
  const {apiBase, token} = EndpointSchema.parse(JSON.parse(await readFile(join(devEndpointDir, ENDPOINT_FILE), 'utf8')))
  const session = (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  const browser = await chromium.launch({args: ['--disable-features=LocalNetworkAccessChecks']})
  const targetsDir = await mkdtemp(join(tmpdir(), 'conciv-design-targets-'))
  await renderTargets({browser, dir: targetsDir})
  const page = await browser.newPage({viewport: {width: 1280, height: 720}})
  const goto = (to: string): Promise<void> =>
    awaitPagePlaneSubscribed(page, async () => {
      await page.goto(new URL(to.startsWith('/') ? to : `/?variant=${to}`, origin).href, {
        waitUntil: 'domcontentloaded',
      })
      await injectWidget(page, new URL(apiBase).origin)
      await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {
        timeout: PAGE_DRIVER_TIMEOUT_MS,
      })
    })
  await goto(await magicLink(new URL(apiBase).origin, () => printed.join('\n'), '/'))
  return {
    rpc,
    browser,
    page,
    origin,
    apiBase,
    session,
    stateRoot,
    home: homeDir,
    token,
    targetsDir,
    hostRoot: HOST_ROOT,
    call: makeCall(rpc),
    goto,
    interrupt: host.interrupt,
    dispose: async () => {
      await browser.close()
      await host.close()
      await Promise.all([...owned, devEndpointDir].map((dir) => rm(dir, {recursive: true, force: true})))
      await rm(targetsDir, {recursive: true, force: true})
    },
  }
}

const ENDPOINT_FILE = 'dev-endpoint.json'
const PAGE_DRIVER_TIMEOUT_MS = 30_000

const EndpointSchema = z.object({apiBase: z.string().min(1), token: z.string().min(1)})

const [getDef, checkDef, statusDef, , , componentsDef] = DESIGN_TOOLS

type ToolOutput<Tool extends {outputSchema?: z.ZodType}> = z.output<NonNullable<Tool['outputSchema']>>
type OneFrame<Reply> = Exclude<Reply, {variants: unknown}>
type Got = OneFrame<ToolOutput<typeof getDef>>
type Checked = OneFrame<ToolOutput<typeof checkDef>>
type Status = OneFrame<ToolOutput<typeof statusDef>>
type Listed = ToolOutput<typeof componentsDef>

type Call = {
  (name: 'design_get', input: z.input<typeof getDef.inputSchema>): Promise<Got>
  (name: 'design_check', input: z.input<typeof checkDef.inputSchema>): Promise<Checked>
  (name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<Status>
  (name: 'design_components', input: z.input<typeof componentsDef.inputSchema>): Promise<Listed>
}

type Kit = {
  rpc: RpcClient
  browser: Browser
  page: Page
  origin: string
  apiBase: string
  session: SessionId
  stateRoot: string
  home: string
  token: string
  targetsDir: string
  hostRoot: string
  call: Call
  goto: (to: string) => Promise<void>
  interrupt: (signal: NodeJS.Signals) => Promise<string | null>
  dispose: () => Promise<void>
}

function makeCall(rpc: RpcClient): Call {
  function call(name: 'design_get', input: z.input<typeof getDef.inputSchema>): Promise<Got>
  function call(name: 'design_check', input: z.input<typeof checkDef.inputSchema>): Promise<Checked>
  function call(name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<Status>
  function call(name: 'design_components', input: z.input<typeof componentsDef.inputSchema>): Promise<Listed>
  async function call(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = [getDef, checkDef, statusDef, componentsDef].find((candidate) => candidate.name === name)
    if (def?.outputSchema === undefined) throw new Error(`no design tool named ${name}`)
    return def.outputSchema.parse(await rpc.registry.call({name, input}))
  }
  return call
}

const WIDGET_BOOT = `${react.preambleCode.replace('__BASE__', '/')}\nawait import(${JSON.stringify(EXTENSIONS_ROUTE)})`

async function injectWidget(page: Page, apiBase: string): Promise<void> {
  await page.evaluate(
    ({base, entry}) => {
      if (document.querySelector('meta[name="conciv-api-base"]')) return
      const apiMeta = document.createElement('meta')
      apiMeta.name = 'conciv-api-base'
      apiMeta.content = base
      const widgetMeta = document.createElement('meta')
      widgetMeta.name = 'conciv-widget'
      widgetMeta.content = '{}'
      const script = document.createElement('script')
      script.type = 'module'
      script.textContent = entry
      document.head.append(apiMeta, widgetMeta, script)
    },
    {base: apiBase, entry: WIDGET_BOOT},
  )
}

type Host = {
  origin: string
  interrupt: (signal: NodeJS.Signals) => Promise<string | null>
  close: () => Promise<void>
}

type Hosted = Parameters<typeof serveDesignHost>[0]

const HostMessageSchema = z.union([z.object({line: z.string()}), z.object({origin: z.string()})])

async function hostOf(input: {spawned: boolean; hosted: Hosted}): Promise<Host> {
  if (!input.spawned) {
    const {server, origin} = await serveDesignHost(input.hosted)
    return {
      origin,
      interrupt: () => Promise.reject(new Error('only a spawned host can be interrupted')),
      close: () => server.close(),
    }
  }
  const {print, ...passed} = input.hosted
  const child = fork(HOST_PROCESS, [JSON.stringify(passed)], {execArgv: ['--import', 'tsx']})
  const exited = once(child, 'exit').then(([, signal]: unknown[]) => (typeof signal === 'string' ? signal : null))
  const origin = new Promise<string>((resolve, reject) => {
    child.on('message', (message) => {
      const parsed = HostMessageSchema.parse(message)
      if ('line' in parsed) print(parsed.line)
      if ('origin' in parsed) resolve(parsed.origin)
    })
    void exited.then(() => reject(new Error('the spawned design host exited before it listened')))
  })
  const interrupt = async (signal: NodeJS.Signals): Promise<string | null> => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    return exited
  }
  return {
    origin: await origin,
    interrupt,
    close: async () => {
      await interrupt('SIGTERM')
    },
  }
}

const HOST_PROCESS = fileURLToPath(new URL('host-process.ts', import.meta.url))
