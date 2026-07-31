import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import type {HarnessAdapter, TerminalOpener} from '@conciv/protocol/harness-types'
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
import {isSessionId, type ChatTool, type SendVerdict} from '@conciv/protocol/chat-types'
import {
  claimHarnessToken,
  ensureAgentRecord,
  ensureChatRecord,
  resumeTokenFor,
  sessionByHarnessId,
  sweepEmptyChatRecords,
  transcriptCwdFor,
  transcriptTokenAllowed,
} from './chat/session.js'
import {buildChatTools, type ChatDeps} from './chat/runtime.js'
import {makeDialLog} from './chat/dial-log.js'
import {sweepLaunchScripts} from './chat/connect-exec.js'
import {makeChanges} from './chat/attach.js'
import {askUi, makeConcivSandbox, makeRunGate, needsApproval, riskyToolNames, sessionAsk} from './chat/gate.js'
import {makeCompactor, makeSend, resolveSystemText, type AttachmentExpanders} from './chat/run.js'
import {attachedElsewhere, detachAllAttached} from './chat/adopt.js'
import {modelOf, openDb, requestStop, statusOf} from '@conciv/db'
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
  basePath?: string
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  openTerminal: TerminalOpener
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

function removeListener<Listener>(listeners: Listener[], listener: Listener): void {
  const index = listeners.indexOf(listener)
  if (index >= 0) listeners.splice(index, 1)
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
  const risky = riskyToolNames(
    (opts.extensions ?? [])
      .flatMap((extension) => extension.tools ?? [])
      .filter((tool) => tool.approval === 'ask')
      .map((tool) => tool.name),
  )

  const localRunListeners: ((sessionId: string, phase: 'start' | 'end') => void)[] = []
  const detachedListeners: ((sessionId: string) => void)[] = []
  const launchListeners: ((sessionId: string) => void)[] = []
  const sendVetoes: ((sessionId: string, opts: {force: boolean}) => SendVerdict)[] = []
  const mcpRequestListeners: ((sessionId: string) => void)[] = []
  const fanOut = <Args extends unknown[]>(listeners: ((...args: Args) => void)[], label: string, ...args: Args) => {
    for (const listener of listeners) {
      try {
        listener(...args)
      } catch (error) {
        logError(`[core] ${label} listener failed: ${String(error)}`)
      }
    }
  }
  const notifyLocalRun = (sessionId: string, phase: 'start' | 'end'): void =>
    fanOut(localRunListeners, 'local-run', sessionId, phase)
  const notifySessionDetached = (sessionId: string): void => fanOut(detachedListeners, 'session-detached', sessionId)
  const notifyLaunch = (sessionId: string): void => fanOut(launchListeners, 'launch', sessionId)

  const pageBus = makePageBus()

  const serverSessions: ServerSessions = {
    resumeToken: (sessionId) => resumeTokenFor(db, sessionId),
    recordToken: async (sessionId, token) => {
      await ensureChatRecord(db, sessionId, harness.id, opts.cwd)
      return claimHarnessToken(db, sessionId, token)
    },
    sessionForHarnessId: async (harnessSessionId) => (await sessionByHarnessId(db, harnessSessionId))?.id ?? null,
    chatBusy: (sessionId) => statusOf(db, sessionId) !== 'idle',
    model: async (sessionId) => modelOf(db, sessionId),
    onLocalRun: (listener) => {
      localRunListeners.push(listener)
      return () => removeListener(localRunListeners, listener)
    },
    onSessionDetached: (listener) => {
      detachedListeners.push(listener)
      return () => removeListener(detachedListeners, listener)
    },
    onLaunch: (listener) => {
      launchListeners.push(listener)
      return () => removeListener(launchListeners, listener)
    },
    beforeSend: (check) => {
      sendVetoes.push(check)
      return () => removeListener(sendVetoes, check)
    },
    onMcpRequest: (listener) => {
      mcpRequestListeners.push(listener)
      return () => removeListener(mcpRequestListeners, listener)
    },
    notifyChange: () => changes.bumpExternal(),
  }
  const askVeto = (
    check: (sessionId: string, opts: {force: boolean}) => SendVerdict,
    sessionId: string,
    sendOpts: {force: boolean},
  ): SendVerdict => {
    try {
      return check(sessionId, sendOpts)
    } catch (error) {
      logError(`[core] send veto failed: ${String(error)}`)
      return {allow: true}
    }
  }
  const runSendVetoes = (sessionId: string, sendOpts: {force: boolean}): SendVerdict => {
    for (const check of sendVetoes) {
      const verdict = askVeto(check, sessionId, sendOpts)
      if (!verdict.allow) return verdict
    }
    return {allow: true}
  }
  const notifyMcpRequest = (sessionId: string): void => fanOut(mcpRequestListeners, 'mcp-request', sessionId)
  const history = harness.history
  const transcriptPath = history?.transcriptPath
  const cwdForToken = async (token: string): Promise<string> => (await transcriptCwdFor(db, token)) ?? opts.cwd
  const serverHarness: ServerHarness = {
    id: harness.id,
    ttyCommand: harness.tty?.command,
    release: (sessionId) => {
      if (requestStop(db, sessionId)) changes.notify()
    },
    transcriptExists: transcriptPath
      ? async (token) => {
          const cwd = await cwdForToken(token)
          if (!transcriptTokenAllowed(history, cwd, token, opts.claudeHome)) return false
          return existsSync(transcriptPath(cwd, token, opts.claudeHome))
        }
      : undefined,
    observeTranscript: history
      ? async (token) => {
          const cwd = await cwdForToken(token)
          if (!transcriptTokenAllowed(history, cwd, token, opts.claudeHome)) return null
          return history.observe(cwd, token, opts.claudeHome)
        }
      : undefined,
  }
  const basePath = opts.basePath ?? ''
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
        basePath,
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
    notifyLocalRun(sessionId, 'end')
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

  const decideMcpTool = async (sessionId: string, toolName: string, input: unknown): Promise<'allow' | 'deny'> => {
    if (!needsApproval(toolName, input, risky)) return 'allow'
    if (!isSessionId(sessionId)) return 'deny'
    const gate = makeRunGate({
      sessionId,
      ask: sessionAsk(db, changes, sessionId),
      db,
      changes,
      risky,
      partWaitMs: 0,
    })
    return gate.decide(toolName, input, sessionId, randomUUID())
  }

  const toolList: ChatTool[] = [
    ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
    ...mounted.flatMap((entry) =>
      entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
    ),
  ]

  const dialLog = makeDialLog()

  const chatDeps: ChatDeps = {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    basePath,
    harness,
    harnessEnv: opts.harnessEnv,
    openTerminal: opts.openTerminal,
    claudeHome: opts.claudeHome,
    systemText: resolveSystemText(
      {systemPromptFile: opts.systemPromptFile, systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt},
      harness.capabilities.systemPrompt,
    ),
    sandbox: makeConcivSandbox(opts.cwd),
    db,
    changes,
    dialed: dialLog.seen,
    risky,
    tools: buildChatTools(makeToolCtx, extensionTools, sessionModel),
    attachmentExpanders,
    onRunStart: (sessionId) => notifyLocalRun(sessionId, 'start'),
    onRunEnd,
    onSessionDetached: notifySessionDetached,
    firstChunkTimeoutMs: opts.firstChunkTimeoutMs,
  }

  if (opts.cfg.sessionId) {
    void ensureAgentRecord({db, harnessKind: harness.id, cwd: opts.cwd}, opts.cfg.sessionId).catch(() => {})
  }
  void sweepEmptyChatRecords(db).catch(() => {})
  void sweepLaunchScripts(concivStateDir(opts.cfg.stateRoot), Date.now())

  const compactor = makeCompactor(chatDeps)

  const send = makeSend(chatDeps)

  const pageEnv = {journal: makeJournal(), root: opts.cwd, bus: pageBus}

  const rpc = makeRpcRouter({
    chat: chatDeps,
    tools: toolList,
    compactor,
    send,
    beforeSend: runSendVetoes,
    attachedElsewhere: (sessionId) => attachedElsewhere(chatDeps, sessionId),
    onLaunch: notifyLaunch,
    openInEditor: opts.openInEditor,
    openFromFrames: (frames) => openSourceFromFrames(frames, opts.cwd, opts.openInEditor),
    page: pageEnv,
    bundler: () => opts.bridge,
  })

  const app = composeRoutes(
    {
      cors: {allowedOrigins: opts.allowedOrigins ?? []},
      chat: chatDeps,
      mcp: {
        makeCtx: makeToolCtx,
        extensionTools,
        sessionModel,
        onRequest: notifyMcpRequest,
        onHarnessDial: dialLog.note,
        sessionForHarnessId: serverSessions.sessionForHarnessId,
        decide: decideMcpTool,
      },
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

  return {
    app,
    disposers: [...disposers, () => detachAllAttached(chatDeps)],
    extensionContexts,
    closeDb: () => db.$client.close(),
  }
}
