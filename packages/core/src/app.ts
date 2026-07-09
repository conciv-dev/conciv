import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension, ServerHarness, ServerSessions, ToolRequest} from '@conciv/extension'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness} from '@conciv/harness'
import {slug} from './extension-app.js'
import {corsMiddleware, type CorsVars} from './api/cors.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool} from '@conciv/protocol/chat-types'
import chatApp, {ensureAgentRecord} from './api/chat/chat.js'
import type {ChatRuntime, MarkerWriter} from './api/chat/chat-env.js'
import {makePermissionGate} from './api/chat/permission.js'
import {buildChatTools} from './api/chat/chat-tools.js'
import {ensureChatRecord, recordMintedToken, resolveSystemText, resumeTokenFor} from './api/chat/turn.js'
import {sweepEmptyChatRecords} from './api/chat/session.js'
import {clientPayload, isConcivError} from '@conciv/errors'
import {readLock, readLocks} from './store/lock.js'
import type {SessionStore} from './store/session-store.js'
import mcpApp, {type McpVars} from './api/mcp/mcp.js'
import toolsApp, {type ToolsVars} from './api/chat/tools-route.js'
import pageApp, {makePageBus, type PageVars} from './api/page/page.js'
import openSourceApp, {type OpenSourceVars} from './api/page/open-source.js'
import bundlerApp, {type BundlerVars} from './api/server/server.js'
import editorApp, {type EditorVars} from './api/editor/editor.js'
import {makeUiBus} from './runtime/ui-bus.js'
import {makeJournal} from './runtime/journal.js'
import {makeTurnHub} from './runtime/turn-hub.js'
import {logError} from './runtime/harness-logger.js'
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

  store: SessionStore

  markers: MarkerWriter
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

export type CoreVars = CorsVars &
  PageVars &
  OpenSourceVars &
  EditorVars &
  ToolsVars & {chat: ChatRuntime} & McpVars &
  BundlerVars

function composeRoutes(vars: CoreVars) {
  return new Hono<{Variables: CoreVars}>()
    .onError((error, c) => {
      if (error instanceof HTTPException)
        return c.json({message: error.message, code: `http.${error.status}`}, error.status)
      if (isConcivError(error)) {
        logError(`[core] ${error.userCode}: ${error.message} ${JSON.stringify(error.details)}`)
        return Response.json(clientPayload(error, process.env.NODE_ENV !== 'production'), {status: error.statusCode})
      }
      logError(`[core] unhandled route error: ${String(error)}`)
      return c.json({message: 'internal error', code: 'core.internal'}, 500)
    })
    .use(async (c, next) => {
      c.set('cors', vars.cors)
      c.set('page', vars.page)
      c.set('openSource', vars.openSource)
      c.set('editor', vars.editor)
      c.set('tools', vars.tools)
      c.set('chat', vars.chat)
      c.set('mcp', vars.mcp)
      c.set('bundler', vars.bundler)
      await next()
    })
    .use(corsMiddleware())
    .route('/api/page', openSourceApp)
    .route('/api/page', pageApp)
    .route('/api/editor', editorApp)
    .route('/api/chat/tools', toolsApp)
    .route('/api/chat', chatApp)
    .route('/api/mcp', mcpApp)
    .route('/api/server', bundlerApp)
}

export type AppType = ReturnType<typeof composeRoutes>

export type MadeApp = {
  app: AppType
  disposers: (() => void | Promise<void>)[]
  extensionContexts: Record<string, unknown>
}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const harness = opts.harness ?? requireHarness(opts.cfg.harness)
  const uiBus = makeUiBus()
  const store = opts.store
  const gate = makePermissionGate(uiBus, {
    risky: new Set(
      (opts.extensions ?? [])
        .flatMap((extension) => extension.tools ?? [])
        .filter((tool) => tool.approval === 'ask')
        .map((tool) => `mcp__conciv__${tool.name}`),
    ),
  })
  const hub = makeTurnHub()

  const chatTurnListeners: ((sessionId: string) => void)[] = []

  const pageBus = makePageBus()

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => resumeTokenFor(store, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureChatRecord(store, sessionId, harness.id, opts.cwd)
      await recordMintedToken(store, sessionId, token)
    },
    chatBusy: (sessionId) => readLock(opts.cfg.stateRoot, sessionId).held,
    model: async (sessionId) => (await store.get(sessionId))?.model ?? null,
    onChatTurn: (listener) => chatTurnListeners.push(listener),
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
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        cwd: opts.cwd,
        sessions: serverSessions,
        harness: serverHarness,
      })
      const context = result?.context
      return {
        extensionName: extension.name,
        app: narrowExtensionApp(extension.name, result?.app),
        tools: buildExtensionTools(extension, context),
        context,
        dispose: result?.dispose,
        turnEnd: result?.turnEnd,
      }
    }),
  )
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
  const onTurnEnd = async (sessionId: string): Promise<void> => {
    const settled = await Promise.allSettled(turnEnds.map((hook) => hook(sessionId)))
    settled.forEach((outcome) => {
      if (outcome.status === 'rejected') logError(`[core] turn-end hook failed: ${String(outcome.reason)}`)
    })
  }
  const makeToolCtx = (sessionId: string): ConcivToolContext => ({
    injectUi: (spec) => uiBus.inject(sessionId, spec),
    page: (query) => pageBus.ask(query),
    open: (file, line) => opts.openInEditor(file, line),
  })
  const sessionModel = (sessionId: string): string | null => uiBus.getModel(sessionId)

  const toolList: ChatTool[] = [
    ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
    ...mounted.flatMap((entry) =>
      entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
    ),
  ]

  const chatRuntime: ChatRuntime = {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    harness,
    harnessEnv: opts.harnessEnv,
    claudeHome: opts.claudeHome,
    systemText: resolveSystemText(
      {systemPromptFile: opts.systemPromptFile, systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt},
      harness.capabilities.systemPrompt,
    ),
    gate,
    uiBus,
    store,
    markers: opts.markers,
    hub,
    tools: buildChatTools(makeToolCtx, extensionTools, sessionModel),
    onTurnStart: (sessionId) => chatTurnListeners.forEach((listener) => listener(sessionId)),
    onTurnEnd,
  }

  if (opts.cfg.sessionId) {
    void ensureAgentRecord({store, harnessKind: harness.id, cwd: opts.cwd}, opts.cfg.sessionId).catch(() => {})
  }
  void sweepEmptyChatRecords(store, new Set(readLocks(opts.cfg.stateRoot).map((l) => l.key))).catch(() => {})

  const app = composeRoutes({
    cors: {allowedOrigins: opts.allowedOrigins ?? []},
    page: {journal: makeJournal(), root: opts.cwd, bus: pageBus},
    openSource: {open: opts.openInEditor, root: opts.cwd},
    editor: {open: opts.openInEditor},
    tools: {list: toolList},
    chat: chatRuntime,
    mcp: {makeCtx: makeToolCtx, extensionTools, sessionModel},
    bundler: {bridge: () => opts.bridge},
  })

  mounted.forEach((entry) => {
    if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
  })

  return {app, disposers, extensionContexts}
}
