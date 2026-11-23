import {randomUUID} from 'node:crypto'
import {access, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {Hono, type MiddlewareHandler} from 'hono'
import {z} from 'zod'
import {EngineStalenessSchema, type EngineStaleness} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {HTTPException} from 'hono/http-exception'
import {type HarnessAdapter, resolveHarnessModels} from '@conciv/harness'
import {concivStateDir} from '@conciv/protocol/state-types'
import {idleFailedEvent, type ChatEvent, type RunLifecycle} from '@conciv/protocol/chat-event-types'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {
  HarnessPermissionAsk,
  HarnessPermissionVerdict,
  ServerHarness,
  ServerSessions,
  HarnessModel,
} from '@conciv/protocol/harness-types'
import {assertToolName, toolError} from '@conciv/protocol/tool-call-types'
import type {ResolvedConcivConfig} from './config.js'
import {harnessRegistry, type HarnessRegistry, onPath, transcriptPathWithin} from '@conciv/harness'
import {requireHarness} from './lib/require-harness.js'
import {defaultConfigProvider} from './lib/default-config-provider.js'
import {createSessionSearch} from './sessions/session-search.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivSandboxTools, concivSandboxToolNames, type ConcivToolContext} from '@conciv/tools'
import {
  type ChatTool,
  type HarnessSessionId,
  type SessionId,
  type SessionRecord,
  HarnessModelSchema,
} from '@conciv/protocol/chat-types'
import {
  anonymousExternalRow,
  currentRow,
  isDeletedRow,
  ensureAgentRow,
  ensureRow,
  nativeIdFor,
  recordActivity,
  recordNativeId,
  sweepEmptyRows,
  type RowScope,
} from './sessions/session-rows.js'
import {
  assistCapabilities,
  createChatPlane,
  toolDomainCapabilities,
  type ChatPlane,
  type CodeCapability,
  type SessionPort,
} from '@conciv/chat'
import {eq} from 'drizzle-orm'
import {differenceBy, isNotNil, memoize, pickBy} from 'es-toolkit'
import {
  Cause,
  Config,
  type ConfigProvider,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  type Layer,
  Option,
  Schema,
  Scope,
} from 'effect'
import {Bus, Database, Permission, PluginHooks, SessionEvent, SessionInbox, SessionSchema} from '@conciv/plugin-host'
import type {Plugin} from '@conciv/plugin'
import type {ChatContext, PluginHost, RpcDeps} from './api/rpc/mount.js'
import {readModel, openDb, sessions, type ConcivDb} from '@conciv/db'
import {createSettingsStorage, settingsOnDisk} from './settings/settings-storage.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import mcpApp, {type McpVars} from './api/mcp.js'
import {makeHubInstaller} from './api/rpc/hub.js'
import {readConcivHome, readProcessEnv, runWithProvider} from './lib/engine-env.js'
import {createTabs} from './api/tabs.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makeSessionPrimitives} from './runtime/primitives.js'
import {makePagePlugin, type QueueFinished} from './page/page-plugin.js'
import {holdForNextReply, owesFollowUp, pageQueueChunks, startQueueFollowUp} from './page/page-queue.js'
import {makeCoreRuntime} from './runtime/core-runtime.js'
import {createPersistentPtys} from './pty/persistent-ptys.js'
import concivPage from '@conciv/plugin-page'
import {
  answerPermission,
  askForHarness,
  assertOutsideAgent,
  followPermissionCards,
  pendingPermissionCards,
  pluginInstructions,
  settlingAsks,
  currentToolDomain,
} from './runtime/permission-cards.js'
import {makePluginRuntime, type PluginRuntime} from './runtime/plugin-runtime.js'
import {startObservability, type EngineObservability} from './runtime/observability.js'
import type {CoreRuntime, SessionScope} from './runtime/scope-types.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {carryEngineRouter, type EngineRouterBrand} from './api/rpc/engine-router.js'
import {rpcSessionMeta} from './api/rpc/sessions.js'
import {RPC_PREFIX, rpcFetchMiddleware, rpcWebsocketRoute} from '@conciv/serve/rpc'
import {GROUP_EXIT_TIMEOUT_MS, inSpan, loadIsolateDriver, type Tracer} from '@conciv/ai/server'
import {runInOrder, type ShutdownStep} from './lib/shutdown.js'
import {engineStaleness} from './lib/engine-stamp.js'
import {
  connectToken,
  engineMcpUrl,
  makeAuthRouter,
  makeCodeStore,
  makeConnectionTrust,
  makeEngineGate,
  rpcSocketGate,
  watchTrustedBrowsers,
  type ConnectionTrust,
  type GatedFetch,
  type TrustedBrowsers,
} from './engine-login.js'
import type {OpenInEditor} from './editor/open.js'
import type {AttachmentDocumentPart, ContentPart} from '@conciv/protocol/chat-message-types'
import {GRAB_MIME, parseGrabPayload} from '@conciv/grab/grab-attachment'
import {writePrivateFile} from './lib/private-file.js'
import {logOnContext, logOnRuntime, type Log, type LogOptions} from './lib/logging.js'

const NO_TAB_MESSAGE = 'pass tab to execute_typescript; list_tabs lists the open tabs'

export function outsideRunCapabilities(capabilities: readonly CodeCapability[]): CodeCapability[] {
  return capabilities.map((capability): CodeCapability => {
    if (capability.direct === true) return capability
    return {
      ...capability,
      errors: [...capability.errors, {code: 'NO_TAB', message: NO_TAB_MESSAGE}],
      execute: () => {
        throw toolError('NO_TAB', {message: NO_TAB_MESSAGE})
      },
    }
  })
}

const SavedModelsSchema = z.array(HarnessModelSchema)

type SavedModelsHarness = {harness: HarnessAdapter; settled: () => Promise<void>}

async function readSaved(path: string): Promise<HarnessModel[] | null> {
  try {
    const parsed = SavedModelsSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function writeSaved(path: string, models: HarnessModel[], log: Log): Promise<void> {
  try {
    await writePrivateFile(path, JSON.stringify(models))
  } catch (error) {
    log(Effect.logError('[core] the model list could not be saved', {path, error}))
  }
}

export async function withSavedModels(
  adapter: HarnessAdapter,
  stateDir: string,
  signal: AbortSignal,
  log: Log,
): Promise<SavedModelsHarness> {
  if (typeof adapter.models !== 'function') return {harness: adapter, settled: () => Promise.resolve()}
  const path = join(stateDir, `${adapter.id}-models.json`)
  const state: {saved: HarnessModel[] | null; refreshing?: Promise<HarnessModel[]>} = {saved: await readSaved(path)}
  async function listLive(): Promise<HarnessModel[]> {
    signal.throwIfAborted()
    return resolveHarnessModels(adapter, {signal})
  }
  function refresh(): Promise<HarnessModel[]> {
    state.refreshing ??= listLive()
      .then(async (listed) => {
        signal.throwIfAborted()
        state.saved = listed
        await writeSaved(path, listed, log)
        return listed
      })
      .catch((error: unknown) => {
        delete state.refreshing
        throw error
      })
    return state.refreshing
  }
  function refreshInBackground(): void {
    refresh().catch((error: unknown) => {
      if (!signal.aborted)
        log(Effect.logError('[core] the model list could not be refreshed', {harness: adapter.id, error}))
    })
  }
  function models(): Promise<HarnessModel[]> {
    if (state.saved === null) return refresh()
    refreshInBackground()
    return Promise.resolve(state.saved)
  }
  async function settled(): Promise<void> {
    await Promise.allSettled([state.refreshing])
  }
  refreshInBackground()
  return {harness: {...adapter, models}, settled}
}

async function expandGrab(part: AttachmentDocumentPart): Promise<readonly ContentPart[]> {
  const payload = parseGrabPayload(Buffer.from(part.source.value, 'base64').toString('utf8'))
  if (!payload || payload.text === '') return []
  return [{type: 'text', content: payload.text}]
}

const grabExpander = {[GRAB_MIME]: expandGrab}

export type MakeAppOpts = {
  cfg: ResolvedConcivConfig
  cwd: string
  agentToken?: string
  engineId?: string
  onTrusted?: () => void
  bridge?: Bundler.BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string

  systemPromptText?: string

  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  harnesses?: readonly HarnessAdapter[]

  harnessRegistry?: HarnessRegistry

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  firstStartTimeoutMs?: number

  uiCallWaitMs?: number

  uiAnswerWaitMs?: number

  eventHeartbeatIntervalMs?: number

  stopGraceMs?: number

  pageReplyTimeoutMs?: number

  queuedActionTimeoutMs?: number

  nativePageDir?: string

  boundOrigin?: () => string | undefined

  plugins?: readonly Plugin.Plugin[]

  staleness?: () => EngineStaleness | undefined

  app?: {version?: () => string | undefined}

  home?: string

  configProvider?: ConfigProvider.ConfigProvider

  log?: LogOptions
  clock?: Layer.Layer<never>
  observability?: EngineObservability
}

const PathConfig = Config.String('PATH').pipe(Config.withDefault(''))

const readAppEnv = Effect.fn('core.app.readEnv')(function* (homeDir: string | undefined, log: Log) {
  const home = yield* readConcivHome(homeDir)
  const env = yield* readProcessEnv
  return {home, path: yield* PathConfig, env, hub: yield* makeHubInstaller(home, env, log)}
})

async function detectedHarnesses(registry: HarnessRegistry, path: string, cwd: string): Promise<HarnessAdapter[]> {
  const adapters = registry.list()
  const found = await Promise.all(adapters.map((adapter) => onPath(path, adapter.binName, cwd)))
  return adapters.filter((adapter, index) => found[index] === true)
}

async function availableHarnesses(
  boot: SavedModelsHarness,
  opts: MakeAppOpts,
  registry: HarnessRegistry,
  stateDir: string,
  signal: AbortSignal,
  path: string,
  log: Log,
): Promise<SavedModelsHarness[]> {
  const adapters = (opts.harnesses ?? (opts.harness ? [] : await detectedHarnesses(registry, path, opts.cwd))).filter(
    (adapter) => adapter.id !== boot.harness.id,
  )
  const others = await Promise.all(adapters.map((adapter) => withSavedModels(adapter, stateDir, signal, log)))
  return [boot, ...others]
}

async function recordSessionUsage(db: ConcivDb, sessionId: SessionId, usage: UsageSnapshot): Promise<void> {
  await Effect.runPromise(db.update(sessions).set({usage, updatedAt: Date.now()}).where(eq(sessions.id, sessionId)))
}

function sessionPort(
  db: ConcivDb,
  rows: RowScope,
  hooks: Pick<SessionPort, 'onRunStart' | 'onRunEnd' | 'publish'>,
): SessionPort {
  return {
    row: async (sessionId) => {
      const row = await currentRow(db, sessionId)
      return row === null
        ? null
        : {
            model: row.model,
            effort: row.effort,
            nativeId: row.harnessSessionId,
            cwd: row.cwd,
            harnessKind: row.harnessKind,
            deletedAt: row.deletedAt,
          }
    },
    ensure: (sessionId) => ensureRow(rows, sessionId),
    recordNativeId: (sessionId, harnessId, nativeId) => recordNativeId(db, sessionId, harnessId, nativeId),
    recordUsage: (sessionId, usage) => recordSessionUsage(db, sessionId, usage),
    recordContextTokens: async (sessionId, contextTokens) => {
      const usage = (await currentRow(db, sessionId))?.usage
      if (usage) await recordSessionUsage(db, sessionId, {...usage, contextTokens})
    },
    recordActivity: (sessionId, title, at) => recordActivity(db, sessionId, title, at),
    onRunStart: hooks.onRunStart,
    onRunEnd: hooks.onRunEnd,
    publish: hooks.publish,
  }
}

function assertUniqueCapabilityNames(sources: [string, string[]][]): void {
  const owners = new Map<string, string>()
  for (const [source, names] of sources) {
    for (const name of names) {
      assertToolName(name)
      const existing = owners.get(name)
      if (existing !== undefined) {
        throw new Error(`capability name "${name}" is declared by both ${existing} and ${source}`)
      }
      owners.set(name, source)
    }
  }
}

const HealthSchema = z.object({
  ok: z.literal(true),
  harness: z.string(),
  engine: EngineStalenessSchema.pick({stale: true}),
  id: z.string(),
})

export type CoreVars = CorsVars & McpVars

function composeRoutes(
  vars: CoreVars & {harnessId: string},
  rpc: ReturnType<typeof makeRpcRouter>,
  deps: {
    engineId: string
    staleness: () => Promise<EngineStaleness>
    version: (() => string | undefined) | undefined
    onShutdown?: () => void
    trust: ConnectionTrust
    log: Log
    tracer: Tracer | undefined
  },
) {
  const traceCall = deps.tracer === undefined ? undefined : rpcSpan(deps.tracer)
  const app = new Hono<{Variables: CoreVars}>()
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({message: error.message}, error.status)
      deps.log(Effect.logError('[core] unhandled route error', {path: c.req.path, error}))
      return c.json({message: 'internal error'}, 500)
    })
    .use(async (c, next) => {
      c.set('cors', vars.cors)
      c.set('mcp', vars.mcp)
      await next()
    })
    .use(corsMiddleware(deps.version))
  if (deps.tracer !== undefined) app.use('/api/mcp', mcpSpan(deps.tracer))
  return app
    .get('/health', async (c) =>
      c.json(
        HealthSchema.parse({ok: true, harness: vars.harnessId, engine: await deps.staleness(), id: deps.engineId}),
      ),
    )
    .post('/api/shutdown', (c) => {
      if (!deps.onShutdown) return c.json({message: 'shutdown not supported'}, 404)
      setTimeout(deps.onShutdown, 50)
      return c.json({ok: true})
    })
    .get(
      RPC_WS_PATH,
      rpcWebsocketRoute(rpc, {
        upgrade: upgradeWebSocket,
        onError: (message) => deps.log(Effect.logError(message)),
        gate: (c) => rpcSocketGate(deps.trust, c.req.url),
        traceCall,
      }),
    )
    .use(
      `${RPC_PREFIX}/*`,
      rpcFetchMiddleware(rpc, {traceCall, engineCaller: (c) => deps.trust.isEngine(connectToken(c.req.url))}),
    )
    .route('/api/mcp', mcpApp)
}

function rpcSpan(tracer: Tracer) {
  return (path: readonly string[], call: () => Promise<unknown>): Promise<unknown> =>
    inSpan(tracer, `Rpc.${path.join('.')}`, {'rpc.procedure': path.join('.')}, call, {root: true})
}

function mcpSpan(tracer: Tracer): MiddlewareHandler {
  return async (c, next) => inSpan(tracer, 'Mcp.request', await mcpAttributes(c.req.raw), next, {root: true})
}

const McpMessageSchema = z
  .object({
    method: z.string().catch('unknown'),
    params: z.object({name: z.string()}).optional().catch(undefined),
  })
  .catch({method: 'unknown'})

async function mcpAttributes(request: Request): Promise<Record<string, string>> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null)
  const {method, params} = McpMessageSchema.parse(body)
  return params === undefined ? {'rpc.method': method} : {'rpc.method': method, 'conciv.tool.name': params.name}
}

