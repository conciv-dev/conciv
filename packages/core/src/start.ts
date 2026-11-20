import {randomUUID} from 'node:crypto'
import {inspect} from 'node:util'
import {serveHono, type ServeFetch} from '@conciv/serve'
import {checkEngines, registerEngine, retireEngine, withHomeDb, type EngineRow} from '@conciv/db'
import {type ConfigProvider, Effect} from 'effect'
import {z} from 'zod'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import {harnessRegistry, type HarnessAdapter} from '@conciv/harness'
import type {Plugin} from '@conciv/plugin'
import {makeApp, type MadeApp, type MakeAppOpts} from './app.js'
import {agentPath} from './engine-login.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {createConcivStateDir, concivStateDir} from '@conciv/protocol/state-types'
import {requireHarness} from './lib/require-harness.js'
import {defaultConfigProvider} from './lib/default-config-provider.js'
import {readConcivHome, readProcessEnv, runWithProvider} from './lib/engine-env.js'
import {runInOrder, type ShutdownStep} from './lib/shutdown.js'
import {defaultDevEndpointDir, removeDevEndpoint, writeDevEndpoint, writePrivateFile} from './lib/dev-endpoint.js'
import {claudeConnectEndpointFile} from '@conciv/harness-init/claude/endpoint'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {BrowserRequester} from '@conciv/protocol/engine-trust'
import {mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'

const serverStateSchema = z.object({port: z.number().int().min(1).max(65535)})

function readPersistedPort(file: string): number | undefined {
  try {
    const parsed = serverStateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return z.object({code: z.literal(code)}).safeParse(error).success
}

function readOptionalText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  }
}

function writePersistedPort(file: string, state: {port: number; token: string}): () => void {
  const previous = readOptionalText(file)
  const written = `${JSON.stringify(state, null, 2)}\n`
  writePrivateFile(file, written)
  return () => {
    if (readOptionalText(file) !== written) return
    if (previous === undefined) rmSync(file, {force: true})
    else writePrivateFile(file, previous)
  }
}

function isAddressInUse(error: unknown): boolean {
  return hasErrorCode(error, 'EADDRINUSE')
}

type StatePaths = {
  dir: string
  systemPrompt: string
  server: string
}

export function statePaths(stateRoot: string): StatePaths {
  const dir = concivStateDir(stateRoot)
  return {
    dir,
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
    server: join(dir, 'server.json'),
  }
}

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, text)
}

export type PortRequest = {exact: number} | {preferred: number}

