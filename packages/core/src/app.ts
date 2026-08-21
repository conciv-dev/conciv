import {existsSync} from 'node:fs'
import {Hono} from 'hono'
import {z} from 'zod'
import {EngineStalenessSchema, type EngineStaleness} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
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
import {getHarness} from '@conciv/harness'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivSandboxTools, concivSandboxToolNames, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {
  ensureAgentRow,
  ensureRow,
  mintExternalRow,
  nativeIdFor,
  recordNativeId,
  sweepEmptyRows,
  type RowScope,
} from './chat/session-rows.js'
import {makeRunControl, type ChatDeps} from './chat/runtime.js'
import {askUi} from './chat/ask.js'
import {makeAskGate, requiresApproval} from './chat/gate.js'
import {makeConcivSandbox} from './chat/sandbox.js'
import {assistCapabilities, registryCapabilities, type CodeCapability} from './chat/capabilities.js'
import {recoverInterruptedRuns} from './chat/transcript.js'
import {makeCompactor, makeSend, resolveSystemText, type AttachmentExpanders} from './chat/run.js'
import {modelOf, openDb, writeToolCapture} from '@conciv/db'
import mcpApp, {type McpVars} from './api/mcp.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makeSessionPrimitives} from './runtime/primitives.js'
import {makeCoreRuntime} from './runtime/core-runtime.js'
import type {CoreRuntime, ScopedToolCall} from './runtime/scope-types.js'
import {runWithSession, session} from './runtime/session-context.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {symbolicateFrames, type RawFrame as SymbolicableFrame} from './editor/symbolicate.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {
  makeCompositeRpcRouter,
  RPC_PREFIX,
  RPC_WS_PATH,
  rpcFetchMiddleware,
  rpcWebsocketRoute,
} from '@conciv/extension/rpc-mount'
import type {CompositeRpcRouter} from './api/rpc/mount.js'
import pageServerExtension from '@conciv/extension-page/server'
import {PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {logError} from './lib/debug.js'
import {engineStaleness} from './lib/engine-stamp.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedConcivConfig
  cwd: string
  basePath?: string
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string

  systemPromptText?: string

  extensions?: AnyExtension[]

  extensionConfig?: Record<string, unknown>
  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv

  claudeHome?: string

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  askTimeoutMs?: number

  nativePageDir?: string

  nativeUrl?: () => string | undefined

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

function approvalGatedNames(registry: ToolRegistry): Set<string> {
  return new Set(
    registry.catalog
      .list()
      .filter((entry) => requiresApproval(registry.catalog.get(entry.name)))
      .map((entry) => entry.name),
  )
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

export type CoreVars = CorsVars & {chat: ChatDeps} & McpVars

function composeRoutes(
  vars: CoreVars,
  rpc: CompositeRpcRouter,
  deps: {staleness: () => EngineStaleness; onShutdown?: () => void},
) {
  return new Hono<{Variables: CoreVars}>()
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({message: error.message}, error.status)
      logError(`[core] unhandled route error: ${String(error)}`)
      return c.json({message: 'internal error'}, 500)
    })
    .use(async (c, next) => {
      c.set('cors', vars.cors)
      c.set('chat', vars.chat)
      c.set('mcp', vars.mcp)
      await next()
    })
    .use(corsMiddleware())
    .get('/health', (c) =>
      c.json(HealthSchema.parse({ok: true, harness: vars.chat.harness.id, engine: deps.staleness()})),
    )
    .post('/api/shutdown', (c) => {
      if (!deps.onShutdown) return c.json({message: 'shutdown not supported'}, 404)
      setTimeout(deps.onShutdown, 50)
      return c.json({ok: true})
    })
    .get(
      RPC_WS_PATH,
      rpcWebsocketRoute(rpc, {upgrade: upgradeWebSocket, onError: (message) => logError(`[core] ${message}`)}),
    )
    .use(`${RPC_PREFIX}/*`, rpcFetchMiddleware(rpc))
    .route('/api/mcp', mcpApp)
}

