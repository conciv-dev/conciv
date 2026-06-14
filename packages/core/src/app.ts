import {H3} from 'h3'
import type {HarnessAdapter, HarnessChild} from '@aidx/protocol/harness-types'
import type {TestRunnerAdapter} from '@aidx/protocol/runner-types'
import type {BundlerBridge} from '@aidx/protocol/bundler-types'
import type {ResolvedAidxConfig} from './config.js'
import {getHarness} from '@aidx/harness'
import {getRunner} from '@aidx/test-runner'
import {registerCors} from './api/cors.js'
import {registerErrorHandler} from './api/errors.js'
import {registerChatRoutes} from './api/chat/chat.js'
import {registerMcpRoutes} from './api/mcp/mcp.js'
import {registerPageRoutes} from './api/page/page.js'
import {registerServerRoutes} from './api/server/server.js'
import {registerEditorRoutes} from './api/editor/editor.js'
import {registerTestRunnerRoutes} from './api/test-runner/test-runner.js'
import {makeUiBus} from './runtime/ui-bus.js'
import {makeJournal} from './runtime/journal.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedAidxConfig
  cwd: string
  bridge?: BundlerBridge
  openInEditor: OpenInEditor
  systemPromptFile?: string
  spawnHarness: (args: string[], cwd: string) => HarnessChild
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
  registerCors(app)
  registerChatRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.cfg.stateRoot,
    previewId: opts.cfg.previewId,
    initialSessionId: opts.cfg.sessionId,
    harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.cfg.systemPrompt,
    uiBus,
  })
  const page = registerPageRoutes(app, {journal: makeJournal()})
  registerEditorRoutes(app, opts.openInEditor)
  registerTestRunnerRoutes(app, runner)
  // Expose aidx tools to the harness CLI via MCP-over-HTTP on the same server, bridged to the live
  // uiBus / page bus / test runner.
  registerMcpRoutes(app, {
    injectUi: (spec) => uiBus.inject(spec),
    page: (query) => page.ask(query),
    test: async ({kind, pattern}) => {
      if (kind === 'list') return runner.list()
      if (kind === 'run') return runner.run({patterns: pattern ? [pattern] : undefined})
      return runner.status()
    },
  })
  if (opts.bridge) registerServerRoutes(app, opts.bridge)
  return app
}
