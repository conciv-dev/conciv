import {z} from 'zod'
import type {TestError, TestRow, TestState} from '../../shared/events.js'

// Pure mapping of Playwright's `--reporter=json` report onto our wire types. Kept separate from
// the spawning child so it's unit-testable without a browser.

const ResultSchema = z
  .object({
    status: z.string(),
    duration: z.number().optional(),
    error: z.object({message: z.string().optional(), stack: z.string().optional()}).loose().optional(),
  })
  .loose()
const SpecSchema = z
  .object({
    title: z.string(),
    file: z.string().optional(),
    tests: z.array(z.object({results: z.array(ResultSchema).optional()}).loose()).optional(),
  })
  .loose()
type Suite = {file?: string; specs?: z.infer<typeof SpecSchema>[]; suites?: Suite[]}
const SuiteSchema: z.ZodType<Suite> = z.lazy(() =>
  z
    .object({
      file: z.string().optional(),
      specs: z.array(SpecSchema).optional(),
      suites: z.array(SuiteSchema).optional(),
    })
    .loose(),
)
const ReportSchema = z
  .object({
    suites: z.array(SuiteSchema).optional(),
    stats: z.object({duration: z.number().optional()}).loose().optional(),
  })
  .loose()

function toState(status: string): TestState {
  if (status === 'passed') return 'pass'
  if (status === 'skipped') return 'skip'
  return 'fail'
}

function* walkSpecs(suite: Suite, inherited: string): Generator<{file: string; spec: z.infer<typeof SpecSchema>}> {
  const file = suite.file ?? inherited
  for (const spec of suite.specs ?? []) yield {file: spec.file ?? file, spec}
  for (const child of suite.suites ?? []) yield* walkSpecs(child, file)
}

function rowFor(file: string, spec: z.infer<typeof SpecSchema>): TestRow {
  const result = spec.tests?.[0]?.results?.[0]
  const state = toState(result?.status ?? 'failed')
  const message = result?.error?.message ?? (state === 'fail' ? 'test failed' : '')
  const error: TestError | undefined =
    state === 'fail' ? {file, name: spec.title, message, stack: result?.error?.stack ?? message} : undefined
  return {file, name: spec.title, state, durationMs: result?.duration ?? 0, error}
}

// Parse a Playwright JSON report into test rows; returns [] on an unparseable report.
export function parsePlaywrightReport(raw: string): TestRow[] {
  let report: z.infer<typeof ReportSchema>
  try {
    const parsed = ReportSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    report = parsed.data
  } catch {
    return []
  }
  const rows: TestRow[] = []
  for (const suite of report.suites ?? [])
    for (const {file, spec} of walkSpecs(suite, '')) rows.push(rowFor(file, spec))
  return rows
}