export type AppType = ReturnType<typeof composeRoutes>

export type EngineFetch = GatedFetch<unknown>

export type MadeApp = {
  app: AppType
  fetch: EngineFetch
  agentToken: string
  trustBrowser: TrustedBrowsers['grant']
  chat: ChatContext
  plane: ChatPlane
  dispose: () => Promise<void>
  runtime: CoreRuntime
  pluginHost: PluginHost
  awaitActivation: () => Promise<void>
} & EngineRouterBrand

function makeServerHarness(harness: HarnessAdapter, cwd: string): ServerHarness {
  const history = harness.history
  const transcriptExists = async (token: HarnessSessionId): Promise<boolean> => {
    if (history === undefined) return false
    const path = await transcriptPathWithin(history, cwd, token)
    return (
      path !== null &&
      (await access(path).then(
        () => true,
        () => false,
      ))
    )
  }
  return {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: history?.transcriptPath ? transcriptExists : undefined,
  }
}

function publishCreated(born: SessionRecord) {
  const sessionID = SessionSchema.Id.make(born.id)
  return Bus.Service.use((bus) =>
    bus.publish(SessionEvent.Created, born.title === null ? {sessionID} : {sessionID, title: born.title}),
  ).pipe(Effect.asVoid)
}

function publishRunStart(sessionId: SessionId) {
  return Bus.Service.use((bus) =>
    bus.publish(SessionEvent.Execution.Started, {sessionID: SessionSchema.Id.make(sessionId)}),
  ).pipe(Effect.asVoid)
}

