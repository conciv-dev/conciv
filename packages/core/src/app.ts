import {existsSync} from 'node:fs'
import {Hono} from 'hono'
import {z} from 'zod'
import {EngineStalenessSchema, type EngineStaleness} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/harness'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {
  type AnyExtension,
  type AnyToolBuilder,
  type AttachmentDocumentPart,
  type ConcivPlugin,
  type ContentPart,
  type ExtensionServerTool,
  type ServerHarness,
  type ServerResult,
  type ServerSessions,
  type ToolRequest,
} from '@conciv/extension'
import type {ConcivHost} from '@conciv/extension/devframe-host'
import {concivError} from '@conciv/extension/devframe-function'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness, transcriptPathWithin} from '@conciv/harness'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivSandboxTools, concivSandboxToolNames, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {
  anonymousExternalRow,
  currentRow,
  ensureAgentRow,
  ensureRow,
  nativeIdFor,
  recordFirstTitle,
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
import type {ChatContext} from './api/rpc/mount.js'
import {drafts, modelOf, openDb, sessions, writeToolCapture, type ConcivDb} from '@conciv/db'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import mcpApp, {type McpVars} from './api/mcp.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makeSessionPrimitives} from './runtime/primitives.js'
import {makeCoreRuntime} from './runtime/core-runtime.js'
import type {CoreRuntime, ScopedToolCall} from './runtime/scope-types.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {symbolicateFrames, type RawFrame as SymbolicableFrame} from './editor/symbolicate.js'
import {
  draftsFunctions,
  makeRpcRouter,
  markersFunctions,
  metaFunctions,
  type DraftsServerFunctions,
  type MarkersServerFunctions,
  type MetaServerFunctions,
} from './api/rpc/router.js'
import {makeCompositeRpcRouter, RPC_PREFIX, rpcFetchMiddleware} from '@conciv/extension/rpc-mount'
import type {CompositeRpcRouter} from './api/rpc/mount.js'
import pageServerExtension from '@conciv/extension-page/server'
import {assertToolName} from '@conciv/extension/tool'
import {logError} from './lib/debug.js'
import {rpcSessionList, sessionsFunctions, type SessionsServerFunctions} from './api/rpc/sessions.js'
import {engineStaleness} from './lib/engine-stamp.js'
import {makeDevframePlane} from './devframe-plane.js'
import {currentSession, runWithSession} from './runtime/session-context.js'
import type {OpenInEditor} from './editor/open.js'
import type {ClaimUpgrade} from '@conciv/serve'
import type {HubInstance} from '@devframes/hub/initiate'

declare module 'devframe' {
  interface DevframeRpcServerFunctions
    extends SessionsServerFunctions, MetaServerFunctions, DraftsServerFunctions, MarkersServerFunctions {}
}

export type MakeAppOpts = {
  cfg: ResolvedConcivConfig
  cwd: string
  basePath?: string
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string

  systemPromptText?: string

  extensions?: AnyExtension[]

  plugins?: readonly ConcivPlugin[]

  loginToken?: string

  extensionConfig?: Record<string, unknown>
  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv

  claudeHome?: string

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  nativePageDir?: string

  nativeUrl?: () => string | undefined

  mcpUrl?: () => string | undefined

  staleness?: () => EngineStaleness
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
      return row === null ? null : {model: row.model, nativeId: row.harnessSessionId, cwd: row.cwd}
    },
    ensure: (sessionId) => ensureRow(db, sessionId, rows.harnessKind, rows.cwd),
    recordNativeId: (sessionId, nativeId) => recordNativeId(db, sessionId, nativeId),
    recordUsage: (sessionId, usage) => recordSessionUsage(db, sessionId, usage),
    recordContextTokens: async (sessionId, contextTokens) => {
      const usage = currentRow(db, sessionId)?.usage
      if (usage) await recordSessionUsage(db, sessionId, {...usage, contextTokens})
    },
    recordTitle: (sessionId, title) => recordFirstTitle(db, sessionId, title),
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

export const HealthSchema = z.object({
  ok: z.literal(true),
  harness: z.string(),
  engine: EngineStalenessSchema,
})

export type CoreVars = CorsVars & {harnessId: string} & McpVars

function composeRoutes(
  vars: CoreVars,
  rpc: CompositeRpcRouter,
  deps: {staleness: () => EngineStaleness; onShutdown?: () => void; push: PushDeps; plane: ChatPlane},
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
    .get('/health', (c) => c.json(HealthSchema.parse({ok: true, harness: vars.harnessId, engine: deps.staleness()})))
    .post('/api/shutdown', (c) => {
      if (!deps.onShutdown) return c.json({message: 'shutdown not supported'}, 404)
      setTimeout(deps.onShutdown, 50)
      return c.json({ok: true})
    })
    .route('/', deps.plane.routes(upgradeWebSocket))
    .route('/', pushRoutes(deps.push, upgradeWebSocket))
    .use(`${RPC_PREFIX}/*`, rpcFetchMiddleware(rpc))
    .route('/api/mcp', mcpApp)
}

export type AppType = ReturnType<typeof composeRoutes>

export type MadeApp = {
  app: AppType
  chat: ChatContext
  plane: ChatPlane
  dispose: () => Promise<void>
  extensionContexts: Record<string, unknown>
  runtime: CoreRuntime
  hub: HubInstance
  claimUpgrade: ClaimUpgrade
  loginToken: string
}

function makeServerHarness(harness: HarnessAdapter, cwd: string, claudeHome?: string): ServerHarness {
  const history = harness.history
  const transcriptExists = (token: HarnessSessionId): boolean => {
    if (history === undefined) return false
    const path = transcriptPathWithin(history, cwd, token, claudeHome)
    return path !== null && existsSync(path)
  }
  return {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: history?.transcriptPath ? transcriptExists : undefined,
    transcriptMessages: history ? (token) => history.messages(cwd, token, claudeHome) : undefined,
    connectPlan: harness.connect?.plan,
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

type HostParts = {
  sessions: ServerSessions
  harness: ServerHarness
  nativeUrl: () => string | undefined
  chat: ChatContext
  runtime: CoreRuntime
}

function makeConcivHost(opts: MakeAppOpts, parts: HostParts): ConcivHost {
  return {
    cwd: opts.cwd,
    basePath: opts.basePath ?? '',
    stateDir: concivStateDir(opts.cfg.stateRoot),
    sessions: parts.sessions,
    harness: parts.harness,
    symbolicate: (frames) => symbolicateFrames(frames.filter(symbolicable), opts.cwd),
    bundler: opts.bridge,
    nativeUrl: parts.nativeUrl,
    latestSession: async () => (await rpcSessionList(parts.chat, false))[0]?.id ?? null,
    config: (id) => opts.extensionConfig?.[id],
    inSession: (id, run) => {
      const sessionId = id ?? currentSession()?.id
      if (sessionId === undefined) throw concivError('NO_SESSION', 'this call needs a session')
      return runWithSession(parts.runtime.forSession(sessionId), () => run(sessionId))
    },
  }
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const extensions = withBuiltinExtensions(opts.extensions)

  assertUniqueExtensionSlugs(extensions)

  const harness = opts.harness ?? requireHarness(opts.cfg.harness)
  const staleness = opts.staleness ?? engineStaleness
  const db = openDb(opts.cfg.stateRoot)
  const planeRef: {current: ChatPlane | null} = {current: null}

  const runStartListeners: ((sessionId: SessionId) => void)[] = []

  const primitives = makeSessionPrimitives({
    db,
    root: opts.cwd,
    storeCapture: (params) => writeToolCapture(db, params),
    bundler: () => opts.bridge,
    openInEditor: opts.openInEditor,
  })
  const {registry, stream} = primitives
  const rows = {db, harnessKind: harness.id, cwd: opts.cwd}
  const scopedToolCall: ScopedToolCall = (name, input, request) =>
    runtime.forSession(request.sessionId).tools.call(name, input, {toolCallId: request.toolCallId})

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => nativeIdFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureRow(db, sessionId, harness.id, opts.cwd)
      await recordNativeId(db, sessionId, token)
    },
    chatBusy: async (sessionId) => (await planeRef.current?.live(sessionId)) === true,
    model: async (sessionId) => modelOf(db, sessionId),
    onChatTurn: (listener) => runStartListeners.push(listener),
  }
  const serverHarness = makeServerHarness(harness, opts.cwd, opts.claudeHome)
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
        stateDir: concivStateDir(opts.cfg.stateRoot),
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        cwd: opts.cwd,
        basePath: opts.basePath ?? '',
        sessions: serverSessions,
        harness: serverHarness,
        symbolicate: (frames) => symbolicateFrames(frames.filter(symbolicable), opts.cwd),
        bundler: opts.bridge,
        nativeUrl,
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

  const plane = await createChatPlane({
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    harness,
    harnessEnv: opts.harnessEnv,
    claudeHome: opts.claudeHome,
    systemPrompt: {
      systemPromptFile: opts.systemPromptFile,
      systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt,
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
    harness,
    cwd: opts.cwd,
    basePath: opts.basePath ?? '',
    claudeHome: opts.claudeHome,
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

  const devframePlane = makeDevframePlane({
    stateDir: concivStateDir(opts.cfg.stateRoot),
    cwd: opts.cwd,
    host: makeConcivHost(opts, {sessions: serverSessions, harness: serverHarness, nativeUrl, chat: chatDeps, runtime}),
    plugins: opts.plugins,
    devframes: opts.cfg.devframes,
    loginToken: opts.loginToken,
    allowedOrigins: opts.allowedOrigins,
    published: {sessions: () => rpcSessionList(chatDeps, false)},
    functions: (publish) => [
      ...sessionsFunctions({chat: chatDeps, runtime, publish}),
      ...metaFunctions({chat: chatDeps, tools: toolList, runtime, mcpUrl: opts.mcpUrl ?? (() => undefined)}),
      ...draftsFunctions({chat: chatDeps}),
      ...markersFunctions({chat: chatDeps}),
    ],
  })
  const publishSessions = (): Promise<void> => devframePlane.publish('sessions')
  runStartListeners.push(() => void publishSessions())
  turnEnds.push(publishSessions)
  const rpc = makeRpcRouter({
    chat: chatDeps,
    tools: toolList,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    runtime,
    allowedOrigins: new Set(opts.allowedOrigins),
    staleness,
    publish: devframePlane.publish,
  })

  const compositeRpc = makeCompositeRpcRouter(
    rpc,
    mounted.flatMap((entry) =>
      entry.router ? [{slug: slug(entry.extensionName), extensionName: entry.extensionName, router: entry.router}] : [],
    ),
  )

  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      harnessId: harness.id,
      mcp: {
        codeRunner: (sessionId) => plane.codeRunner(sessionId, (chunk) => stream.publish(sessionId, chunk)),
        resolveSession: async (header, nativeId) => runtime.forSession(await mcpSessionId(rows, header, nativeId)),
        staleness,
      },
    },
    compositeRpc,
    {
      staleness,
      onShutdown: opts.onShutdown,
      plane,
      push: {
        queries: (sessionId, signal) => runtime.forSession(sessionId).page.queries(signal),
        events: (sessionId, signal) => runtime.forSession(sessionId).stream.events(signal),
      },
    },
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
  })

  const {hub, claimUpgrade, loginToken} = devframePlane
  app.all(`${hub.base}*`, (c) => hub.handler(c.req.raw))

  const dispose = async (): Promise<void> => {
    await devframePlane.close().catch((error: unknown) => logError(`[core] the hub failed to close: ${String(error)}`))
    for (const disposer of disposers) await Promise.resolve(disposer()).catch(() => {})
    db.$client.close()
  }

  try {
    await hub.ready
  } catch (error) {
    await dispose()
    throw error
  }
  await devframePlane.publish('sessions')

  return {app, chat: chatDeps, plane, dispose, extensionContexts, runtime, hub, claimUpgrade, loginToken}
}
