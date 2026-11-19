import {randomUUID} from 'node:crypto'
import {accessSync, constants, existsSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {Hono} from 'hono'
import {z} from 'zod'
import {EngineStalenessSchema, type EngineStaleness} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/harness'
import {concivStateDir} from '@conciv/protocol/state-types'
import {idleFailedEvent, type RunLifecycle} from '@conciv/protocol/chat-event-types'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {ServerHarness, ServerSessions} from '@conciv/protocol/harness-types'
import {assertToolName} from '@conciv/protocol/tool-call-types'
import type {ResolvedConcivConfig} from './config.js'
import {listHarnesses, transcriptPathWithin} from '@conciv/harness'
import {requireHarness} from './lib/require-harness.js'
import {withSavedModels, type SavedModelsHarness} from './lib/saved-models.js'
import {createSessionSearch} from './sessions/session-search.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivSandboxTools, concivSandboxToolNames, type ConcivToolContext} from '@conciv/tools'
import {
  OUTSIDE_SESSION_TARGET,
  type ChatTool,
  type HarnessSessionId,
  type SessionId,
  type SessionRecord,
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
import {Cause, Effect, Exit, Fiber, FiberMap, Scope} from 'effect'
import {Bus, PluginHooks, SessionEvent, SessionSchema} from '@conciv/plugin-host'
import type {Plugin} from '@conciv/plugin'
import type {ChatContext, PluginHost, RpcDeps} from './api/rpc/mount.js'
import {concivHome, readModel, openDb, sessions, type ConcivDb} from '@conciv/db'
import {createSettingsStorage, settingsOnDisk} from './settings/settings-storage.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import mcpApp, {type McpVars} from './api/mcp.js'
import {createHubInstaller} from './api/rpc/hub.js'
import {createTabs} from './api/tabs.js'
import {outsideRefusal} from './api/outside-refusal.js'
import {outsideRunCapabilities} from './api/outside-run.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makeSessionPrimitives} from './runtime/primitives.js'
import {makePagePlugin, type QueueFinished} from './page/page-plugin.js'
import {holdForNextReply, owesFollowUp, pageQueueChunks, startQueueFollowUp} from './page/page-queue.js'
import {makeCoreRuntime} from './runtime/core-runtime.js'
import {createPersistentPtys, type PersistentPtys} from './pty/persistent-ptys.js'
import concivPage from '@conciv/plugin-page'
import {
  answerPermission,
  followPermissionCards,
  pluginInstructions,
  currentToolDomain,
} from './runtime/permission-cards.js'
import {makePluginRuntime, type PluginRuntime} from './runtime/plugin-runtime.js'
import type {CoreRuntime, SessionScope} from './runtime/scope-types.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {rpcSessionMeta} from './api/rpc/sessions.js'
import {RPC_PREFIX, rpcFetchMiddleware, rpcWebsocketRoute, type UpgradeWebSocket} from '@conciv/serve/rpc'
import {grabExpander} from './page/grab-expander.js'
import {logError} from './lib/debug.js'
import {GROUP_EXIT_TIMEOUT_MS, loadIsolateDriver} from '@conciv/ai/server'
import {runInOrder, type ShutdownStep} from './lib/shutdown.js'
import {engineStaleness} from './lib/engine-stamp.js'
import {
  agentPath,
  makeAuthRouter,
  makeCodeStore,
  makeConnectionTrust,
  makeEngineGate,
  rpcSocketGate,
  trustingUpgrade,
  watchTrustedBrowsers,
  type ConnectionTrust,
  type GatedFetch,
  type TrustedBrowsers,
} from './engine-login.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedConcivConfig
  cwd: string
  agentToken?: string
  engineId?: string
  print?: (text: string) => void
  onTrusted?: () => void
  bridge?: Bundler.BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string

  systemPromptText?: string

  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  harnesses?: readonly HarnessAdapter[]

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  eventHeartbeatIntervalMs?: number

  pageReplyTimeoutMs?: number

  queuedActionTimeoutMs?: number
  permissionSyncTimeoutMs?: number

  nativePageDir?: string

  tokenScopedBase?: () => string | undefined

  plugins?: readonly Plugin.Plugin[]

  staleness?: () => EngineStaleness

  home?: string
}

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function onPath(bin: string): boolean {
  const directories = (process.env.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0)
  return directories.some((directory) => executable(join(directory, bin)))
}

function detectedHarnesses(): HarnessAdapter[] {
  return listHarnesses().filter((adapter) => onPath(adapter.binName))
}

function availableHarnesses(
  boot: SavedModelsHarness,
  opts: MakeAppOpts,
  stateDir: string,
  signal: AbortSignal,
): SavedModelsHarness[] {
  const others = (opts.harnesses ?? (opts.harness ? [] : detectedHarnesses())).map((adapter) =>
    withSavedModels(adapter, stateDir, signal),
  )
  return [boot, ...others.filter((other) => other.harness.id !== boot.harness.id)]
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

const OUTSIDE_DECISION_WAIT_MS = 50_000

const HealthSchema = z.object({
  ok: z.literal(true),
  harness: z.string(),
  engine: EngineStalenessSchema.pick({stale: true}),
  id: z.string(),
})

export type CoreVars = CorsVars & {harnessId: string} & McpVars

function composeRoutes(
  vars: CoreVars,
  rpc: ReturnType<typeof makeRpcRouter>,
  deps: {
    engineId: string
    staleness: () => EngineStaleness
    onShutdown?: () => void
    plane: ChatPlane
    upgrade: UpgradeWebSocket
    trust: ConnectionTrust
    ptys: PersistentPtys
  },
) {
  return new Hono<{Variables: CoreVars}>()
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({message: error.message}, error.status)
      logError(`[core] unhandled route error: ${String(error)}`)
      return c.json({message: 'internal error'}, 500)
    })
    .use(async (c, next) => {
      c.set('cors', vars.cors)
      c.set('harnessId', vars.harnessId)
      c.set('mcp', vars.mcp)
      await next()
    })
    .use(corsMiddleware())
    .get('/health', (c) =>
      c.json(HealthSchema.parse({ok: true, harness: vars.harnessId, engine: deps.staleness(), id: deps.engineId})),
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
        onError: logError,
        gate: (c) => rpcSocketGate(deps.trust, c.req.header('authorization')),
      }),
    )
    .use(`${RPC_PREFIX}/*`, rpcFetchMiddleware(rpc))
    .route('/api/mcp', mcpApp)
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
}

