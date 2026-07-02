import {H3} from 'h3'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension, ToolRequest} from '@conciv/extension'
import type {ResolvedConcivConfig} from './config.js'
import {getHarness} from '@conciv/harness'
import {makeExtensionApp} from './extension-app.js'
import {originAllowed, registerCors} from './api/cors.js'
import {registerChatRoutes} from './api/chat/chat.js'
import {registerMcpRoutes} from './api/mcp/mcp.js'
import {registerPageRoutes} from './api/page/page.js'
import {registerOpenSourceRoute} from './api/page/open-source.js'
import {registerServerRoutes} from './api/server/server.js'
import {registerEditorRoutes} from './api/editor/editor.js'
import {makeUiBus} from './runtime/ui-bus.js'
import {makeJournal} from './runtime/journal.js'
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

export type MadeApp = {app: H3; disposers: (() => void | Promise<void>)[]}

export async function makeApp(opts: MakeAppOpts): Promise<MadeApp> {
  const app = new H3()
  const harness = requireHarness(opts.cfg.harness)
  const uiBus = makeUiBus()

  const riskyTools = new Set(
    (opts.extensions ?? [])
      .flatMap((extension) => extension.tools ?? [])
      .filter((tool) => tool.approval === 'ask')
      .map((tool) => `mcp__conciv__${tool.name}`),
  )

  registerCors(app, opts.allowedOrigins ?? [])
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
  })
  const page = registerPageRoutes(app, {journal: makeJournal(), root: opts.cwd})
  registerEditorRoutes(app, opts.openInEditor)
  registerOpenSourceRoute(app, {openInEditor: opts.openInEditor, root: opts.cwd})

  const guard = (origin: string | null) => originAllowed(origin, new Set(opts.allowedOrigins ?? []))
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
      return {tools, dispose: result?.dispose}
    }),
  )
  const extensionTools = mounted.flatMap((entry) => entry.tools)
  extensionTools.forEach((tool) => {
    if (seenTools.has(tool.name)) throw new Error(`extension tool name collision: "${tool.name}"`)
    seenTools.add(tool.name)
  })
  const disposers = mounted.flatMap((entry) => (entry.dispose ? [entry.dispose] : []))

  registerMcpRoutes(
    app,
    (sessionId) => ({
      injectUi: (spec) => uiBus.inject(sessionId, spec),
      page: (query) => page.ask(query),
      open: (file, line) => opts.openInEditor(file, line),
    }),
    extensionTools,
    (sessionId) => uiBus.getModel(sessionId),
  )
  if (opts.bridge) registerServerRoutes(app, opts.bridge)
  return {app, disposers}
}
