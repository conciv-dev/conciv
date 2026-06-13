import {H3} from 'h3'
import type {HarnessAdapter, HarnessChild} from '@devgent/protocol/harness-types'
import type {TestRunnerAdapter} from '@devgent/protocol/runner-types'
import type {BundlerBridge} from '@devgent/protocol/bundler-types'
import type {ResolvedDevgentConfig} from './config.js'
import {getHarness} from '@devgent/harness'
import {getRunner} from './test-runner/registry.js'
import {registerChatRoutes} from './api/chat/chat.js'
import {registerPageRoutes} from './api/page/page.js'
import {registerServerRoutes} from './api/server/server.js'
import {registerEditorRoutes} from './api/editor/editor.js'
import {registerTestRunnerRoutes} from './api/test-runner/test-runner.js'
import {makeUiBus} from './chat/ui-bus.js'
import {makeJournal} from './page/journal.js'
import type {OpenInEditor} from './editor/open.js'

export type MakeAppOpts = {
  cfg: ResolvedDevgentConfig
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

  registerChatRoutes(app, {
    cwd: opts.cwd,
    lockDir: opts.cfg.lockDir,
    previewId: opts.cfg.previewId,
    initialSessionId: opts.cfg.sessionId,
    harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.cfg.systemPrompt,
    uiBus,
  })
  registerPageRoutes(app, {journal: makeJournal()})
  registerEditorRoutes(app, opts.openInEditor)
  registerTestRunnerRoutes(app, runner)
  if (opts.bridge) registerServerRoutes(app, opts.bridge)
  return app
}