function makeServerHarness(harness: HarnessAdapter, cwd: string): ServerHarness {
  const history = harness.history
  const transcriptExists = (token: HarnessSessionId): boolean => {
    if (history === undefined) return false
    const path = transcriptPathWithin(history, cwd, token)
    return path !== null && existsSync(path)
  }
  return {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: history?.transcriptPath ? transcriptExists : undefined,
    transcriptMessages: history ? (token) => history.messages(cwd, token) : undefined,
  }
}

function publishCreated(born: SessionRecord) {
  const sessionID = SessionSchema.Id.make(born.id)
  return Bus.Service.use((bus) =>
    bus.publish(SessionEvent.Created, born.title === null ? {sessionID} : {sessionID, title: born.title}),
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
  const stateDir = concivStateDir(opts.cfg.stateRoot)
  const engineLife = new AbortController()
  const boot = withSavedModels(opts.harness ?? requireHarness(opts.cfg.harness), stateDir, engineLife.signal)
  const harness = boot.harness
  const agentToken = opts.agentToken ?? randomUUID()
  const basePath = agentPath(agentToken)
  const browsers = watchTrustedBrowsers(stateDir)
  const trust = makeConnectionTrust(agentToken, browsers)
  const socketUpgrade = trustingUpgrade(upgradeWebSocket, trust)
  const listings = availableHarnesses(boot, opts, stateDir, engineLife.signal)
  const harnesses = listings.map((listing) => listing.harness)
  const print = opts.print ?? ((text: string) => console.log(text))
  const endListing = async (listing: SavedModelsHarness): Promise<void> => {
    const ended = listing.settled().then(() => true)
    if (await Promise.race([ended, delay(GROUP_EXIT_TIMEOUT_MS, false, {ref: false})])) return
    print(`[core] the ${listing.harness.id} model listing did not end when the engine stopped; closing without it`)
  }
  const endListings = async (): Promise<void> => {
    engineLife.abort(new Error('conciv: the engine stopped'))
    await Promise.all(listings.map(endListing))
  }
  const staleness = opts.staleness ?? engineStaleness
  const dbScope = Effect.runSync(Scope.make())
  const closeDb = () => Effect.runPromise(Scope.close(dbScope, Exit.void))
  const failedStart =
    (steps: ShutdownStep[]) =>
    async (error: unknown): Promise<never> => {
      await runInOrder(
        [endListings, ...steps, () => browsers.close(), closeDb],
        'conciv: disposing after a failed start failed',
      ).catch((failure: unknown) => logError(`[core] ${String(failure)}`))
      throw error
    }
  const db = await Effect.runPromise(openDb(opts.cfg.stateRoot).pipe(Scope.provide(dbScope))).catch(failedStart([]))
  const planeRef: {current: ChatPlane | null} = {current: null}

  const runStartListeners: ((sessionId: SessionId) => void)[] = []
  const systemPromptText = opts.systemPromptText ?? opts.cfg.systemPrompt

  const pagePlugin = makePagePlugin(() => pluginHost)
  const settings = createSettingsStorage(
    settingsOnDisk({global: concivHome({homeDir: opts.home, env: process.env}), project: stateDir}),
  )
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
    chatBusy: async (sessionId) => (await planeRef.current?.live(sessionId)) === true,
    model: async (sessionId) => readModel(db, sessionId),
    onChatTurn: (listener) => runStartListeners.push(listener),
  }
  const serverHarness = async (sessionId: SessionId): Promise<ServerHarness> =>
    makeServerHarness(await harnessFor(sessionId), opts.cwd)

  const idleFailed = async (sessionId: SessionId, runId: string, error: unknown): Promise<void> => {
    logError(`[core] the experimental.idle hook failed: ${String(error)}`)
    const message = error instanceof Error ? error.message : String(error)
    await plane
      .recordRunError(sessionId, runId, message)
      .catch((recordError: unknown) =>
        logError(`[core] recording the experimental.idle failure of run ${runId} failed: ${String(recordError)}`),
      )
    stream.publish(sessionId, idleFailedEvent.create({runId}))
  }
  const onRunEnd = async (sessionId: SessionId, run: RunLifecycle): Promise<void> => {
    await pluginHost
      .runPromise(
        publishRunEnd(sessionId, run, planeRef.current === null || engineLife.signal.aborted ? 'shutdown' : 'user'),
      )
      .catch((error: unknown) => logError(`[core] publishing how run ${run.runId} ended failed: ${String(error)}`))
    if (run.phase === 'completed' && !(await owedFollowUp(sessionId))) {
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
        await idleFailed(sessionId, run.runId, Cause.squash(idled.cause))
    }
    if (run.phase === 'aborted') {
      await holdForNextReply(pagePlugin.delivery, sessionId).catch((error: unknown) =>
        logError(`[core] the page queue results of ${sessionId} could not wait for the next reply: ${String(error)}`),
      )
      return
    }
    followUpOwedQueues(sessionId)
  }
  const owedFollowUp = (sessionId: SessionId): Promise<boolean> =>
    owesFollowUp(pagePlugin.delivery, sessionId).catch((error: unknown) => {
      logError(`[core] the page queue results owed to ${sessionId} could not be read: ${String(error)}`)
      return false
    })
  const sessionModel = (sessionId: SessionId): Promise<string | null> => readModel(db, sessionId)
  const makeToolCtx = (sessionId: SessionId): ConcivToolContext => ({
    askUi: () => runtime.forSession(sessionId).asks.ui(),
  })

  const engineId = opts.engineId ?? randomUUID()
  const startPlugins = (): PluginRuntime => {
    assertUniqueCapabilityNames([['a conciv assist tool', concivSandboxToolNames()]])
    return makePluginRuntime({
      db,
      cwd: opts.cwd,
      home: concivHome({homeDir: opts.home, env: process.env}),
      fallbackRoots: join(stateDir, 'plugin-host'),
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
                  permissionSyncTimeoutMs: opts.permissionSyncTimeoutMs,
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
      sessions: () => ({chat: chatDeps, runtime, search, pluginHost, queues: pagePlugin}),
    })
  }
  const plugins = await Promise.try(startPlugins).catch(failedStart([settings.close]))
  const pluginHost: PluginHost = plugins.runtime
  const startFailed = (steps: ShutdownStep[]) =>
    failedStart([
      plugins.closeRpc,
      plugins.closePlugins,
      plugins.closePermissions,
      ...steps,
      () => pluginHost.dispose(),
      settings.close,
    ])
  await pluginHost.context().catch(startFailed([]))
  const idleScope = Effect.runSync(Scope.make())
  const idleTriggers = Effect.runSync(FiberMap.make<SessionId>().pipe(Scope.provide(idleScope)))
  const interruptIdle = (sessionId: SessionId, stopped: boolean): Promise<boolean> =>
    Effect.runPromise(
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
  const reportToolCollision = memoize((name: string) =>
    logError(`[core] the plugin tool "${name}" is left out: a built-in capability already has that name`),
  )
  const withPluginTools = async (sessionId: SessionId, capabilities: CodeCapability[]): Promise<CodeCapability[]> =>
    toolDomainCapabilities(
      capabilities,
      await pluginHost.runPromise(currentToolDomain(sessionId)),
      currentToolDomain(sessionId),
      (effect, signal) => pluginHost.runPromiseExit(effect, {signal}),
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

  const hub = createHubInstaller(opts.home)
  const driver = loadIsolateDriver(logError)
  const plane = await createChatPlane({
    cwd: opts.cwd,
    hubAccess: opts.cfg.hubAccess,
    hubGeneration: hub.generation,
    harnessFor,
    harnessEnv: opts.harnessEnv,
    systemPrompt: {
      systemPromptFile: opts.systemPromptFile,
      systemPromptText,
    },
    db,
    sessions: sessionPort(db, rows, {
      onRunStart: async (sessionId) => {
        runStartListeners.forEach((listener) => listener(sessionId))
      },
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
    log: logError,
    driver,
  }).catch(startFailed([]))
  planeRef.current = plane
  await pluginHost
    .runPromise(
      followPermissionCards({plane, publish: (sessionId, chunk) => stream.publish(sessionId, chunk), log: logError}),
    )
    .catch(startFailed([() => plane.endAllRuns()]))
  const chatDeps: ChatContext = {
    defaultHarness: harness,
    harnesses,
    harnessFor,
    cwd: opts.cwd,
    basePath,
    db,
    rows,
    plane,
    signal: engineLife.signal,
  }

  const runtime = makeCoreRuntime({
    primitives,
    plane,
    db,
    model: sessionModel,
    staleness,
    interruptIdle,
    symbolicate: pagePlugin.symbolicateOrNone,
  })

  function followUpOwedQueues(sessionId: SessionId): void {
    if (planeRef.current === null) return
    void startQueueFollowUp(pagePlugin.delivery, planeRef.current, sessionId, (id) => isDeletedRow(db, id)).catch(
      (error: unknown) =>
        logError(`[core] the page queue follow-up turn for ${sessionId} could not start: ${String(error)}`),
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
      .catch((error: unknown) => logError(`[core] recording queue ${result.queueId} failed: ${String(error)}`))
    if (!pagePlugin.fromHub(sessionId, finished.toolCallId)) followUpOwedQueues(sessionId)
  }
  await pagePlugin.followFinished((finished) => {
    publishFinished(finished).catch((error: unknown) =>
      logError(`[core] publishing the finished queue ${finished.result.queueId} failed: ${String(error)}`),
    )
  })

  const admitOutside = async (
    scope: SessionScope,
    client: string | null,
    signal: AbortSignal,
  ): Promise<string | null> => {
    const deleted = ((await currentRow(db, scope.id))?.deletedAt ?? null) !== null
    if (opts.cfg.hubAccess === 'open' && !deleted) return null
    const refusal = await plane.admitCall(scope.id, {
      toolName: OUTSIDE_SESSION_TARGET,
      input: {client},
      publish: scope.stream.publish,
      title: outsideTitle(client),
      until: AbortSignal.any([signal, AbortSignal.timeout(OUTSIDE_DECISION_WAIT_MS)]),
    })
    if (refusal === null) return null
    return refusal.reason === 'missing'
      ? refusal.message
      : outsideRefusal(pagePlugin.tabs, scope, client, refusal.reason)
  }

  const search = createSessionSearch({db, cwd: chatDeps.cwd, harnesses: chatDeps.harnesses})
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
  }
  const ptys = createPersistentPtys({
    harness: serverHarness,
    sessions: serverSessions,
    cwd: opts.cwd,
    stateDir,
    mcpUrl: () => {
      const base = opts.tokenScopedBase?.()
      return base === undefined ? null : `${base}/api/mcp`
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
    }),
    queues: pagePlugin,
    queueWait: pagePlugin.queueWait,
    pluginHost,
    eventHeartbeatIntervalMs: opts.eventHeartbeatIntervalMs,
    chat: chatDeps,
    search,
    settings,
    tools: sessionTools,
    openFromFrames: (frames) => openSourceFromFrames(frames, pagePlugin.symbolicate, opts.openInEditor),
    runtime,
    allowedOrigins: new Set(opts.allowedOrigins),
    staleness,
    admitOutside,
    hub,
    assist: (sessionId) => concivSandboxTools(makeToolCtx(sessionId)),
    answerPermission: (sessionId, requestId, reply) =>
      pluginHost.runPromise(answerPermission(sessionId, requestId, reply)),
    auth: makeAuthRouter({
      codes: makeCodeStore({now: Date.now, print}),
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
      onShutdown: opts.onShutdown,
      plane,
      upgrade: socketUpgrade,
      trust,
      ptys,
    },
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  const dispose = (): Promise<void> =>
    runInOrder(
      [
        endListings,
        plugins.closeRpc,
        plugins.closePlugins,
        () => Effect.runPromise(Scope.close(idleScope, Exit.void)),
        plugins.closePermissions,
        () => plane.endAllRuns(),
        ptys.shutdown,
        search.dispose,
        settings.close,
        () => browsers.close(),
        () => pluginHost.dispose(),
        closeDb,
      ],
      'conciv: disposing the engine failed',
    )

  const fetch = makeEngineGate<unknown>({
    fetch: (request, env) => app.fetch(request, env),
    trusts: trust.trusts,
    allowedOrigins: opts.allowedOrigins ?? [],
    onTrusted: opts.onTrusted,
  })

  await ensureConfiguredRows(rows, opts.cfg)
    .then(plugins.supervise)
    .catch(async (error: unknown) => {
      await dispose().catch((failure: unknown) =>
        logError(`[core] disposing after a failed start also failed: ${String(failure)}`),
      )
      throw error
    })

  return {
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
  }
}

async function ensureConfiguredRows(rows: RowScope, cfg: ResolvedConcivConfig): Promise<void> {
  await sweepEmptyRows(rows.db).catch((error: unknown) =>
    logError(`[core] the empty session row sweep failed: ${String(error)}`),
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

function outsideTitle(client: string | null): string {
  return `Allow ${client ?? 'an outside agent'} to use this tab`
}
