import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {chromium, type Browser, type Page} from 'playwright'
import {createLogger, createServer} from 'vite'
import {z} from 'zod'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, type SessionId} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {magicLink} from '@conciv/harness-testkit/login'
import type {} from '@conciv/extension-design/client'
import {DESIGN_TOOLS} from '@conciv/extension-design/defs'
import {unplugin} from '../../../src/plugin-instance.js'
import {renderTargets} from './render-targets.js'

export async function bootDesignHost(options: {config?: DesignConfigInput} = {}): Promise<Kit> {
  const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-state-'))
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-design-endpoint-'))
  const printed: string[] = []
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    customLogger: {
      ...createLogger('silent'),
      info: (message) => {
        printed.push(message)
      },
    },
    server: {host: '127.0.0.1', port: 0},
    plugins: [
      react(),
      unplugin.vite({
        stateRoot,
        harnessBin: 'true',
        systemPrompt: false,
        devEndpointDir,
        extensions: {design: options.config ?? {}},
      }),
    ],
  })
  await server.listen()
  const local = server.resolvedUrls?.local[0]
  if (local === undefined) throw new Error('the fixture dev server has no local url')
  const origin = new URL(local).origin
  const {apiBase} = EndpointSchema.parse(JSON.parse(await readFile(join(devEndpointDir, ENDPOINT_FILE), 'utf8')))
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
    targetsDir,
    call: makeCall(rpc),
    goto,
    dispose: async () => {
      await browser.close()
      await server.close()
      await rm(stateRoot, {recursive: true, force: true})
      await rm(devEndpointDir, {recursive: true, force: true})
      await rm(targetsDir, {recursive: true, force: true})
    },
  }
}

const HOST_ROOT = fileURLToPath(new URL('host/', import.meta.url))
const ENDPOINT_FILE = 'dev-endpoint.json'
const PAGE_DRIVER_TIMEOUT_MS = 30_000

const EndpointSchema = z.object({apiBase: z.string().min(1)})

const [getDef, checkDef, statusDef] = DESIGN_TOOLS

type DesignConfigInput = NonNullable<ConcivConfig['extensions']>['design']
type ToolOutput<Tool extends {outputSchema?: z.ZodType}> = z.output<NonNullable<Tool['outputSchema']>>
type Got = ToolOutput<typeof getDef>
type Checked = ToolOutput<typeof checkDef>
type Status = ToolOutput<typeof statusDef>

type Call = {
  (name: 'design_get', input: z.input<typeof getDef.inputSchema>): Promise<Got>
  (name: 'design_check', input: z.input<typeof checkDef.inputSchema>): Promise<Checked>
  (name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<Status>
}

type Kit = {
  rpc: RpcClient
  browser: Browser
  page: Page
  origin: string
  apiBase: string
  session: SessionId
  stateRoot: string
  targetsDir: string
  call: Call
  goto: (to: string) => Promise<void>
  dispose: () => Promise<void>
}

function makeCall(rpc: RpcClient): Call {
  function call(name: 'design_get', input: z.input<typeof getDef.inputSchema>): Promise<Got>
  function call(name: 'design_check', input: z.input<typeof checkDef.inputSchema>): Promise<Checked>
  function call(name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<Status>
  async function call(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = [getDef, checkDef, statusDef].find((candidate) => candidate.name === name)
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
