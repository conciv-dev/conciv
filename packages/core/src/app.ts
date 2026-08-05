import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {
  type AnyExtension,
  type AttachmentDocumentPart,
  type ContentPart,
  type ExtensionServerTool,
  type PageCaller,
  type PageVerbMap,
  type ServerHarness,
  type ServerResult,
  type ServerSessions,
  type ToolRequest,
  pageVerbError,
} from '@conciv/extension'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness} from '@conciv/harness'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool} from '@conciv/protocol/chat-types'
import {
  ensureAgentRow,
  ensureRow,
  nativeIdFor,
  recordNativeId,
  rowByNativeId,
  sweepEmptyRows,
} from './chat/session-rows.js'
import {buildChatTools, makeRunControl, type ChatDeps} from './chat/runtime.js'
import {askUi, createAskRegistry} from './chat/ask.js'
import {makeConcivSandbox, makeRunGate, riskyMatches} from './chat/gate.js'
import {createSessionStreams} from './chat/subscribe.js'
import {createSnapshotCache} from './chat/transcript.js'
import {createLiveRuns} from './chat/live-runs.js'
import {makeCompactor, makeSend, resolveSystemText, type AttachmentExpanders} from './chat/run.js'
import {modelOf, openDb} from '@conciv/db'
import mcpApp, {type McpVars} from './api/mcp.js'
import {NATIVE_PAGE_PATH, makeNativePageApp} from './api/native-page.js'
import {makePageBus, runVerb, type PageEnv} from './page-bus.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {extensionRpcMiddleware, rpcMiddleware} from './api/rpc/mount.js'
import {makeJournal} from './page-bus.js'
import {callPageTool, makeBuiltinRegistry, toolFailureFromPage} from './tool-registry.js'
import {logError} from './lib/debug.js'
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
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv

  claudeHome?: string

  allowedOrigins?: string[]

  harness?: HarnessAdapter

  onShutdown?: () => void

  firstChunkTimeoutMs?: number

  nativePageDir?: string

  nativeUrl?: () => string | undefined
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function requireHarness(id: string): HarnessAdapter {
  const found = getHarness(id) ?? getHarness('claude')
  if (!found) throw new Error('no harness registered (built-in claude missing)')
  return found
}

function narrowExtensionApp(name: string, app: unknown): Hono | null {
  if (app === undefined) return null
  if (!(app instanceof Hono)) throw new Error(`extension "${name}" returned a non-hono app`)
  return app
}

type CallPageVerb = (extension: string, verb: string, argsJson: string) => Promise<unknown>