function publishRunEnd(sessionId: SessionId, run: RunLifecycle, interrupted: 'user' | 'shutdown') {
  const sessionID = SessionSchema.Id.make(sessionId)
  return Bus.Service.use((bus) => {
    if (run.phase === 'completed') return bus.publish(SessionEvent.Execution.Succeeded, {sessionID})
    if (run.phase === 'failed')
      return bus.publish(SessionEvent.Execution.Failed, {sessionID, error: run.error ?? 'the run failed'})
    if (run.phase === 'aborted')
      return bus.publish(SessionEvent.Execution.Interrupted, {sessionID, reason: interrupted})
    return Effect.void
  }).pipe(Effect.asVoid)
}

async function mcpSessionId(
  rows: RowScope,
  header: SessionId | null,
  nativeId: HarnessSessionId | null,
): Promise<SessionId> {
  if (header !== null) return header
  if (nativeId !== null) return (await ensureAgentRow(rows, nativeId)).id
  return anonymousExternalRow(rows)
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const configProvider = opts.configProvider ?? defaultConfigProvider()
  const stateDir = concivStateDir(opts.cfg.stateRoot)
  const engineId = opts.engineId ?? randomUUID()
  const givenObservability = opts.observability
  const observability =
    givenObservability ??
    (await startObservability({
      home: await runWithProvider(configProvider, readConcivHome(opts.home)),
      fallbackRoots: join(stateDir, 'plugin-host'),
      configProvider,
      engineId,
      log: opts.log,
    }))
  const releaseObservability = (): Promise<void> | undefined =>
    givenObservability === undefined ? observability.dispose() : undefined
  const tracer = observability.tracer
  const earlyLog = logOnContext(observability.context)
  const appEnv = await runWithProvider(configProvider, readAppEnv(opts.home, earlyLog)).catch(
    async (error: unknown) => {
      await releaseObservability()
      throw error
    },
  )
  const engineLife = new AbortController()
  const registry = opts.harnessRegistry ?? harnessRegistry(configProvider)
  const boot = await withSavedModels(
    opts.harness ?? requireHarness(registry, opts.cfg.harness),
    stateDir,
    engineLife.signal,
    earlyLog,
  )
  const harness = boot.harness
  const agentToken = opts.agentToken ?? randomUUID()
  const browsers = await watchTrustedBrowsers(stateDir, earlyLog).catch(async (error: unknown) => {
    await releaseObservability()
    throw error
  })
  const trust = makeConnectionTrust(agentToken, browsers)
  const listings = await availableHarnesses(boot, opts, registry, stateDir, engineLife.signal, appEnv.path, earlyLog)
  const harnesses = listings.map((listing) => listing.harness)
  const endListing = async (listing: SavedModelsHarness): Promise<void> => {
    const ended = listing.settled().then(() => true)
    if (await Promise.race([ended, delay(opts.stopGraceMs ?? GROUP_EXIT_TIMEOUT_MS, false, {ref: false})])) return
    earlyLog(
      Effect.logWarning('[core] the model listing did not end when the engine stopped; closing without it', {
        harness: listing.harness.id,
      }),
    )
  }
  const endListings = async (): Promise<void> => {
    engineLife.abort(new Error('conciv: the engine stopped'))
    await Promise.all(listings.map(endListing))
  }
  const staleness = async (): Promise<EngineStaleness> => opts.staleness?.() ?? engineStaleness()
  const dbScope = Effect.runSync(Scope.make())
  const closeDb = () => Effect.runPromise(Scope.close(dbScope, Exit.void))
  const failedStart =
    (steps: ShutdownStep[]) =>
    async (error: unknown): Promise<never> => {
      await runInOrder(
        [endListings, ...steps, () => browsers.close(), closeDb, releaseObservability],
        'conciv: disposing after a failed start failed',
      ).catch((failure: unknown) => earlyLog(Effect.logError('[core] cleanup after a failed start failed', {failure})))
      throw error
    }
  const db = await inSpan(tracer, 'Engine.openDatabase', {}, () =>
    Effect.runPromise(openDb(opts.cfg.stateRoot).pipe(Scope.provide(dbScope))),
  ).catch(failedStart([]))
  const planeRef: {current: ChatPlane | null} = {current: null}

  const systemPromptText = opts.systemPromptText ?? opts.cfg.systemPrompt

  const pagePlugin = makePagePlugin(() => pluginHost)
  const settings = createSettingsStorage(settingsOnDisk({global: appEnv.home, project: stateDir}), earlyLog)
  const primitives = makeSessionPrimitives()
  const {stream} = primitives
  const rows: RowScope = {
    db,
    harnessKind: harness.id,
    cwd: opts.cwd,
    publishCreated: (born) => pluginHost.runPromise(publishCreated(born)),
  }
  const harnessFor = async (sessionId: SessionId): Promise<HarnessAdapter> => {
    const kind = (await currentRow(db, sessionId))?.harnessKind
    return harnesses.find((adapter) => adapter.id === kind) ?? harness
  }
  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => nativeIdFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureRow(rows, sessionId)
      await recordNativeId(db, sessionId, (await harnessFor(sessionId)).id, token)
    },
    model: async (sessionId) => readModel(db, sessionId),
  }
  const serverHarness = async (sessionId: SessionId): Promise<ServerHarness> =>
    makeServerHarness(await harnessFor(sessionId), opts.cwd)

  const idleFailed = async (sessionId: SessionId, runId: string, error: unknown): Promise<void> => {
    log(Effect.logError('[core] the experimental.idle hook failed', {sessionId, runId, error}))
    const message = error instanceof Error ? error.message : String(error)
    await plane.recordRunError(sessionId, runId, message).catch((recordError: unknown) =>
      log(
        Effect.logError('[core] recording the experimental.idle failure failed', {
          sessionId,
          runId,
          error: recordError,
        }),
      ),
    )
    stream.publish(sessionId, idleFailedEvent.create({runId}))
  }
  const onRunStart = async (sessionId: SessionId): Promise<void> => {
    await pluginHost
      .runPromise(publishRunStart(sessionId))
      .catch((error: unknown) =>
        log(Effect.logError('[core] publishing the start of a run failed', {sessionId, error})),
      )
  }
  const onRunEnd = async (sessionId: SessionId, run: RunLifecycle): Promise<void> => {
    await pluginHost
      .runPromise(
        publishRunEnd(sessionId, run, planeRef.current === null || engineLife.signal.aborted ? 'shutdown' : 'user'),
      )
      .catch((error: unknown) =>
        log(Effect.logError('[core] publishing how the run ended failed', {sessionId, runId: run.runId, error})),
      )
    if (run.phase === 'completed' && !(await owedFollowUp(sessionId))) await idleOrWake(sessionId, run.runId)
    if (run.phase === 'aborted') {
      if (engineLife.signal.aborted) return
      await holdForNextReply(pagePlugin.delivery, sessionId).catch((error: unknown) =>
        log(Effect.logError('[core] the page queue results could not wait for the next reply', {sessionId, error})),
      )
      return
    }
    followUpOwedQueues(sessionId)
  }
  const runIdle = async (sessionId: SessionId, runId: string): Promise<void> => {
    const idled = await pluginHost
      .runPromiseExit(
        FiberMap.run(
          idleTriggers,
          sessionId,
          PluginHooks.Service.use((hooks) =>
            hooks.trigger('session', 'experimental.idle', {
              sessionId: SessionSchema.Id.make(sessionId),
              background: [],
            }),
          ),
          {onlyIfMissing: true},
        ).pipe(Effect.flatMap(Fiber.join)),
      )
      .catch((error: unknown) => Exit.die(error))
    if (Exit.isFailure(idled) && !Cause.hasInterruptsOnly(idled.cause))
      await idleFailed(sessionId, runId, Cause.squash(idled.cause))
  }
  const idleOrWake = async (sessionId: SessionId, runId: string): Promise<void> => {
    if (!(await inboxWaiting(sessionId))) await runIdle(sessionId, runId)
    if (await inboxWaiting(sessionId)) wakeAfterRun(sessionId)
  }
  const inboxWaiting = (sessionId: SessionId): Promise<boolean> =>
    pluginHost
      .runPromise(Database.Service.use((database) => SessionInbox.has(database.db, sessionId, 'input')))
      .catch((error: unknown) => {
        log(Effect.logError('[core] the session inbox could not be read', {sessionId, error}))
        return false
      })
  const wakeAfterRun = (sessionId: SessionId): void => {
    const current = planeRef.current
    if (current === null) return
    void current
      .settled(sessionId)
      .then(() => current.wake(sessionId))
      .catch((error: unknown) => log(Effect.logError('[core] the session inbox could not wake', {sessionId, error})))
  }
  const owedFollowUp = (sessionId: SessionId): Promise<boolean> =>
    owesFollowUp(pagePlugin.delivery, sessionId).catch((error: unknown) => {
      log(Effect.logError('[core] the page queue results owed could not be read', {sessionId, error}))
      return false
    })
  const sessionModel = (sessionId: SessionId): Promise<string | null> => readModel(db, sessionId)
  const makeToolCtx = (sessionId: SessionId): ConcivToolContext => ({
    askUi: () => runtime.forSession(sessionId).asks.ui(),
  })

  const startPlugins = (): PluginRuntime => {
    assertUniqueCapabilityNames([['a conciv assist tool', concivSandboxToolNames()]])
    return makePluginRuntime({
      db,
      cwd: opts.cwd,
      home: appEnv.home,
      configProvider,
      clock: opts.clock,
      observability: observability.context,
      engineId,
      config: opts.cfg,
      plugins: opts.plugins ?? [],
      post: [
        {
          ...concivPage,
          effect: (context) =>
            concivPage.effect({
              ...context,
              options: pickBy(
                {
                  pageReplyTimeoutMs: opts.pageReplyTimeoutMs,
                  queuedActionTimeoutMs: opts.queuedActionTimeoutMs,
                },
                isNotNil,
              ),
            }),
        },
      ],
      harness,
      signal: engineLife.signal,
      bundler: opts.bridge,
      openInEditor: opts.openInEditor,
      sessions: () => ({chat: chatDeps, runtime, search, pluginHost}),
    })
  }
  const plugins = await Promise.try(startPlugins).catch(failedStart([settings.close]))
  const pluginHost: PluginHost = plugins.runtime
  const log = logOnRuntime(pluginHost)
  const logMessage = (message: string): void => log(Effect.logError(message))
  const startFailed = (steps: ShutdownStep[]) =>
    failedStart([
      plugins.closeRpc,
      plugins.closePlugins,
      plugins.closePermissions,
      ...steps,
      () => pluginHost.dispose(),
      settings.close,
    ])
  await inSpan(tracer, 'Engine.buildPluginHost', {}, () => pluginHost.context()).catch(startFailed([]))
  const idleScope = await pluginHost.runPromise(Scope.fork(pluginHost.scope, 'sequential')).catch(startFailed([]))
  const idleTriggers = await pluginHost
    .runPromise(FiberMap.make<SessionId>().pipe(Scope.provide(idleScope)))
    .catch(startFailed([]))
  const interruptIdle = (sessionId: SessionId, stopped: boolean): Promise<boolean> =>
    pluginHost.runPromise(
      FiberMap.has(idleTriggers, sessionId).pipe(
        Effect.tap((running) => (running ? FiberMap.remove(idleTriggers, sessionId) : Effect.void)),
        Effect.tap((running) =>
          running || stopped
            ? FiberMap.run(
                idleTriggers,
                sessionId,
                Effect.promise(() => plane.settled(sessionId)),
              )
            : Effect.void,
        ),
      ),
    )
  const publishCard = (sessionId: SessionId, chunk: ChatEvent): void => stream.publish(sessionId, chunk)
  const reportToolCollision = memoize((name: string) =>
    log(Effect.logError('[core] a plugin tool is left out: a built-in capability already has that name', {name})),
  )
  const withPluginTools = async (sessionId: SessionId, capabilities: CodeCapability[]): Promise<CodeCapability[]> =>
    toolDomainCapabilities(
      capabilities,
      await pluginHost.runPromise(currentToolDomain(sessionId)),
      currentToolDomain(sessionId),
      (effect, signal) => pluginHost.runPromiseExit(settlingAsks(sessionId, effect, publishCard), {signal}),
      reportToolCollision,
    )

  const offeredCapabilities = (sessionId: SessionId): CodeCapability[] =>
    assistCapabilities(concivSandboxTools(makeToolCtx(sessionId)))
  const codeModeCapabilities = (sessionId: SessionId): Promise<CodeCapability[]> =>
    withPluginTools(sessionId, offeredCapabilities(sessionId))
  const sessionTools = async (sessionId: SessionId): Promise<ChatTool[]> => {
    const offered = offeredCapabilities(sessionId)
    const given = await withPluginTools(sessionId, offered)
    return differenceBy(given, offered, (capability) => capability.name).map(({name, description}) => ({
      name,
      description,
    }))
  }
  const sessionToolNames = async (sessionId: SessionId): Promise<ReadonlySet<string>> =>
    new Set([...(await sessionTools(sessionId)).map((tool) => tool.name), ...concivSandboxToolNames()])

  const hub = appEnv.hub
  const driver = await inSpan(tracer, 'Engine.loadIsolateDriver', {}, async () => loadIsolateDriver(logMessage))
  const askPermission = async (
    sessionId: SessionId,
    ask: HarnessPermissionAsk,
    signal: AbortSignal,
  ): Promise<HarnessPermissionVerdict> => {
    const asked = await pluginHost.runPromiseExit(askForHarness(sessionId, ask, publishCard), {signal})
    if (Exit.isSuccess(asked)) return asked.value
    if (!Cause.hasInterruptsOnly(asked.cause))
      log(Effect.logError('[core] the permission ask failed', {sessionId, error: Cause.squash(asked.cause)}))
    return {allowed: false, message: 'The ask ended before the user answered it.'}
  }
  const plane = await inSpan(tracer, 'Engine.createChatPlane', {}, () =>
    createChatPlane({
      cwd: opts.cwd,
      harnessFor,
      harnessEnv: opts.harnessEnv ?? (() => appEnv.env),
      systemPrompt: {
        systemPromptFile: opts.systemPromptFile,
        systemPromptText,
      },
      db,
      sessions: sessionPort(db, rows, {
        onRunStart,
        onRunEnd,
        publish: (sessionId, chunk) => stream.publish(sessionId, chunk),
      }),
      toolNames: sessionToolNames,
      capabilities: codeModeCapabilities,
      attachmentExpanders: grabExpander,
      prompt: plugins.prompt,
      promptHooked: plugins.promptHooked,
      context: plugins.context,
      pluginInstructions: (sessionId, reset, inventory) =>
        pluginHost.runPromise(pluginInstructions(sessionId, reset, inventory)),
      firstOutputTimeoutMs: opts.firstChunkTimeoutMs,
      firstStartTimeoutMs: opts.firstStartTimeoutMs,
      uiCallWaitMs: opts.uiCallWaitMs,
      uiAnswerWaitMs: opts.uiAnswerWaitMs,
      groupExitTimeoutMs: opts.stopGraceMs,
      log: logMessage,
      driver,
      askPermission,
      pendingPermissions: (sessionId) => pluginHost.runPromise(pendingPermissionCards(sessionId)),
      tracer,
      inbox: {
        promote: (sessionId) =>
          pluginHost.runPromise(
            Effect.gen(function* () {
              const database = yield* Database.Service
              const bus = yield* Bus.Service
              return yield* SessionInbox.promote(database.db, bus, sessionId, 'input')
            }),
          ),
      },
    }),
  ).catch(startFailed([]))
  planeRef.current = plane
  await pluginHost
    .runPromise(followPermissionCards({publish: publishCard}))
    .catch(startFailed([() => plane.endAllRuns()]))
  const chatDeps: ChatContext = {
    defaultHarness: harness,
    harnesses,
    harnessFor,
    cwd: opts.cwd,
    agentToken,
    db,
    rows,
    plane,
    signal: engineLife.signal,
    log,
    tracer,
  }

  const runtime = makeCoreRuntime({
    primitives,
    plane,
    model: sessionModel,
    staleness,
    interruptIdle,
    symbolicate: pagePlugin.symbolicateOrNone,
    log,
  })

  function followUpOwedQueues(sessionId: SessionId): void {
    if (planeRef.current === null) return
    void startQueueFollowUp(pagePlugin.delivery, planeRef.current, sessionId, (id) => isDeletedRow(db, id), log).catch(
      (error: unknown) =>
        log(Effect.logError('[core] the page queue follow-up turn could not start', {sessionId, error})),
    )
  }

  const publishFinished = async (finished: QueueFinished): Promise<void> => {
    const {result, sessionId} = finished
    if (await isDeletedRow(db, sessionId)) return
    const scope = runtime.forSession(sessionId)
    const chunks = pageQueueChunks({result, record: finished, live: plane.driving(sessionId)})
    chunks.forEach((chunk) => scope.stream.publish(chunk))
    void scope.run
      .record(chunks)
      .catch((error: unknown) =>
        log(Effect.logError('[core] recording a queue failed', {sessionId, queueId: result.queueId, error})),
      )
    if (!pagePlugin.fromHub(sessionId, finished.toolCallId)) followUpOwedQueues(sessionId)
  }
  await pagePlugin.followFinished((finished) => {
    publishFinished(finished).catch((error: unknown) =>
      log(
        Effect.logError('[core] publishing a finished queue failed', {
          sessionId: finished.sessionId,
          queueId: finished.result.queueId,
          error,
        }),
      ),
    )
  })

  const admitOutside = async (
    scope: SessionScope,
    client: string | null,
    signal: AbortSignal,
  ): Promise<string | null> => {
    const row = await currentRow(db, scope.id)
    const deleted = (row?.deletedAt ?? null) !== null
    if (opts.cfg.hubAccess === 'open' && !deleted) return null
    if (row === null || deleted) return `session "${scope.id}" does not exist`
    const exit = await pluginHost.runPromiseExit(
      settlingAsks(scope.id, assertOutsideAgent(scope.id, client ?? UNNAMED_CLIENT), publishCard),
      {signal},
    )
    return readOutsideRefusal(exit, client)
  }

  const search = createSessionSearch({db, cwd: chatDeps.cwd, harnesses: chatDeps.harnesses, log, tracer})
  const mcp: McpVars['mcp'] = {
    codeRunner: (sessionId, publish, capabilities) => plane.codeRunner(sessionId, publish, capabilities),
    hubCall: pagePlugin.hubCall,
    hubReplied: pagePlugin.hubReplied,
    finishedQueues: pagePlugin.undelivered,
    startedQueues: pagePlugin.startedBy,
    driving: (sessionId) => plane.driving(sessionId),
    outsideCapabilities: async (sessionId) =>
      outsideRunCapabilities(await withPluginTools(sessionId, offeredCapabilities(sessionId))),
    resolveSession: async (header, nativeId) => runtime.forSession(await mcpSessionId(rows, header, nativeId)),
    admitOutside,
    hubRefusal: hub.refusal,
    staleness,
    log,
  }
  const ptys = createPersistentPtys({
    harness: serverHarness,
    sessions: serverSessions,
    cwd: opts.cwd,
    stateDir,
    env: appEnv.env,
    mcpUrl: () => {
      const origin = opts.boundOrigin?.()
      return origin === undefined ? null : engineMcpUrl(origin, agentToken)
    },
  })
  const rpcDeps: RpcDeps = {
    ptys,
    code: mcp,
    tabs: createTabs({
      attachedSessions: pagePlugin.attachedSessions,
      pageTabs: pagePlugin.tabs,
      session: (sessionId) => rpcSessionMeta(chatDeps, sessionId),
      root: opts.cwd,
      instructions: systemPromptText,
      log,
    }),
    queues: pagePlugin,
    queueWait: pagePlugin.queueWait,
    pluginHost,
    eventHeartbeatIntervalMs: opts.eventHeartbeatIntervalMs,
    chat: chatDeps,
    search,
    settings,
    tools: sessionTools,
    runtime,
    allowedOrigins: new Set(opts.allowedOrigins),
    staleness,
    admitOutside,
    hub,
    assist: (sessionId) => concivSandboxTools(makeToolCtx(sessionId)),
    answerPermission: (sessionId, requestId, reply) =>
      pluginHost.runPromise(answerPermission(sessionId, requestId, reply)),
    auth: makeAuthRouter({
      codes: makeCodeStore({now: Date.now, log}),
      trust,
      browsers,
      now: Date.now,
    }),
  }
  const rpc = makeRpcRouter(rpcDeps)
  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      harnessId: harness.id,
      mcp,
    },
    rpc,
    {
      engineId,
      staleness,
      version: opts.app?.version,
      onShutdown: opts.onShutdown,
      trust,
      log,
      tracer,
    },
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  const disposeStep =
    (name: string, step: () => unknown): ShutdownStep =>
    () =>
      inSpan(tracer, `Engine.dispose.${name}`, {}, async () => step())
  const dispose = (): Promise<void> =>
    inSpan(tracer, 'Engine.dispose', {}, () =>
      runInOrder(
        [
          disposeStep('endListings', endListings),
          disposeStep('closeRpc', plugins.closeRpc),
          disposeStep('closePlugins', plugins.closePlugins),
          disposeStep('closeIdleTriggers', () => pluginHost.runPromise(Scope.close(idleScope, Exit.void))),
          disposeStep('closePermissions', plugins.closePermissions),
          disposeStep('endAllRuns', () => plane.endAllRuns()),
          disposeStep('shutdownPtys', ptys.shutdown),
          disposeStep('disposeSearch', search.dispose),
          disposeStep('closeSettings', settings.close),
          disposeStep('closeBrowsers', () => browsers.close()),
          disposeStep('disposePluginHost', () => pluginHost.dispose()),
          disposeStep('closeDatabase', closeDb),
        ],
        'conciv: disposing the engine failed',
      ),
    ).finally(releaseObservability)

  const fetch = makeEngineGate<unknown>({
    fetch: (request, env) => app.fetch(request, env),
    trusts: trust.trusts,
    allowedOrigins: opts.allowedOrigins ?? [],
    version: opts.app?.version,
    onTrusted: opts.onTrusted,
  })

  await inSpan(tracer, 'Engine.ensureConfiguredRows', {}, () => ensureConfiguredRows(rows, opts.cfg, log))
    .then(() => inSpan(tracer, 'Engine.supervisePlugins', {}, plugins.supervise))
    .then(() =>
      pluginHost.runPromise(
        Effect.logInfo('conciv: the engine started').pipe(
          Effect.annotateLogs({engineId, harness: harness.id, cwd: opts.cwd}),
        ),
      ),
    )
    .catch(async (error: unknown) => {
      await dispose().catch((failure: unknown) =>
        earlyLog(Effect.logError('[core] disposing after a failed start also failed', {failure})),
      )
      throw error
    })

  return carryEngineRouter(
    {
      app,
      fetch,
      agentToken,
      trustBrowser: browsers.grant,
      chat: chatDeps,
      plane,
      dispose,
      runtime,
      pluginHost,
      awaitActivation: plugins.awaitActivation,
    },
    rpc,
  )
}

