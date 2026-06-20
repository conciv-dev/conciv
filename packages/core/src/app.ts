import {H3} from 'h3'
import type {HarnessAdapter, HarnessChild} from '@mandarax/protocol/harness-types'
import type {TestRunnerAdapter} from '@mandarax/protocol/runner-types'
import type {BundlerBridge} from '@mandarax/protocol/bundler-types'
import type {ExtensionServerTool} from '@mandarax/extensions'
import type {ResolvedMandaraxConfig} from './config.js'
import {getHarness} from '@mandarax/harness'
import {getRunner} from '@mandarax/test-runner'
import {registerCors} from './api/cors.js'
import {registerErrorHandler} from './api/errors.js'
import {registerChatRoutes} from './api/chat/chat.js'
import {registerMcpRoutes} from './api/mcp/mcp.js'
import {registerPageRoutes} from './api/page/page.js'
import {registerServerRoutes} from './api/server/server.js'
import {registerEditorRoutes} from './api/editor/editor.js'
import {registerTestRunnerRoutes} from './api/test-runner/test-runner.js'
import {registerCanvasRoutes} from './api/canvas/canvas.js'
import {createCanvasRelay} from './canvas/relay.js'
import {createFsCanvasStore} from './canvas/canvas-store.js'
import {makeUiBus} from './runtime/ui-bus.js'
import {makeJournal} from './runtime/journal.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedMandaraxConfig
  cwd: string
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string
  // The effective system prompt text (base + extension appends); defaults to cfg.systemPrompt.
  systemPromptText?: string
  // Extension-contributed MCP tools, registered alongside the built-in mandarax tools.
  extensionTools?: ExtensionServerTool[]
  spawnHarness: (args: string[], cwd: string, sessionId?: string) => HarnessChild
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  // Override the harness transcript home (claude: ~/.claude). For tests; defaults to homedir().
  claudeHome?: string
  // Extra browser origins allowed to call the API (beyond loopback, which is always allowed) —
  // e.g. a dev server bound to a LAN IP. The loopback default already covers localhost dev.
  allowedOrigins?: string[]
}

// Resolve a registered adapter or fall back to the built-in; throw if even that is missing
// (a real misconfiguration — claude/vitest register at module load).
function requireHarness(id: string): HarnessAdapter {
  const found = getHarness(id) ?? getHarness('claude')
  if (!found) throw new Error('no harness registered (built-in claude missing)')
  return found
}
function requireRunner(id: string): TestRunnerAdapter {
  const found = getRunner(id) ?? getRunner('vitest')
  if (!found) throw new Error('no test runner registered (built-in vitest missing)')
  return found
}

export function makeApp(opts: MakeAppOpts): H3 {
  const app = new H3()
  const harness = requireHarness(opts.cfg.harness)
  const runner = requireRunner(opts.cfg.testRunner).create(opts.cwd)
  const uiBus = makeUiBus()

  registerErrorHandler(app)
  registerCors(app, opts.allowedOrigins ?? [])
  registerChatRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    previewId: opts.cfg.previewId,
    initialSessionId: opts.cfg.sessionId,
    harness,
    spawnHarness: opts.spawnHarness,
    harnessEnv: opts.harnessEnv,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText ?? opts.cfg.systemPrompt,
    claudeHome: opts.claudeHome,
    uiBus,
  })
  const page = registerPageRoutes(app, {journal: makeJournal(), root: opts.cwd})
  const canvasRelay = createCanvasRelay({
    store: createFsCanvasStore({stateRoot: opts.cfg.stateRoot, previewId: opts.cfg.previewId}),
  })
  registerCanvasRoutes(app, {relay: canvasRelay})
  registerEditorRoutes(app, opts.openInEditor)
  registerTestRunnerRoutes(app, runner)
  // Expose mandarax tools to the harness CLI via MCP-over-HTTP on the same server, bridged to the live
  // uiBus / page bus / test runner.
  registerMcpRoutes(
    app,
    (sessionId) => ({
      injectUi: (spec) => uiBus.inject(sessionId, spec),
      page: (query) => page.ask(query),
      test: async ({kind, pattern}) => {
        if (kind === 'list') return runner.list()
        if (kind === 'run') return runner.run({patterns: pattern ? [pattern] : undefined})
        return runner.status()
      },
      open: (file, line) => opts.openInEditor(file, line),
    }),
    opts.extensionTools ?? [],
  )
  if (opts.bridge) registerServerRoutes(app, opts.bridge)
  return app
}