export type StartOpts = {
  options: ConcivConfig
  root: string
  bridge?: Bundler.BundlerBridge
  launchEditor: (file: string, line: number, column?: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: PortRequest

  allowedOrigins?: string[]
  accessToken?: string
  onClientRequest?: () => void
  onShutdown?: () => void
  print?: (text: string) => void

  harness?: HarnessAdapter
  plugins?: readonly Plugin.Plugin[]
  nativePageDir?: string
  devEndpointDir?: string
  homeDir?: string
  configProvider?: ConfigProvider.ConfigProvider
}

export type Engine = {
  port: number
  agentToken: string
  trustBrowser: (requester: BrowserRequester, grantedAt: number) => string
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
}

type Served = Awaited<ReturnType<typeof serveHono>>
type FetchHandler = ServeFetch

const PERSISTED_PORT_ATTEMPTS = 4
const PERSISTED_PORT_RETRY_MS = 300
const accessTokenMessage = 'conciv: accessToken must be a UUID pairing token'
const AccessTokenSchema = z.uuid(accessTokenMessage).optional()

function assertAccessToken(accessToken: string | undefined): void {
  const parsed = AccessTokenSchema.safeParse(accessToken)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? accessTokenMessage)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reservePort(fetchHandler: FetchHandler, port: number): Promise<Served | undefined> {
  for (let attempt = 0; attempt < PERSISTED_PORT_ATTEMPTS; attempt++) {
    try {
      return await serveHono({fetch: fetchHandler, port})
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      if (attempt < PERSISTED_PORT_ATTEMPTS - 1) await delay(PERSISTED_PORT_RETRY_MS)
    }
  }
  return undefined
}

async function servePersistedPort(fetchHandler: FetchHandler, stateFile: string): Promise<Served> {
  const persisted = readPersistedPort(stateFile)
  const reused = persisted === undefined ? undefined : await reservePort(fetchHandler, persisted)
  if (reused) return reused
  return serveHono({fetch: fetchHandler, port: 0})
}

async function servePreferredPort(fetchHandler: FetchHandler, preferred: number): Promise<Served> {
  const reserved = await reservePort(fetchHandler, preferred)
  if (reserved) return reserved
  const serving = await serveHono({fetch: fetchHandler, port: 0})
  console.warn(
    `conciv: port ${preferred} is already in use, the engine is listening on http://127.0.0.1:${serving.port} instead`,
  )
  return serving
}

function serveRequestedPort(
  fetchHandler: FetchHandler,
  request: PortRequest | undefined,
  stateFile: string,
): Promise<Served> {
  if (request === undefined) return servePersistedPort(fetchHandler, stateFile)
  if ('exact' in request) return serveHono({fetch: fetchHandler, port: request.exact})
  return servePreferredPort(fetchHandler, request.preferred)
}

async function servePort(
  fetchHandler: FetchHandler,
  request: PortRequest | undefined,
  state: {file: string; token: string},
): Promise<Served & {restoreRecord: ShutdownStep}> {
  const serving = await serveRequestedPort(fetchHandler, request, state.file)
  try {
    return {...serving, restoreRecord: writePersistedPort(state.file, {port: serving.port, token: state.token})}
  } catch (error) {
    await cleanupAfterFailedStart([serving.close])
    throw error
  }
}

function cleanupAfterFailedStart(steps: readonly ShutdownStep[]): Promise<void> {
  return runInOrder(steps, 'conciv: stopping the engine failed').catch((failure: unknown) =>
    console.error('conciv: cleanup after a failed start also failed', inspect(failure, {depth: null})),
  )
}

function onceNotifier(callback?: () => void): () => void {
  let fired = false
  return () => {
    if (fired || !callback) return
    fired = true
    callback()
  }
}

function registerForOutsideAgents(home: string, row: EngineRow): () => void {
  try {
    withHomeDb(home, (db) => registerEngine(db, row))
  } catch (error) {
    console.error('conciv: engine not registered for outside agents', error)
    return () => {}
  }
  checkEngines(home, {timeoutMs: 300}).catch((error: unknown) =>
    console.error('conciv: checking registered engines failed', error),
  )
  return () => {
    try {
      withHomeDb(home, (db) => retireEngine(db, row.id, Date.now()))
    } catch (error) {
      console.error('conciv: engine row not retired', error)
    }
  }
}

export async function start(opts: StartOpts): Promise<Engine> {
  assertAccessToken(opts.accessToken)
  const configProvider = opts.configProvider ?? defaultConfigProvider()
  const cfg = resolveConfig(opts.options, opts.root, configProvider)
  const registry = harnessRegistry(configProvider)
  if (!opts.harness) requireHarness(registry, cfg.harness)
  const paths = statePaths(cfg.stateRoot)
  createConcivStateDir(paths.dir)

  const systemPrompt = cfg.systemPrompt
  if (systemPrompt) writeText(paths.systemPrompt, systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line, column) => opts.launchEditor(file, line, column),
    4000,
    () => Date.now(),
  )

  const agentToken = opts.accessToken ?? randomUUID()
  const engineId = randomUUID()
  const portRef = {port: 0}
  const {home, env} = await runWithProvider(
    configProvider,
    Effect.all({home: readConcivHome(opts.homeDir), env: readProcessEnv}),
  )
  const harnessEnv = (sessionId?: SessionId): NodeJS.ProcessEnv => {
    const baseEnv = {...(opts.childEnv ? opts.childEnv(portRef.port) : env), CONCIV_TOKEN: agentToken}
    return sessionId ? {...baseEnv, CONCIV_SESSION_ID: sessionId} : baseEnv
  }
  const tokenScopedBase = (): string | undefined => {
    if (portRef.port === 0) return undefined
    return `http://127.0.0.1:${portRef.port}${agentPath(agentToken)}`
  }

  const appOpts: MakeAppOpts = {
    home,
    configProvider,
    harnessRegistry: registry,
    cfg,
    cwd: opts.root,
    agentToken,
    engineId,
    print: opts.print,
    onTrusted: onceNotifier(opts.onClientRequest),
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    harness: opts.harness,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
    onShutdown: opts.onShutdown,
    nativePageDir: opts.nativePageDir,
    tokenScopedBase,
    plugins: opts.plugins,
  }
  const madeApp = Promise.withResolvers<MadeApp>()
  madeApp.promise.catch(() => {})
  const {port, close, restoreRecord} = await servePort(
    (request, env) => madeApp.promise.then((made) => made.fetch(request, env)),
    opts.port,
    {file: paths.server, token: agentToken},
  )
  portRef.port = port
  const abandonStart = (steps: readonly ShutdownStep[]): Promise<void> =>
    cleanupAfterFailedStart([close, ...steps, restoreRecord])
  const made = await makeApp(appOpts).catch(async (error: unknown) => {
    madeApp.reject(error)
    await abandonStart([])
    throw error
  })
  madeApp.resolve(made)
  const {dispose, trustBrowser, awaitActivation} = made

  const endpointDir = opts.devEndpointDir ?? defaultDevEndpointDir()
  const base = tokenScopedBase()
  try {
    if (base) {
      const endpoint = claudeConnectEndpointFile({stateDir: paths.dir, mcpUrl: `${base}/api/mcp`})
      writePrivateFile(endpoint.path, endpoint.contents)
    }
    if (opts.nativePageDir && base) {
      writeDevEndpoint(endpointDir, {apiBase: base, token: agentToken, pid: process.pid})
    }
  } catch (error) {
    await abandonStart([dispose])
    throw error
  }
  const retire = base
    ? registerForOutsideAgents(home, {
        id: engineId,
        pid: process.pid,
        root: opts.root,
        apiBase: base,
      })
    : () => {}
  const clearEndpoint = (): void => {
    if (!opts.nativePageDir) return
    try {
      removeDevEndpoint(endpointDir, process.pid)
    } catch (error) {
      console.error('conciv: failed to remove the dev endpoint file', error)
    }
  }
  try {
    await awaitActivation()
  } catch (error) {
    clearEndpoint()
    retire()
    await abandonStart([dispose])
    throw error
  }
  return {
    port,
    agentToken,
    cfg,
    trustBrowser,
    stop: async () => {
      clearEndpoint()
      retire()
      await runInOrder([close, dispose], 'conciv: stopping the engine failed')
    },
  }
}
