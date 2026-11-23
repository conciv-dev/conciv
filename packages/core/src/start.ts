import {randomUUID} from 'node:crypto'
import {serveHono, type ServeFetch} from '@conciv/serve'
import {
  checkEngines,
  prepareHome,
  registerEngine,
  retireEngine,
  withHomeDb,
  type EngineRow,
  type PreparedHome,
} from '@conciv/db'
import {type ConfigProvider, Effect, type Layer} from 'effect'
import {z} from 'zod'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import {harnessRegistry, type HarnessAdapter} from '@conciv/harness'
import type {Plugin} from '@conciv/plugin'
import type {EngineStaleness} from '@conciv/contract'
import {makeApp, type MadeApp, type MakeAppOpts} from './app.js'
import {EngineId} from './lib/engine-id.js'
import {logOnContext, logOnRuntime, type Log, type LogEntry, type LogOptions} from './lib/logging.js'
import {inSpan, type Tracer} from '@conciv/ai/server'
import {startObservability, type EngineObservability} from './runtime/observability.js'
import {engineMcpUrl} from './engine-login.js'
import {carryEngineRouter, readEngineRouter, type EngineRouterBrand} from './api/rpc/engine-router.js'
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
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

const serverStateSchema = z.object({port: z.number().int().min(1).max(65535)})

async function readPersistedPort(file: string): Promise<number | undefined> {
  try {
    const parsed = serverStateSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
    return parsed.success ? parsed.data.port : undefined
  } catch {
    return undefined
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return z.object({code: z.literal(code)}).safeParse(error).success
}

async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined
    throw error
  }
}

async function writePersistedPort(file: string, state: {port: number; token: string}): Promise<ShutdownStep> {
  const previous = await readOptionalText(file)
  const written = `${JSON.stringify(state, null, 2)}\n`
  await writePrivateFile(file, written)
  return async () => {
    if ((await readOptionalText(file)) !== written) return
    if (previous === undefined) await rm(file, {force: true})
    else await writePrivateFile(file, previous)
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

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, text)
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

  harness?: HarnessAdapter
  plugins?: readonly Plugin.Plugin[]
  nativePageDir?: string
  devEndpointDir?: string
  homeDir?: string
  configProvider?: ConfigProvider.ConfigProvider
  log?: LogOptions
  clock?: Layer.Layer<never>

  harnesses?: readonly HarnessAdapter[]
  firstChunkTimeoutMs?: number
  firstStartTimeoutMs?: number
  uiCallWaitMs?: number
  uiAnswerWaitMs?: number
  eventHeartbeatIntervalMs?: number
  stopGraceMs?: number
  staleness?: () => EngineStaleness | undefined
  app?: {version?: () => string | undefined}
}

export type Engine = {
  port: number
  agentToken: string
  trustBrowser: (requester: BrowserRequester, grantedAt: number) => Promise<string>
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
} & EngineRouterBrand

export type {LogEntry, LogOptions}

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
  const persisted = await readPersistedPort(stateFile)
  const reused = persisted === undefined ? undefined : await reservePort(fetchHandler, persisted)
  if (reused) return reused
  return serveHono({fetch: fetchHandler, port: 0})
}

async function servePreferredPort(fetchHandler: FetchHandler, preferred: number, log: Log): Promise<Served> {
  const reserved = await reservePort(fetchHandler, preferred)
  if (reserved) return reserved
  const serving = await serveHono({fetch: fetchHandler, port: 0})
  log(
    Effect.logWarning(
      `conciv: port ${preferred} is already in use, the engine is listening on http://127.0.0.1:${serving.port} instead`,
    ).pipe(Effect.annotateLogs({preferred, port: serving.port, url: `http://127.0.0.1:${serving.port}`})),
  )
  return serving
}

function serveRequestedPort(
  fetchHandler: FetchHandler,
  request: PortRequest | undefined,
  stateFile: string,
  log: Log,
): Promise<Served> {
  if (request === undefined) return servePersistedPort(fetchHandler, stateFile)
  if ('exact' in request) return serveHono({fetch: fetchHandler, port: request.exact})
  return servePreferredPort(fetchHandler, request.preferred, log)
}