export type AppType = ReturnType<typeof composeRoutes>

export type MadeApp = {
  app: AppType
  dispose: () => Promise<void>
  extensionContexts: Record<string, unknown>
  runtime: CoreRuntime
}

const RUN_DRAIN_TIMEOUT_MS = 5_000

async function drainWithDeadline(drain: Promise<void>, timeoutMs: number): Promise<boolean> {
  const timer = {handle: null as ReturnType<typeof setTimeout> | null}
  const outcome = await Promise.race([
    drain.then(() => 'drained' as const),
    new Promise<'timeout'>((resolve) => {
      timer.handle = setTimeout(() => resolve('timeout'), timeoutMs)
    }),
  ])
  if (timer.handle) clearTimeout(timer.handle)
  return outcome === 'drained'
}

function makeServerHarness(harness: HarnessAdapter, cwd: string, claudeHome?: string): ServerHarness {
  const history = harness.history
  const transcriptPath = history?.transcriptPath
  const transcriptExists = (token: HarnessSessionId): boolean => {
    if (transcriptPath === undefined) return false
    if (history?.withinProject && !history.withinProject(cwd, token, claudeHome)) return false
    return existsSync(transcriptPath(cwd, token, claudeHome))
  }
  return {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: transcriptPath ? transcriptExists : undefined,
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
  return mintExternalRow(rows)
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const extensions = [pageServerExtension, ...(opts.extensions ?? [])]

  assertUniqueExtensionSlugs(extensions)

  const harness = opts.harness ?? requireHarness(opts.cfg.harness)
  const staleness = opts.staleness ?? engineStaleness
  const db = openDb(opts.cfg.stateRoot)
  await recoverInterruptedRuns({db, harness, claudeHome: opts.claudeHome})
  const {claimStartedAt, durability, runControl, runs} = makeRunControl(opts.firstChunkTimeoutMs)

  const runStartListeners: ((sessionId: SessionId) => void)[] = []

  const primitives = makeSessionPrimitives({
    root: opts.cwd,
    storeCapture: (params) => writeToolCapture(db, params),
    bundler: () => opts.bridge,
    openInEditor: opts.openInEditor,
  })
  const {asks, liveRuns, registry, stream} = primitives
  const rows = {db, harnessKind: harness.id, cwd: opts.cwd}
  const scopedToolCall: ScopedToolCall = (name, input, request) =>
    runtime.forSession(request.sessionId).tools.call(name, input, {toolCallId: request.toolCallId})

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => nativeIdFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureRow(db, sessionId, harness.id, opts.cwd)
      await recordNativeId(db, sessionId, token)
    },
    chatBusy: (sessionId) => liveRuns.running(sessionId),
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
        page: {call: (name, input) => session().page.ask(name, input)},
        tools: {call: (name, input) => session().tools.call(name, input)},
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
  const onRunEnd = (sessionId: SessionId): Promise<void> =>
    runWithSession(runtime.forSession(sessionId), async () => {
      const settled = await Promise.allSettled(turnEnds.map((hook) => hook(sessionId)))
      settled.forEach((outcome) => {
        if (outcome.status === 'rejected') logError(`[core] turn-end hook failed: ${String(outcome.reason)}`)
      })
    })
  const sessionModel = (sessionId: SessionId): string | null => modelOf(db, sessionId)
  const makeToolCtx = (sessionId: SessionId): ConcivToolContext => ({askUi: () => askUi(asks, sessionId)})

  const askFreeCommandAllows = (): string[] =>
    registry.catalog
      .list()
      .flatMap((entry) => {
        const signature = registry.catalog.get(entry.name)
        if (requiresApproval(signature)) return []
        const [group, operation] = [entry.path.slice(0, -1).join(' '), entry.path.at(-1)]
        if (operation === undefined) return []
        const command = group === '' ? `conciv tools ${operation}` : `conciv tools ${group} ${operation}`
        const aliases = [command, `${command} *`]
        if (entry.name.startsWith(PAGE_TOOL_PREFIX) && signature.category === 'react') {
          aliases.push(`conciv tools react ${operation}`, `conciv tools react ${operation} *`)
        }
        return aliases
      })
      .concat(['conciv tools page changes', 'conciv tools page changes *'])

  assertUniqueCapabilityNames([
    ['a built-in registry tool', registry.sandboxTools().map((tool) => tool.name)],
    ['a conciv assist tool', concivSandboxToolNames()],
    ...mounted.map((entry): [string, string[]] => [
      `extension "${entry.extensionName}"`,
      entry.tools.map((tool) => tool.name),
    ]),
  ])

  registerExtensionTools(registry, mounted)

  const risky = approvalGatedNames(registry)

  const codeModeCapabilities = (sessionId: SessionId): CodeCapability[] => [
    ...registryCapabilities(registry, scopedToolCall),
    ...assistCapabilities(concivSandboxTools(makeToolCtx(sessionId))),
  ]

  const toolList: ChatTool[] = mounted.flatMap((entry) =>
    entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
  )

  const chatDeps: ChatDeps = {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    basePath: opts.basePath ?? '',
    harness,
    harnessEnv: opts.harnessEnv,
    claudeHome: opts.claudeHome,
    systemText: resolveSystemText(
      {systemPromptFile: opts.systemPromptFile, systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt},
      harness.capabilities.systemPrompt,
    ),
    sandbox: makeConcivSandbox(opts.cwd),
    db,
    asks,
    durability,
    runControl,
    runs,
    claimStartedAt,
    liveRuns,
    stream,
    risky,
    commandAllows: askFreeCommandAllows,
    toolNames: new Set(toolList.map((tool) => tool.name)),
    codeModeCapabilities,
    attachmentExpanders,
    onRunStart: (sessionId) =>
      runWithSession(runtime.forSession(sessionId), () => runStartListeners.forEach((listener) => listener(sessionId))),
    onRunEnd,
    firstChunkTimeoutMs: opts.firstChunkTimeoutMs,
  }

  if (opts.cfg.harnessSessionId !== undefined) {
    void ensureAgentRow(rows, opts.cfg.harnessSessionId).catch(() => {})
  }
  if (opts.cfg.sessionId !== undefined) {
    void ensureRow(db, opts.cfg.sessionId, harness.id, opts.cwd).catch(() => {})
  }
  void sweepEmptyRows(db).catch(() => {})

  const compactor = makeCompactor(chatDeps)

  const send = makeSend(chatDeps)

  const runtime = makeCoreRuntime({primitives, chat: chatDeps, send, compactor, model: sessionModel, staleness})

  const rpc = makeRpcRouter({
    chat: chatDeps,
    tools: toolList,
    compactor,
    send,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    runtime,
    rows,
    staleness,
    ...(opts.askTimeoutMs === undefined ? {} : {askTimeoutMs: opts.askTimeoutMs}),
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
      chat: chatDeps,
      mcp: {
        capabilities: codeModeCapabilities,
        askGate: (sessionId) =>
          makeAskGate({
            sessionId,
            asks,
            emit: (chunk) => stream.publish(sessionId, chunk),
            ...(opts.askTimeoutMs === undefined ? {} : {timeoutMs: opts.askTimeoutMs}),
          }),
        listening: (sessionId) => stream.listening(sessionId),
        resolveSession: async (header, nativeId) => runtime.forSession(await mcpSessionId(rows, header, nativeId)),
        staleness,
      },
    },
    compositeRpc,
    {staleness, onShutdown: opts.onShutdown},
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
  })

  const dispose = async (): Promise<void> => {
    const drained = await drainWithDeadline(runControl.drain(), RUN_DRAIN_TIMEOUT_MS)
    if (!drained) logError('[core] disposed with run(s) still in flight')
    for (const disposer of disposers) await Promise.resolve(disposer()).catch(() => {})
    db.$client.close()
  }

  return {app, dispose, extensionContexts, runtime}
}
