import type {TestEvent, TestRunResult} from './test-types.js'

// Runner-neutral test-runner contract. Core's test route + the widget card consume
// TestEvent / TestRunResult only — never a runner-specific type.

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListResult = {files: {file: string; relPath: string; lastState?: string}[]}

export type UiServerInfo = {available: boolean; url?: string}

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

// Registry entry: `create(cwd)` lazily builds a TestRunnerManager for a working directory.
export type TestRunnerAdapter = {
  id: string
  capabilities: TestRunnerCapabilities
  create: (cwd: string) => TestRunnerManager
}

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
