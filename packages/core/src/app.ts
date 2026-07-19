import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {
  AnyExtension,
  AttachmentDocumentPart,
  ContentPart,
  ServerHarness,
  ServerSessions,
  ToolRequest,
} from '@conciv/extension'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness} from '@conciv/harness'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool} from '@conciv/protocol/chat-types'
import {ensureAgentRecord, sweepEmptyChatRecords} from './chat/session.js'
import {buildChatTools, type ChatDeps} from './chat/runtime.js'
import {makeChanges} from './chat/attach.js'
import {askUi, makeConcivSandbox} from './chat/gate.js'
import {
  ensureChatRecord,
  makeCompactor,
  makeSend,
  recordMintedToken,
  resolveSystemText,
  resumeTokenFor,
  type AttachmentExpanders,
} from './chat/run.js'
import {modelOf, openDb, statusOf} from '@conciv/db'
import mcpApp, {type McpVars} from './api/mcp.js'
import {makePageBus} from './page-bus.js'
import {openSourceFromFrames} from './editor/open-source.js'
import {makeRpcRouter} from './api/rpc/router.js'
import {extensionRpcMiddleware, rpcMiddleware} from './api/rpc/mount.js'
import {makeJournal} from './page-bus.js'
import {logError} from './lib/debug.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedConcivConfig
  cwd: string
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

function buildExtensionTools(extension: AnyExtension, context: unknown) {
  return (extension.tools ?? []).flatMap((tool) => {
    const run = tool.__execute
    if (!run) return []
    return [
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
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
  disposers: (() => void | Promise<void>)[]
  extensionContexts: Record<string, unknown>
  closeDb: () => void
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const harness = opts.harness ?? requireHarness(opts.cfg.harness)
  const db = openDb(opts.cfg.stateRoot)
  const changes = makeChanges()
  const risky = new Set(
    (opts.extensions ?? [])
      .flatMap((extension) => extension.tools ?? [])
      .filter((tool) => tool.approval === 'ask')
      .map((tool) => `mcp__conciv__${tool.name}`),
  )

  const runStartListeners: ((sessionId: string) => void)[] = []

  const pageBus = makePageBus()

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => resumeTokenFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureChatRecord(db, sessionId, harness.id, opts.cwd)
      await recordMintedToken(db, sessionId, token)
    },
    chatBusy: (sessionId) => statusOf(db, sessionId) !== 'idle',
    model: async (sessionId) => modelOf(db, sessionId),
    onChatTurn: (listener) => runStartListeners.push(listener),
  }
  const history = harness.history
  const serverHarness: ServerHarness = {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    transcriptExists: history
      ? (token) => existsSync(history.transcriptPath(opts.cwd, token, opts.claudeHome))
      : undefined,
    transcriptMessages: history
      ? async (token) => {
          const raw = await readFile(history.transcriptPath(opts.cwd, token, opts.claudeHome), 'utf8').catch(() => '')
          return raw ? history.parse(raw) : []
        }
      : undefined,
  }
  const seenTools = new Set<string>()
  const seenNames = new Set<string>()
  const mounted = await Promise.all(
    (opts.extensions ?? []).map(async (extension) => {
      if (seenNames.has(extension.name)) throw new Error(`extension name collision: "${extension.name}"`)
      seenNames.add(extension.name)
      const result = await extension.__server?.({
        stateDir: concivStateDir(opts.cfg.stateRoot),
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        cwd: opts.cwd,
        sessions: serverSessions,
        harness: serverHarness,
      })
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
    }),
  )
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
  const makeToolCtx = (sessionId: string): ConcivToolContext => ({
    askUi: () => askUi({db, changes}, sessionId),
    page: (query) => pageBus.ask(query),
    open: (file, line) => opts.openInEditor(file, line),
  })
  const sessionModel = (sessionId: string): string | null => modelOf(db, sessionId)

  const toolList: ChatTool[] = [
    ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
    ...mounted.flatMap((entry) =>
      entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
    ),
  ]

  const chatDeps: ChatDeps = {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    harness,
    harnessEnv: opts.harnessEnv,
    claudeHome: opts.claudeHome,
    systemText: resolveSystemText(
      {systemPromptFile: opts.systemPromptFile, systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt},
      harness.capabilities.systemPrompt,
    ),
    sandbox: makeConcivSandbox(opts.cwd),
    db,
    changes,
    risky,
    tools: buildChatTools(makeToolCtx, extensionTools, sessionModel),
    attachmentExpanders,
    onRunStart: (sessionId) => runStartListeners.forEach((listener) => listener(sessionId)),
    onRunEnd,
    firstChunkTimeoutMs: opts.firstChunkTimeoutMs,
  }

  if (opts.cfg.sessionId) {
    void ensureAgentRecord({db, harnessKind: harness.id, cwd: opts.cwd}, opts.cfg.sessionId).catch(() => {})
  }
  void sweepEmptyChatRecords(db).catch(() => {})

  const compactor = makeCompactor(chatDeps)

  const send = makeSend(chatDeps)

  const pageEnv = {journal: makeJournal(), root: opts.cwd, bus: pageBus}

  const rpc = makeRpcRouter({
    chat: chatDeps,
    tools: toolList,
    compactor,
    send,
    openInEditor: opts.openInEditor,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    page: pageEnv,
    bundler: () => opts.bridge,
  })

  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      chat: chatDeps,
      mcp: {makeCtx: makeToolCtx, extensionTools, sessionModel},
    },
    rpc,
    opts.onShutdown,
  )

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
    if (entry.router)
      app.use(
        `/rpc/ext/${slug(entry.extensionName)}/*`,
        extensionRpcMiddleware(entry.router, slug(entry.extensionName)),
      )
  })

  return {app, disposers, extensionContexts, closeDb: () => db.$client.close()}
}
