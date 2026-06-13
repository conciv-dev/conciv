import type {TestEvent, TestRunResult} from './test-types.js'

// Test-runner adapter contract. Generalized from today's VitestManager — runner-neutral by
// design (list/run/status/subscribeRaw/emitSnapshot/openUiServer/stop). The core test route
// and the widget card consume TestEvent / TestRunResult only — never a runner-specific type.

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListResult = {files: {file: string; relPath: string; lastState?: string}[]}

export type UiServerInfo = {available: boolean; url?: string}

// What a runner adapter advertises so the core route + widget can degrade features it lacks.
export type TestRunnerCapabilities = {
  watch: boolean
  uiServer: boolean
  filterByName: boolean
  failedOnly: boolean
}

export type TestRunnerManager = {
  list: (failedOnly?: boolean) => Promise<ListResult>
  run: (args: RunArgs) => Promise<TestRunResult>
  status: () => TestRunResult
  subscribeRaw: (cb: (e: TestEvent) => void) => () => void
  emitSnapshot: () => TestEvent
  openUiServer: () => Promise<UiServerInfo>
  stop: () => Promise<void>
}

// A runner adapter: the registry entry shape. `create(cwd)` lazily builds a TestRunnerManager
// for a working directory. The runner registry stores these; the core test route + widget
// feature-detect against `capabilities`.
export type TestRunnerAdapter = {
  id: string
  capabilities: TestRunnerCapabilities
  create: (cwd: string) => TestRunnerManager
}

// Generic typed factory: every runner adapter is authored through this helper (never a bare
// object literal), mirroring defineHarness. <T extends TestRunnerAdapter> preserves the
// adapter's exact literal type. Dev-time invariant: a non-empty id, a create() factory, and
// uiServer is only advertised when a create() factory exists to back openUiServer.
export function defineRunner<T extends TestRunnerAdapter>(adapter: T): T {
  if (!adapter.id) throw new Error('runner: id is required')
  if (adapter.capabilities.uiServer && typeof adapter.create !== 'function') {
    throw new Error(`runner "${adapter.id}": uiServer requires a create() factory`)
  }
  if (typeof adapter.create !== 'function') {
    throw new Error(`runner "${adapter.id}": create() factory is required`)
  }
  return adapter
}
