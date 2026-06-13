// Wire types streamed over /__pw/test/stream and returned by the run/status/list routes.
// Mirrored verbatim by the widget's test card — never guessed there. `parseFailure` is the
// one pure bit worth unit-testing: it maps a Vitest v4 TestCase (shape below) to our flat
// TestError. NO runner name appears in any type below — these are the runner-blind wrapper
// contract every runner adapter translates its native output into.

export type TestState = 'pass' | 'fail' | 'skip'

export type TestError = {file: string; name: string; message: string; stack: string; line?: number}

export type Summary = {passed: number; failed: number; skipped: number; durationMs: number}

export type FileState = {file: string; state: TestState | 'running'; durationMs?: number}

// One completed test. `run-end` carries the FULL list (every pass/fail/skip) so a card
// rendered from a stored tool-result on reload can rebuild the whole tree — not just the
// failures. `error` is present only for failures.
export type TestRow = {file: string; name: string; state: TestState; durationMs: number; error?: TestError}

// The result returned by `devgent tools test run` (printed as the tool-result the widget
// renders as a card) and by the run route. Carries the full tree so it's self-contained.
export type TestRunResult = {summary: Summary; failures: TestError[]; tests: TestRow[]}

export type TestEvent =
  | {type: 'snapshot'; files: FileState[]; summary: Summary; watching: boolean}
  | {type: 'run-start'; runId: string; files: string[]}
  | {type: 'test'; file: string; name: string; state: TestState; durationMs: number; error?: TestError}
  | {type: 'file-end'; file: string; ok: boolean; durationMs: number}
  | {type: 'run-end'; runId: string; summary: Summary; failures: TestError[]; tests: TestRow[]}

// Structural subset of a Vitest v4 TestCase — only what parseFailure reads.
export type TestCaseLike = {
  name: string
  module: {moduleId: string}
  result: () => {
    state: 'passed' | 'failed' | 'skipped' | 'pending'
    errors?: ReadonlyArray<{message: string; stacks?: ReadonlyArray<{file?: string; line?: number}>}>
  }
}

export function parseFailure(tc: TestCaseLike): TestError | null {
  const result = tc.result()
  if (result.state !== 'failed') return null
  const err = result.errors?.[0]
  const message = err?.message ?? 'test failed'
  const top = err?.stacks?.find((s) => s.file === tc.module.moduleId) ?? err?.stacks?.[0]
  return {
    file: tc.module.moduleId,
    name: tc.name,
    message,
    stack: message,
    line: top?.line,
  }
}
