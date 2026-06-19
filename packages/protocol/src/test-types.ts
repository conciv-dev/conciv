import {z} from 'zod'

// Runner-neutral wire types: the runner child emits these as NDJSON, the manager validates
// with TestEventSchema, the widget card renders them. Schemas are the contract; types inferred.

export const TestStateSchema = z.enum(['pass', 'fail', 'skip'])
export type TestState = z.infer<typeof TestStateSchema>

// POST /api/editor/open body — "open this file at this line" from the test card. Shared by core
// (validation) and the widget transport (typing).
export const EditorOpenSchema = z.object({file: z.string().min(1), line: z.number().optional()})
export type EditorOpen = z.infer<typeof EditorOpenSchema>

export const TestErrorSchema = z.object({
  file: z.string(),
  name: z.string(),
  message: z.string(),
  stack: z.string(),
  line: z.number().optional(),
})
export type TestError = z.infer<typeof TestErrorSchema>

export const SummarySchema = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  durationMs: z.number(),
})
export type Summary = z.infer<typeof SummarySchema>

export const FileStateSchema = z.object({
  file: z.string(),
  state: z.enum(['pass', 'fail', 'skip', 'running']),
  durationMs: z.number().optional(),
})
export type FileState = z.infer<typeof FileStateSchema>

// One completed test; `run-end` carries the full list so a reloaded card rebuilds the tree.
export const TestRowSchema = z.object({
  file: z.string(),
  name: z.string(),
  state: TestStateSchema,
  durationMs: z.number(),
  error: TestErrorSchema.optional(),
})
export type TestRow = z.infer<typeof TestRowSchema>

// The result of `mandarax tools test run` and the run route — the full self-contained tree.
export const TestRunResultSchema = z.object({
  summary: SummarySchema,
  failures: z.array(TestErrorSchema),
  tests: z.array(TestRowSchema),
})
export type TestRunResult = z.infer<typeof TestRunResultSchema>

export const TestEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    files: z.array(FileStateSchema),
    summary: SummarySchema,
    watching: z.boolean(),
  }),
  z.object({type: z.literal('run-start'), runId: z.string(), files: z.array(z.string())}),
  z.object({
    type: z.literal('test'),
    file: z.string(),
    name: z.string(),
    state: TestStateSchema,
    durationMs: z.number(),
    error: TestErrorSchema.optional(),
  }),
  z.object({type: z.literal('file-end'), file: z.string(), ok: z.boolean(), durationMs: z.number()}),
  z.object({
    type: z.literal('run-end'),
    runId: z.string(),
    summary: SummarySchema,
    failures: z.array(TestErrorSchema),
    tests: z.array(TestRowSchema),
  }),
])
export type TestEvent = z.infer<typeof TestEventSchema>

// Structural subset of a Vitest v4 TestCase — in-process (not parsed wire data), so a TS type.
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