async function servePort(
  fetchHandler: FetchHandler,
  request: PortRequest | undefined,
  state: {file: string; token: string},
  log: Log,
  tracer: Tracer | undefined,
): Promise<Served & {restoreRecord: ShutdownStep}> {
  const serving = await inSpan(tracer, 'Engine.listen', {}, () =>
    serveRequestedPort(fetchHandler, request, state.file, log),
  )
  try {
    return {...serving, restoreRecord: await writePersistedPort(state.file, {port: serving.port, token: state.token})}
  } catch (error) {
    await cleanupAfterFailedStart([serving.close], log)
    throw error
  }
}

function cleanupAfterFailedStart(steps: readonly ShutdownStep[], log: Log): Promise<void> {
  return runInOrder(steps, 'conciv: stopping the engine failed').catch((failure: unknown) =>
    log(Effect.logError('conciv: cleanup after a failed start also failed', {failure})),
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

async function registeredHome(home: string, row: EngineRow, log: Log): Promise<PreparedHome | null> {
  try {
    const prepared = await prepareHome(home)
    withHomeDb(prepared, (db) => registerEngine(db, row))
    return prepared
  } catch (error) {
    log(Effect.logError('conciv: engine not registered for outside agents', {engineId: row.id, error}))
    return null
  }
}

async function registerForOutsideAgents(home: string, row: EngineRow, log: Log): Promise<() => void> {
  const registered = await registeredHome(home, row, log)
  if (registered === null) return () => {}
  checkEngines(home, {timeoutMs: 300}).catch((error: unknown) =>
    log(Effect.logError('conciv: checking registered engines failed', {error})),
  )
  return () => {
    try {
      withHomeDb(registered, (db) => retireEngine(db, row.id, Date.now()))
    } catch (error) {
      log(Effect.logError('conciv: engine row not retired', {engineId: row.id, error}))
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
  await createConcivStateDir(paths.dir)

  const systemPrompt = cfg.systemPrompt
  if (systemPrompt) await writeText(paths.systemPrompt, systemPrompt)

  const agentToken = opts.accessToken ?? randomUUID()
  const engineId = EngineId.create()
  const {home, env} = await runWithProvider(
    configProvider,
    Effect.all({home: readConcivHome(opts.homeDir), env: readProcessEnv}),
  )
  const observability = await startObservability({
    home,
    fallbackRoots: join(paths.dir, 'plugin-host'),
    configProvider,
    engineId,
    log: opts.log,
  })
  return inSpan(
    observability.tracer,
    'Engine.start',
    {'conciv.engine.id': engineId, 'conciv.harness.id': cfg.harness},
    () =>
      startEngine({
        opts,
        cfg,
        configProvider,
        registry,
        paths,
        home,
        env,
        agentToken,
        engineId,
        systemPrompt,
        observability,
      }),
  ).catch(async (error: unknown) => {
    await observability.dispose()
    throw error
  })
}

type EngineStart = {
  opts: StartOpts
  cfg: ResolvedConcivConfig
  configProvider: ConfigProvider.ConfigProvider
  registry: ReturnType<typeof harnessRegistry>
  paths: StatePaths
  home: string
  env: NodeJS.ProcessEnv
  agentToken: string
  engineId: EngineId
  systemPrompt: string | undefined
  observability: EngineObservability
}

async function startEngine(engine: EngineStart): Promise<Engine> {
  const {opts, cfg, configProvider, registry, paths, home, env, agentToken, engineId, systemPrompt, observability} =
    engine
  const tracer = observability.tracer
  const openInEditor = makeEditorOpener(
    (file, line, column) => opts.launchEditor(file, line, column),
    4000,
    () => Date.now(),
  )
  const earlyLog = logOnContext(observability.context)
  const portRef = {port: 0}
  const harnessEnv = (sessionId?: SessionId): NodeJS.ProcessEnv => {
    const baseEnv = {...(opts.childEnv ? opts.childEnv(portRef.port) : env), CONCIV_TOKEN: agentToken}
    return sessionId ? {...baseEnv, CONCIV_SESSION_ID: sessionId} : baseEnv
  }
  const boundOrigin = (): string | undefined => {
    if (portRef.port === 0) return undefined
    return `http://127.0.0.1:${portRef.port}`
  }

  const appOpts: MakeAppOpts = {
    home,
    configProvider,
    clock: opts.clock,
    harnessRegistry: registry,
    cfg,
    cwd: opts.root,
    agentToken,
    engineId,
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
    boundOrigin,
    plugins: opts.plugins,
    harnesses: opts.harnesses,
    firstChunkTimeoutMs: opts.firstChunkTimeoutMs,
    firstStartTimeoutMs: opts.firstStartTimeoutMs,
    uiCallWaitMs: opts.uiCallWaitMs,
    uiAnswerWaitMs: opts.uiAnswerWaitMs,
    eventHeartbeatIntervalMs: opts.eventHeartbeatIntervalMs,
    stopGraceMs: opts.stopGraceMs,
    staleness: opts.staleness,
    app: opts.app,
    observability,
  }
  const madeApp = Promise.withResolvers<MadeApp>()
  madeApp.promise.catch(() => {})
  const {port, close, restoreRecord} = await servePort(
    (request, env) => madeApp.promise.then((made) => made.fetch(request, env)),
    opts.port,
    {file: paths.server, token: agentToken},
    earlyLog,
    tracer,
  )
  portRef.port = port
  const abandonStart = (steps: readonly ShutdownStep[]): Promise<void> =>
    cleanupAfterFailedStart([close, ...steps, restoreRecord], earlyLog)
  const made = await inSpan(tracer, 'Engine.makeApp', {}, () => makeApp(appOpts)).catch(async (error: unknown) => {
    madeApp.reject(error)
    await abandonStart([])
    throw error
  })
  madeApp.resolve(made)
  const {dispose, trustBrowser, awaitActivation} = made
  const log = logOnRuntime(made.pluginHost)

  const endpointDir = opts.devEndpointDir ?? defaultDevEndpointDir()
  const origin = boundOrigin()
  try {
    if (origin) {
      const endpoint = claudeConnectEndpointFile({stateDir: paths.dir, mcpUrl: engineMcpUrl(origin, agentToken)})
      await writePrivateFile(endpoint.path, endpoint.contents)
    }
    if (opts.nativePageDir && origin) {
      await writeDevEndpoint(endpointDir, {apiBase: origin, token: agentToken, pid: process.pid})
    }
  } catch (error) {
    await abandonStart([dispose])
    throw error
  }
  const retire = origin
    ? await registerForOutsideAgents(
        home,
        {
          id: engineId,
          pid: process.pid,
          root: opts.root,
          apiBase: origin,
          token: agentToken,
        },
        log,
      )
    : () => {}
  const clearEndpoint = async (): Promise<void> => {
    if (!opts.nativePageDir) return
    try {
      await removeDevEndpoint(endpointDir, process.pid)
    } catch (error) {
      log(Effect.logError('conciv: failed to remove the dev endpoint file', {endpointDir, error}))
    }
  }
  try {
    await inSpan(tracer, 'Engine.awaitActivation', {}, awaitActivation)
  } catch (error) {
    await clearEndpoint()
    retire()
    await abandonStart([dispose])
    throw error
  }
  return carryEngineRouter(
    {
      port,
      agentToken,
      cfg,
      trustBrowser,
      stop: async () => {
        try {
          await inSpan(tracer, 'Engine.stop', {'conciv.engine.id': engineId}, async () => {
            await clearEndpoint()
            retire()
            await runInOrder([close, dispose], 'conciv: stopping the engine failed')
          })
        } finally {
          await observability.dispose()
        }
      },
    },
    readEngineRouter(made),
  )
}
