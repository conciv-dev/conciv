import {randomUUID} from 'node:crypto'
import {inspect} from 'node:util'
import {serveHono, type ServeFetch} from '@conciv/serve'
import {checkEngines, concivHome, registerEngine, retireEngine, withHomeDb, type EngineRow} from '@conciv/db'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {HarnessAdapter} from '@conciv/harness'
import type {AnyExtension, ExtensionPromptContext} from '@conciv/extension'
import {makeApp, withBuiltinExtensions, type MakeAppOpts} from './app.js'
import {agentPath} from './engine-login.js'

export type {AppType} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './lib/state-paths.js'
import {writeText} from './lib/fs.js'
import {runInOrder, type ShutdownStep} from './lib/shutdown.js'
import {isAddressInUse, readPersistedPort, writePersistedPort} from './lib/server-port.js'
import {defaultDevEndpointDir, removeDevEndpoint, writeDevEndpoint, writePrivateFile} from './lib/dev-endpoint.js'
import {claudeConnectEndpointFile} from '@conciv/harness-init/claude/endpoint'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {BrowserRequester} from '@conciv/protocol/engine-trust'

export type PortRequest = {exact: number} | {preferred: number}

export type StartOpts = {
  options: ConcivConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: PortRequest

  allowedOrigins?: string[]
  accessToken?: string
  onClientRequest?: () => void
  onShutdown?: () => void
  print?: (text: string) => void

  extensions?: AnyExtension[]
  harness?: HarnessAdapter
  nativePageDir?: string
  devEndpointDir?: string
  homeDir?: string
}

export type Engine = {
  port: number
  agentToken: string
  trustBrowser: (requester: BrowserRequester, grantedAt: number) => string
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
  extensionContexts: Record<string, unknown>
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
): Promise<Served> {
  const serving = await serveRequestedPort(fetchHandler, request, state.file)
  writePersistedPort(state.file, {port: serving.port, token: state.token})
  return serving
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
  checkEngines(home, {timeoutMs: 2000}).catch((error: unknown) =>
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

export type ComposePromptOpts = ExtensionPromptContext & {extensions?: Record<string, unknown>}

export function composeSystemPrompt(
  base: string | undefined,
  extensions: readonly AnyExtension[],
  opts: ComposePromptOpts,
): string {
  const prompts = extensions.map((extension) => extension.systemPrompt?.(opts.extensions?.[extension.name], opts))
  return [base, ...prompts].filter(Boolean).join('\n\n')
}

export async function start(opts: StartOpts): Promise<Engine> {
  assertAccessToken(opts.accessToken)
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)

  const systemPrompt = composeSystemPrompt(cfg.systemPrompt, withBuiltinExtensions(opts.extensions), {
    cwd: opts.root,
    extensions: cfg.extensions,
  })
  if (systemPrompt) writeText(paths.systemPrompt, systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  const agentToken = opts.accessToken ?? randomUUID()
  const engineId = randomUUID()
  const portRef = {port: 0}
  const harnessEnv = (sessionId?: SessionId): NodeJS.ProcessEnv => {
    const baseEnv = {...(opts.childEnv ? opts.childEnv(portRef.port) : process.env), CONCIV_TOKEN: agentToken}
    return sessionId ? {...baseEnv, CONCIV_SESSION_ID: sessionId} : baseEnv
  }
  const tokenScopedBase = (): string | undefined => {
    if (portRef.port === 0) return undefined
    return `http://127.0.0.1:${portRef.port}${agentPath(agentToken)}`
  }
  const nativeUrl = (): string | undefined => {
    if (!opts.nativePageDir) return undefined
    return tokenScopedBase()
  }

  const appOpts: MakeAppOpts = {
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
    extensions: opts.extensions,
    extensionConfig: cfg.extensions,
    harness: opts.harness,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
    onShutdown: opts.onShutdown,
    nativePageDir: opts.nativePageDir,
    nativeUrl,
  }
  const {fetch: fetchHandler, dispose, extensionContexts, trustBrowser} = await makeApp(appOpts)

  let serving: Served
  try {
    serving = await servePort(fetchHandler, opts.port, {file: paths.server, token: agentToken})
  } catch (error) {
    await cleanupAfterFailedStart([dispose])
    throw error
  }
  const {port, close} = serving
  portRef.port = port

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
    await cleanupAfterFailedStart([close, dispose])
    throw error
  }
  const retire = base
    ? registerForOutsideAgents(concivHome({homeDir: opts.homeDir, env: process.env}), {
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
  return {
    port,
    agentToken,
    cfg,
    extensionContexts,
    trustBrowser,
    stop: async () => {
      clearEndpoint()
      retire()
      await runInOrder([close, dispose], 'conciv: stopping the engine failed')
    },
  }
}
