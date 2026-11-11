import {randomUUID} from 'node:crypto'
import {accessSync, constants, existsSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {Hono} from 'hono'
import {z} from 'zod'
import {EngineStalenessSchema, type EngineStaleness} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/harness'
import {concivStateDir} from '@conciv/protocol/state-types'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {
  type AnyExtension,
  type AnyToolBuilder,
  type AttachmentDocumentPart,
  type ContentPart,
  type ExtensionServerTool,
  type ServerHarness,
  type ServerResult,
  type ServerSessions,
  type ToolRequest,
} from '@conciv/extension'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness, listHarnesses, transcriptPathWithin} from '@conciv/harness'
import {withSavedModels} from './lib/saved-models.js'
import {createSessionSearch} from './sessions/session-search.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivSandboxTools, concivSandboxToolNames, type ConcivToolContext} from '@conciv/tools'
import {OUTSIDE_SESSION_TARGET, type ChatTool, type HarnessSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {
  anonymousExternalRow,
  currentRow,
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
  registryCapabilities,
  type AttachmentExpanders,
  type ChatPlane,
  type CodeCapability,
  type SessionPort,
} from '@conciv/chat'
import {eq} from 'drizzle-orm'
import {pushRoutes, type PushDeps} from './api/push.js'
import {makeHubAdmission, type ChatContext, type RpcDeps} from './api/rpc/mount.js'
import {concivHome, drafts, modelOf, openDb, sessions, writeToolCapture, type ConcivDb} from '@conciv/db'
import {createSettingsStorage, settingsOnDisk} from './settings/settings-storage.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {os} from '@orpc/server'
import mcpApp, {type McpVars} from './api/mcp.js'
import {createHubInstaller} from './api/rpc/hub.js'
import {createTabs} from './api/tabs.js'
import {createOutsideTabs} from './api/outside-tabs.js'
import {outsideRefusal} from './api/outside-refusal.js'
import {outsideRunCapabilities} from './api/outside-run.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makeSessionPrimitives} from './runtime/primitives.js'
import {pageQueueChunks, startQueueFollowUp} from './page/page-queue.js'
import {makeCoreRuntime} from './runtime/core-runtime.js'
import type {CoreRuntime, ScopedToolCall, SessionScope} from './runtime/scope-types.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {symbolicateFrames, type RawFrame as SymbolicableFrame} from './editor/symbolicate.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {rpcSessionMeta} from './api/rpc/sessions.js'
import {
  makeCompositeRpcRouter,
  RPC_PREFIX,
  rpcFetchMiddleware,
  rpcWebsocketRoute,
  type UpgradeWebSocket,
} from '@conciv/extension/rpc-mount'
import type {CompositeRpcRouter} from './api/rpc/mount.js'
import pageServerExtension from '@conciv/extension-page/server'
import {assertToolName} from '@conciv/extension/tool'
import {logError} from './lib/debug.js'
import {runInOrder} from './lib/shutdown.js'
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
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string

  systemPromptText?: string

  extensions?: AnyExtension[]

  extensionConfig?: Record<string, unknown>
  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  harnesses?: readonly HarnessAdapter[]

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  nativePageDir?: string

  nativeUrl?: () => string | undefined

  staleness?: () => EngineStaleness

  home?: string
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function assertUniqueExtensionSlugs(extensions: readonly AnyExtension[]): void {
  const owners = new Map<string, string>()
  for (const extension of extensions) {
    const extensionSlug = slug(extension.name)
    const existing = owners.get(extensionSlug)
    if (existing !== undefined) {
      throw new Error(
        `extension slug collision: "${extensionSlug}" is claimed by both "${existing}" and "${extension.name}"`,
      )
    }
    owners.set(extensionSlug, extension.name)
  }
}

function requireHarness(id: string): HarnessAdapter {
  const found = getHarness(id) ?? getHarness('claude')
  if (!found) throw new Error('no harness registered (built-in claude missing)')
  return found
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

function availableHarnesses(boot: HarnessAdapter, opts: MakeAppOpts, stateDir: string): HarnessAdapter[] {
  const others = (opts.harnesses ?? (opts.harness ? [] : detectedHarnesses())).map((adapter) =>
    withSavedModels(adapter, stateDir),
  )
  return [boot, ...others.filter((adapter) => adapter.id !== boot.id)]
}

function symbolicable(frame: {
  fileName?: string
  line?: number
  column?: number
  fn?: string
}): frame is SymbolicableFrame {
  return typeof frame.fileName === 'string' && typeof frame.line === 'number'
}

function narrowExtensionApp(name: string, app: unknown): Hono | null {
  if (app === undefined) return null
  if (!(app instanceof Hono)) throw new Error(`extension "${name}" returned a non-hono app`)
  return app
}

function buildAttachmentExpanders(
  extension: AnyExtension,
  context: unknown,
): [string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>][] {
  const entries: [string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>][] = []
  for (const attachment of extension.attachments ?? []) {
    const expand = attachment.__expand
    if (!expand) continue
    entries.push([attachment.mime, async (part) => expand(part, context)])
  }
  return entries
}

function toolDescription(tool: AnyToolBuilder): string {
  return [tool.description, tool.promptSnippet, ...(tool.promptGuidelines ?? [])].filter(Boolean).join('\n\n')
}

function declaredToolErrors(tool: AnyToolBuilder): {code: string; message: string}[] {
  return Object.entries(tool.errors ?? {}).map(([code, spec]) => ({code, message: spec.message}))
}

type RegistryToolSource = {extensionName: string; registryTools: readonly AnyToolBuilder[]; context: unknown}

function registerExtensionTools(registry: ToolRegistry, sources: RegistryToolSource[]): void {
  for (const source of sources) {
    for (const tool of source.registryTools) {
      registry.register(tool, {owner: `extension "${source.extensionName}"`, context: source.context})
    }
  }
}

function requiresApproval(subject: {approval?: 'ask'}): boolean {
  return subject.approval === 'ask'
}

async function recordSessionUsage(db: ConcivDb, sessionId: SessionId, usage: UsageSnapshot): Promise<void> {
  await db.update(sessions).set({usage, updatedAt: Date.now()}).where(eq(sessions.id, sessionId))
}

function sessionPort(
  db: ConcivDb,
  rows: RowScope,
  hooks: Pick<SessionPort, 'onRunStart' | 'onRunEnd' | 'publish'>,
): SessionPort {
  return {
    row: (sessionId) => {
      const row = currentRow(db, sessionId)
      return row === null
        ? null
        : {
            model: row.model,
            effort: row.effort,
            nativeId: row.harnessSessionId,
            cwd: row.cwd,
            harnessKind: row.harnessKind,
          }
    },
    ensure: (sessionId) => ensureRow(db, sessionId, rows.harnessKind, rows.cwd),
    recordNativeId: (sessionId, harnessId, nativeId) => recordNativeId(db, sessionId, harnessId, nativeId),
    recordUsage: (sessionId, usage) => recordSessionUsage(db, sessionId, usage),
    recordContextTokens: async (sessionId, contextTokens) => {
      const usage = currentRow(db, sessionId)?.usage
      if (usage) await recordSessionUsage(db, sessionId, {...usage, contextTokens})
    },
    recordActivity: (sessionId, title, at) => recordActivity(db, sessionId, title, at),
    onRunStart: hooks.onRunStart,
    onRunEnd: hooks.onRunEnd,
    publish: hooks.publish,
  }
}

function registryBackedTool(tool: AnyToolBuilder, call: ScopedToolCall): ExtensionServerTool {
  return {
    name: tool.name,
    description: toolDescription(tool),
    inputSchema: tool.inputSchema,
    approval: tool.approval,
    mutating: requiresApproval(tool) || (tool.meta?.mutating ?? false),
    errors: declaredToolErrors(tool),
    execute: (input: unknown, request: ToolRequest) => call(tool.name, input, request),
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
  rpc: CompositeRpcRouter,
  deps: {
    engineId: string
    staleness: () => EngineStaleness
    onShutdown?: () => void
    push: PushDeps
    plane: ChatPlane
    upgrade: UpgradeWebSocket
    trust: ConnectionTrust
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
    .route('/', deps.plane.routes(deps.upgrade))
    .route('/', pushRoutes(deps.push, deps.upgrade))
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
  extensionContexts: Record<string, unknown>
  runtime: CoreRuntime
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

async function mcpSessionId(
  rows: RowScope,
  header: SessionId | null,
  nativeId: HarnessSessionId | null,
): Promise<SessionId> {
  if (header !== null) return header
  if (nativeId !== null) return (await ensureAgentRow(rows, nativeId)).id
  return anonymousExternalRow(rows)
}

export function withBuiltinExtensions(extensions: readonly AnyExtension[] | undefined): AnyExtension[] {
  return [pageServerExtension, ...(extensions ?? [])]
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const extensions = withBuiltinExtensions(opts.extensions)

  assertUniqueExtensionSlugs(extensions)

  const stateDir = concivStateDir(opts.cfg.stateRoot)
  const harness = withSavedModels(opts.harness ?? requireHarness(opts.cfg.harness), stateDir)
  const agentToken = opts.agentToken ?? randomUUID()
  const basePath = agentPath(agentToken)
  const browsers = watchTrustedBrowsers(stateDir)
  const trust = makeConnectionTrust(agentToken, browsers)
  const socketUpgrade = trustingUpgrade(upgradeWebSocket, trust)
  const harnesses = availableHarnesses(harness, opts, stateDir)
  const staleness = opts.staleness ?? engineStaleness
  const db = openDb(opts.cfg.stateRoot)
  const planeRef: {current: ChatPlane | null} = {current: null}

  const runStartListeners: ((sessionId: SessionId) => void)[] = []
  const systemPromptText = opts.systemPromptText ?? opts.cfg.systemPrompt

  const outsideTabs = createOutsideTabs(opts.home)
  const settings = createSettingsStorage(
    settingsOnDisk({global: concivHome({homeDir: opts.home, env: process.env}), project: stateDir}),
  )
  const primitives = makeSessionPrimitives({
    db,
    root: opts.cwd,
    storeCapture: (params) => writeToolCapture(db, params),
    bundler: () => opts.bridge,
    openInEditor: opts.openInEditor,
    listTabs: outsideTabs.list,
  })
  const {registry, stream} = primitives
  const rows = {db, harnessKind: harness.id, cwd: opts.cwd}
  const harnessFor = (sessionId: SessionId): HarnessAdapter => {
    const kind = currentRow(db, sessionId)?.harnessKind
    return harnesses.find((adapter) => adapter.id === kind) ?? harness
  }
  const scopedToolCall: ScopedToolCall = (name, input, request) =>
    runtime
      .forSession(request.sessionId)
      .tools.call(name, input, {toolCallId: request.toolCallId, signal: request.signal, outside: request.outside})

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => nativeIdFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureRow(db, sessionId, harness.id, opts.cwd)
      await recordNativeId(db, sessionId, harnessFor(sessionId).id, token)
    },
    chatBusy: async (sessionId) => (await planeRef.current?.live(sessionId)) === true,
    model: async (sessionId) => modelOf(db, sessionId),
    onChatTurn: (listener) => runStartListeners.push(listener),
  }
  const serverHarness = (sessionId: SessionId): ServerHarness => makeServerHarness(harnessFor(sessionId), opts.cwd)
  const nativeUrl = opts.nativeUrl ?? ((): string | undefined => undefined)

  function assembleMounted(extension: AnyExtension, result: ServerResult<unknown> | undefined) {
    const context = result?.context
    const registryTools = extension.tools ?? []
    return {
      extensionName: extension.name,
      app: narrowExtensionApp(extension.name, result?.app),
      router: result?.router,
      registryTools,
      tools: registryTools
        .filter((tool) => tool.binding === 'server')
        .map((tool) => registryBackedTool(tool, scopedToolCall)),
      attachmentExpanders: buildAttachmentExpanders(extension, context),
      context,
      dispose: result?.dispose,
      turnEnd: result?.turnEnd,
    }
  }

  async function mountExtension(extension: AnyExtension): Promise<ReturnType<typeof assembleMounted> | null> {
    try {
      const result = await extension.__server?.({
        stateDir,
        scope: settings.scope,
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        settings: extension.readSettings(settings.scope<string>(extension.name).settings.project),
        cwd: opts.cwd,
        basePath,
        sessions: serverSessions,
        harness: serverHarness,
        symbolicate: (frames) => symbolicateFrames(frames.filter(symbolicable), opts.cwd),
        bundler: opts.bridge,
        nativeUrl,
        upgradeWebSocket: socketUpgrade,
      })
      return assembleMounted(extension, result)
    } catch (error) {
      logError(`[core] extension "${extension.name}" failed to mount: ${String(error)}`)
      return null
    }
  }

  const mountResults = await Promise.all(extensions.map((extension) => mountExtension(extension)))
  const mounted = mountResults.flatMap((entry) => (entry ? [entry] : []))
  const attachmentExpanders: AttachmentExpanders = {}
  for (const entry of mounted)
    for (const [mime, expand] of entry.attachmentExpanders) attachmentExpanders[mime] ??= expand
  const extensionContexts: Record<string, unknown> = Object.fromEntries(
    mounted.map((entry) => [entry.extensionName, entry.context]),
  )
  const disposers = mounted.flatMap((entry) => (entry.dispose ? [entry.dispose] : []))
  const turnEnds = mounted.flatMap((entry) => (entry.turnEnd ? [entry.turnEnd] : []))
  const onRunEnd = async (sessionId: SessionId): Promise<void> => {
    const settled = await Promise.allSettled(turnEnds.map((hook) => hook(sessionId)))
    settled.forEach((outcome) => {
      if (outcome.status === 'rejected') logError(`[core] turn-end hook failed: ${String(outcome.reason)}`)
    })
    followUpOwedQueues(sessionId)
  }
  const sessionModel = (sessionId: SessionId): string | null => modelOf(db, sessionId)
  const makeToolCtx = (sessionId: SessionId): ConcivToolContext => ({
    askUi: () => runtime.forSession(sessionId).asks.ui(),
  })

  assertUniqueCapabilityNames([
    ['a built-in registry tool', registry.sandboxTools().map((tool) => tool.name)],
    ['a conciv assist tool', concivSandboxToolNames()],
    ...mounted.map((entry): [string, string[]] => [
      `extension "${entry.extensionName}"`,
      entry.tools.map((tool) => tool.name),
    ]),
  ])

  registerExtensionTools(registry, mounted)

  const codeModeCapabilities = (sessionId: SessionId): CodeCapability[] => [
    ...registryCapabilities(
      registry.whenPageConnected(() => primitives.page.bus.connected(sessionId)).sandboxTools(),
      scopedToolCall,
    ),
    ...assistCapabilities(concivSandboxTools(makeToolCtx(sessionId))),
  ]

  const toolList: ChatTool[] = mounted.flatMap((entry) =>
    entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
  )

  const hub = createHubInstaller(opts.home)
  const plane = await createChatPlane({
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
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
        await db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      },
      onRunEnd,
      publish: (sessionId, chunk) => stream.publish(sessionId, chunk),
    }),
    toolNames: new Set([...toolList.map((tool) => tool.name), ...concivSandboxToolNames()]),
    capabilities: codeModeCapabilities,
    attachmentExpanders,
    firstOutputTimeoutMs: opts.firstChunkTimeoutMs,
    log: logError,
  })
  planeRef.current = plane
  const chatDeps: ChatContext = {
    defaultHarness: harness,
    harnesses,
    harnessFor,
    cwd: opts.cwd,
    basePath,
    db,
    plane,
  }

  if (opts.cfg.harnessSessionId !== undefined) {
    void ensureAgentRow(rows, opts.cfg.harnessSessionId).catch((error: unknown) =>
      logError(`[core] the configured harness session row could not be ensured: ${String(error)}`),
    )
  }
  if (opts.cfg.sessionId !== undefined) {
    void ensureRow(db, opts.cfg.sessionId, harness.id, opts.cwd).catch((error: unknown) =>
      logError(`[core] the configured session row could not be ensured: ${String(error)}`),
    )
  }
  void sweepEmptyRows(db).catch((error: unknown) =>
    logError(`[core] the empty session row sweep failed: ${String(error)}`),
  )

  const runtime = makeCoreRuntime({primitives, plane, db, model: sessionModel, staleness})

  function followUpOwedQueues(sessionId: SessionId): void {
    void startQueueFollowUp(primitives.page.queues, plane, sessionId).catch((error: unknown) =>
      logError(`[core] the page queue follow-up turn for ${sessionId} could not start: ${String(error)}`),
    )
  }

  primitives.page.queues.finished((record) => {
    const result = record.result
    if (result === null) return
    const scope = runtime.forSession(record.sessionId)
    const chunks = pageQueueChunks({result, record, live: plane.driving(record.sessionId)})
    chunks.forEach((chunk) => scope.stream.publish(chunk))
    void scope.run
      .record(chunks)
      .catch((error: unknown) => logError(`[core] recording queue ${result.queueId} failed: ${String(error)}`))
    if (!record.outside) followUpOwedQueues(record.sessionId)
  })

  const admitOutside = async (
    scope: SessionScope,
    client: string | null,
    signal: AbortSignal,
  ): Promise<string | null> => {
    if (opts.cfg.hubAccess === 'open') return null
    const refusal = await plane.admitCall(scope.id, {
      toolName: OUTSIDE_SESSION_TARGET,
      input: {client},
      publish: scope.stream.publish,
      title: outsideTitle(client),
      until: AbortSignal.any([signal, AbortSignal.timeout(OUTSIDE_DECISION_WAIT_MS)]),
    })
    if (refusal === null) return null
    return refusal.reason === 'missing' ? refusal.message : outsideRefusal(scope, client, refusal.reason)
  }

  const search = createSessionSearch({db, cwd: chatDeps.cwd, harnesses: chatDeps.harnesses})
  const mcp: McpVars['mcp'] = {
    codeRunner: (sessionId, publish, capabilities, outside) =>
      plane.codeRunner(sessionId, publish, capabilities, outside),
    finishedQueues: (sessionId, outside) => primitives.page.queues.undelivered(sessionId, outside),
    startedQueues: (sessionId, toolCallIds) => primitives.page.queues.startedBy(sessionId, toolCallIds),
    outsideCapabilities: (sessionId) =>
      outsideRunCapabilities([
        ...registryCapabilities(registry.whenPageConnected(() => true).sandboxTools(), scopedToolCall),
        ...assistCapabilities(concivSandboxTools(makeToolCtx(sessionId))),
      ]),
    resolveSession: async (header, nativeId) => runtime.forSession(await mcpSessionId(rows, header, nativeId)),
    admitOutside,
    hubRefusal: hub.refusal,
    staleness,
  }
  const rpcDeps: RpcDeps = {
    code: mcp,
    tabs: createTabs({
      bus: primitives.page.bus,
      session: (sessionId) => rpcSessionMeta(chatDeps, sessionId),
      root: opts.cwd,
      instructions: systemPromptText,
    }),
    queues: primitives.page.queues,
    chat: chatDeps,
    search,
    settings,
    tools: toolList,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    runtime,
    allowedOrigins: new Set(opts.allowedOrigins),
    staleness,
    admitOutside,
    hub,
    assist: (sessionId) => concivSandboxTools(makeToolCtx(sessionId)),
    auth: makeAuthRouter({
      codes: makeCodeStore({now: Date.now, print: opts.print ?? ((text) => console.log(text))}),
      trust,
      browsers,
      now: Date.now,
    }),
  }
  const rpc = makeRpcRouter(rpcDeps)
  const engineId = opts.engineId ?? randomUUID()
  const admittedOs = os.$context<RpcContext>().use(makeHubAdmission(rpcDeps))

  const compositeRpc = makeCompositeRpcRouter(
    rpc,
    mounted.flatMap((entry) =>
      entry.router
        ? [
            {
              slug: slug(entry.extensionName),
              extensionName: entry.extensionName,
              router: admittedOs.router(entry.router),
            },
          ]
        : [],
    ),
  )

  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      harnessId: harness.id,
      mcp,
    },
    compositeRpc,
    {
      engineId,
      staleness,
      onShutdown: opts.onShutdown,
      plane,
      upgrade: socketUpgrade,
      trust,
      push: {
        queries: (sessionId, signal, focus) => runtime.forSession(sessionId).page.queries(signal, focus),
        events: (sessionId, signal) => runtime.forSession(sessionId).stream.events(signal),
      },
    },
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
  })

  const dispose = (): Promise<void> =>
    runInOrder(
      [
        () => plane.endAllRuns(),
        ...disposers,
        search.dispose,
        settings.close,
        () => browsers.close(),
        () => db.$client.close(),
      ],
      'conciv: disposing the engine failed',
    )

  const fetch = makeEngineGate<unknown>({
    fetch: (request, env) => app.fetch(request, env),
    trusts: trust.trusts,
    allowedOrigins: opts.allowedOrigins ?? [],
    onTrusted: opts.onTrusted,
  })

  return {
    app,
    fetch,
    agentToken,
    trustBrowser: browsers.grant,
    chat: chatDeps,
    plane,
    dispose,
    extensionContexts,
    runtime,
  }
}

function outsideTitle(client: string | null): string {
  return `Allow ${client ?? 'an outside agent'} to use this tab`
}