function scopedPageCaller(extension: string, callPageVerb: CallPageVerb): PageCaller<PageVerbMap> {
  return {
    call(verb, args) {
      let argsJson: string
      try {
        argsJson = JSON.stringify(args ?? {})
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return Promise.reject(pageVerbError('invalid-args', extension, verb, message))
      }
      return callPageVerb(extension, verb, argsJson)
    },
  }
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

export function buildExtensionTools(extension: AnyExtension, context: unknown): ExtensionServerTool[] {
  return (extension.tools ?? []).flatMap((tool) => {
    const run = tool.__execute
    if (!run) return []
    const description = [tool.description, tool.promptSnippet, ...(tool.promptGuidelines ?? [])]
      .filter(Boolean)
      .join('\n\n')
    return [
      {
        name: tool.name,
        description,
        inputSchema: tool.inputSchema,
        approval: tool.approval,
        execute: (input: unknown, request: ToolRequest) => run(input, context, request),
      },
    ]
  })
}

export type CoreVars = CorsVars & {chat: ChatDeps} & McpVars

function composeRoutes(vars: CoreVars, rpc: ReturnType<typeof makeRpcRouter>, onShutdown?: () => void) {
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
    .get('/health', (c) => c.json({ok: true, harness: vars.chat.harness.id}))
    .post('/api/shutdown', (c) => {
      if (!onShutdown) return c.json({message: 'shutdown not supported'}, 404)
      setTimeout(onShutdown, 50)
      return c.json({ok: true})
    })
    .use('/rpc/*', rpcMiddleware(rpc))
    .route('/api/mcp', mcpApp)
}

export type AppType = ReturnType<typeof composeRoutes>

export type MadeApp = {
  app: AppType
  dispose: () => Promise<void>
  extensionContexts: Record<string, unknown>
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

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const harness = opts.harness ?? requireHarness(opts.cfg.harness)
  const db = openDb(opts.cfg.stateRoot)
  const asks = createAskRegistry()
  const {claimStartedAt, durability, runControl, runs} = makeRunControl(opts.firstChunkTimeoutMs)
  const liveRuns = createLiveRuns()
  const stream = createSessionStreams()
  const snapshots = createSnapshotCache()
  const risky = new Set(
    (opts.extensions ?? [])
      .flatMap((extension) => extension.tools ?? [])
      .filter((tool) => tool.approval === 'ask')
      .map((tool) => tool.name),
  )

  const runStartListeners: ((sessionId: string) => void)[] = []

  const pageBus = makePageBus()

  const pageEnv: PageEnv = {journal: makeJournal(), root: opts.cwd, bus: pageBus}

  const registry = makeBuiltinRegistry({
    page: pageEnv,
    bundler: () => opts.bridge,
    openInEditor: opts.openInEditor,
  })

  const callPageVerb: CallPageVerb = async (extension, verb, argsJson) => {
    const reply = await runVerb(pageEnv, {extension, verb, argsJson}, 'ext').catch((error: unknown) => {
      throw toolFailureFromPage(extension, verb, error)
    })
    return reply.result
  }

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
  const history = harness.history
  const transcriptPath = history?.transcriptPath
  const serverHarness: ServerHarness = {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: transcriptPath
      ? (token) => {
          if (history?.withinProject && !history.withinProject(opts.cwd, token, opts.claudeHome)) return false
          return existsSync(transcriptPath(opts.cwd, token, opts.claudeHome))
        }
      : undefined,
    transcriptMessages: history ? (token) => history.messages(opts.cwd, token, opts.claudeHome) : undefined,
    connectPlan: harness.connect?.plan,
  }
  const seenTools = new Set<string>()
  const seenNames = new Set<string>()
  const nativeUrl = opts.nativeUrl ?? ((): string | undefined => undefined)

  function assembleMounted(extension: AnyExtension, result: ServerResult<unknown> | undefined) {
    const context = result?.context
    return {
      extensionName: extension.name,
      app: narrowExtensionApp(extension.name, result?.app),
      router: result?.router,
      tools: buildExtensionTools(extension, context),
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
        sessions: serverSessions,
        harness: serverHarness,
        page: scopedPageCaller(extension.name, callPageVerb),
        bundler: opts.bridge,
        nativeUrl,
      })
      return assembleMounted(extension, result)
    } catch (error) {
      logError(`[core] extension "${extension.name}" failed to mount: ${String(error)}`)
      return null
    }
  }

  const mountResults = await Promise.all(
    (opts.extensions ?? []).map((extension) => {
      if (seenNames.has(extension.name)) throw new Error(`extension name collision: "${extension.name}"`)
      seenNames.add(extension.name)
      return mountExtension(extension)
    }),
  )
  const mounted = mountResults.flatMap((entry) => (entry ? [entry] : []))
  const attachmentExpanders: AttachmentExpanders = {}
  for (const entry of mounted)
    for (const [mime, expand] of entry.attachmentExpanders) attachmentExpanders[mime] ??= expand
  const extensionContexts: Record<string, unknown> = Object.fromEntries(
    mounted.map((entry) => [entry.extensionName, entry.context]),
  )
  const extensionTools = mounted.flatMap((entry) => entry.tools)
  extensionTools.forEach((tool) => {
    if (seenTools.has(tool.name)) throw new Error(`extension tool name collision: "${tool.name}"`)
    seenTools.add(tool.name)
  })
  const disposers = mounted.flatMap((entry) => (entry.dispose ? [entry.dispose] : []))
  const turnEnds = mounted.flatMap((entry) => (entry.turnEnd ? [entry.turnEnd] : []))
  const onRunEnd = async (sessionId: string): Promise<void> => {
    const settled = await Promise.allSettled(turnEnds.map((hook) => hook(sessionId)))
    settled.forEach((outcome) => {
      if (outcome.status === 'rejected') logError(`[core] turn-end hook failed: ${String(outcome.reason)}`)
    })
  }
  const sessionModel = (sessionId: string): string | null => modelOf(db, sessionId)
  const makeToolCtx = (sessionId: string): ConcivToolContext => ({
    askUi: () => askUi(asks, sessionId),
    page: (query) => callPageTool(registry, pageEnv, query, {sessionId, model: sessionModel(sessionId)}),
    open: (file, line) => opts.openInEditor(file, line),
    capabilities: () => registry.catalog.list(),
  })

  const decideMcpCall = async (sessionId: string, toolName: string, input: unknown): Promise<'allow' | 'deny'> => {
    if (!riskyMatches(risky, toolName)) return 'allow'
    if (!sessionId) return 'deny'
    const gate = makeRunGate({sessionId, asks, emit: (chunk) => stream.publish(sessionId, chunk), risky})
    return gate.decide(toolName, input, sessionId, randomUUID())
  }

  const toolList: ChatTool[] = [
    ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
    ...mounted.flatMap((entry) =>
      entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
    ),
  ]

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
    snapshots,
    risky,
    tools: buildChatTools(makeToolCtx, extensionTools, sessionModel),
    toolNames: new Set(toolList.map((tool) => tool.name)),
    extensionServerTools: () => extensionTools,
    attachmentExpanders,
    onRunStart: (sessionId) => runStartListeners.forEach((listener) => listener(sessionId)),
    onRunEnd,
    firstChunkTimeoutMs: opts.firstChunkTimeoutMs,
  }

  if (opts.cfg.sessionId) {
    void ensureAgentRow({db, harnessKind: harness.id, cwd: opts.cwd}, opts.cfg.sessionId).catch(() => {})
  }
  void sweepEmptyRows(db).catch(() => {})

  const compactor = makeCompactor(chatDeps)

  const send = makeSend(chatDeps)

  const rpc = makeRpcRouter({
    chat: chatDeps,
    tools: toolList,
    compactor,
    send,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    page: pageEnv,
    registry,
  })

  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      chat: chatDeps,
      mcp: {
        makeCtx: makeToolCtx,
        extensionTools,
        sessionModel,
        discovered: new Map(),
        decide: decideMcpCall,
        sessionForNativeId: async (nativeId) => (await rowByNativeId(db, nativeId))?.id ?? null,
      },
    },
    rpc,
    opts.onShutdown,
  )

  if (opts.nativePageDir) app.route(NATIVE_PAGE_PATH, makeNativePageApp(opts.nativePageDir))

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
    if (entry.router)
      app.use(
        `/rpc/ext/${slug(entry.extensionName)}/*`,
        extensionRpcMiddleware(entry.router, slug(entry.extensionName)),
      )
  })

  const dispose = async (): Promise<void> => {
    const drained = await drainWithDeadline(runControl.drain(), RUN_DRAIN_TIMEOUT_MS)
    if (!drained) logError('[core] disposed with run(s) still in flight')
    for (const disposer of disposers) await Promise.resolve(disposer()).catch(() => {})
    db.$client.close()
  }

  return {app, dispose, extensionContexts}
}