async function ensureConfiguredRows(rows: RowScope, cfg: ResolvedConcivConfig, log: Log): Promise<void> {
  await sweepEmptyRows(rows.db).catch((error: unknown) =>
    log(Effect.logError('[core] the empty session row sweep failed', {error})),
  )
  const {sessionId, harnessSessionId} = cfg
  if (harnessSessionId !== undefined) {
    await ensureAgentRow(rows, harnessSessionId).catch((error: unknown) => {
      throw new Error(`conciv: the configured harness session "${harnessSessionId}" could not be ensured`, {
        cause: error,
      })
    })
  }
  if (sessionId !== undefined) {
    await ensureRow(rows, sessionId).catch((error: unknown) => {
      throw new Error(`conciv: the configured conciv session "${sessionId}" could not be ensured`, {cause: error})
    })
  }
}

const UNNAMED_CLIENT = 'unnamed'

const isDeclined = Schema.is(Permission.DeclinedError)

function refusedByUser(cause: Cause.Cause<unknown>): boolean {
  return Cause.hasInterrupts(cause) || Option.isSome(Cause.findErrorOption(cause)) || isDeclined(Cause.squash(cause))
}

function readOutsideRefusal(exit: Exit.Exit<void, unknown>, client: string | null): string | null {
  if (Exit.isSuccess(exit)) return null
  if (!refusedByUser(exit.cause)) throw Cause.squash(exit.cause)
  return `The user denied ${client ?? 'an outside agent'} access to this session; do not retry unless they ask you to.`
}
