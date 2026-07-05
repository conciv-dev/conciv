import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {H3} from 'h3'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension, ServerHarness, ServerSessions, ToolRequest} from '@conciv/extension'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness} from '@conciv/harness'
import {makeExtensionApp} from './extension-app.js'
import {originAllowed, registerCors} from './api/cors.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ChatTool} from '@conciv/protocol/chat-types'
import {registerChatRoutes} from './api/chat/chat.js'
import {ensureChatRecord, recordMintedToken, resumeTokenFor} from './api/chat/turn.js'
import {readLock} from './store/lock.js'
import {createFsSessionStore} from './store/session-store.js'
import {registerMcpRoutes} from './api/mcp/mcp.js'
import {registerToolsRoute} from './api/chat/tools-route.js'
import {registerPageRoutes} from './api/page/page.js'
import {registerOpenSourceRoute} from './api/page/open-source.js'
import {registerServerRoutes} from './api/server/server.js'
import {registerEditorRoutes} from './api/editor/editor.js'
import {makeUiBus} from './runtime/ui-bus.js'
import {makeJournal} from './runtime/journal.js'
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
  spawnHarness: (args: string[], cwd: string, sessionId?: string) => HarnessChild
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv

  claudeHome?: string

  allowedOrigins?: string[]
}

function requireHarness(id: string): HarnessAdapter {
  const found = getHarness(id) ?? getHarness('claude')
  if (!found) throw new Error('no harness registered (built-in claude missing)')
  return found
}

export type MadeApp = {app: H3; disposers: (() => void | Promise<void>)[]; extensionContexts: Record<string, unknown>}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const app = new H3()
  const harness = requireHarness(opts.cfg.harness)
  const uiBus = makeUiBus()
  const store = createFsSessionStore({stateRoot: opts.cfg.stateRoot})

  const riskyTools = new Set(
    (opts.extensions ?? [])
      .flatMap((extension) => extension.tools ?? [])
      .filter((tool) => tool.approval === 'ask')
      .map((tool) => `mcp__conciv__${tool.name}`),
  )

  const chatTurnListeners: ((sessionId: string) => void)[] = []

  registerCors(app, opts.allowedOrigins ?? [])
  const page = registerPageRoutes(app, {journal: makeJournal(), root: opts.cwd})
  registerEditorRoutes(app, opts.openInEditor)
  registerOpenSourceRoute(app, {openInEditor: opts.openInEditor, root: opts.cwd})

  const guard = (origin: string | null) => originAllowed(origin, new Set(opts.allowedOrigins ?? []))
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
    release: harness.release,
    transcriptExists: history ? (token) => existsSync(history.transcriptPath(opts.cwd, token)) : undefined,
    transcriptMessages: history
      ? async (token) => {
          const raw = await readFile(history.transcriptPath(opts.cwd, token), 'utf8').catch(() => '')
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
        app: makeExtensionApp(app, extension.name, guard),
        sessions: serverSessions,
        harness: serverHarness,
      })
      const context = result?.context
      const tools = (extension.tools ?? []).flatMap((tool) => {
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
      return {extensionName: extension.name, tools, context, dispose: result?.dispose, turnEnd: result?.turnEnd}
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
  registerChatRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    initialSessionId: opts.cfg.sessionId,
    harness,
    spawnHarness: opts.spawnHarness,
    harnessEnv: opts.harnessEnv,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt,
    claudeHome: opts.claudeHome,
    uiBus,
    riskyTools,
    store,
    onTurnStart: (sessionId) => chatTurnListeners.forEach((listener) => listener(sessionId)),
    onTurnEnd,
  })

  const makeToolCtx = (sessionId: string): ConcivToolContext => ({
    injectUi: (spec) => uiBus.inject(sessionId, spec),
    page: (query) => page.ask(query),
    open: (file, line) => opts.openInEditor(file, line),
  })

  registerMcpRoutes(app, makeToolCtx, extensionTools, (sessionId) => uiBus.getModel(sessionId))
  const toolList: ChatTool[] = [
    ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
    ...mounted.flatMap((entry) =>
      entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
    ),
  ]
  registerToolsRoute(app, toolList)
  if (opts.bridge) registerServerRoutes(app, opts.bridge)
  return {app, disposers, extensionContexts}
}
