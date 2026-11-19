import {createRequire} from 'node:module'
import {Effect, Schema, Stream} from 'effect'
import {FileSystem} from 'effect/FileSystem'
import {Path} from 'effect/Path'
import {ChildProcess} from 'effect/process'
import {uniq} from 'es-toolkit'
import type {Summary, TestError, TestRow} from './events.js'
import {readChildExit, type ChildExitStatus} from './child-exit.js'
import {sendChildMessage, type ChildArgs} from './child-main.js'
import {parsePlaywrightReport} from './playwright-report.js'

const CliFailed = Schema.TaggedStruct('TestRunner.CliFailed', {message: Schema.String})
type CliFailed = typeof CliFailed.Type & globalThis.Error
const makeCliFailed = (fields: Omit<typeof CliFailed.Type, '_tag'>): CliFailed =>
  Object.assign(new globalThis.Error(fields.message), CliFailed.make(fields), {name: 'TestRunner.CliFailed'})

const ReportUnreadable = Schema.TaggedStruct('TestRunner.ReportUnreadable', {message: Schema.String})
type ReportUnreadable = typeof ReportUnreadable.Type & globalThis.Error
const makeReportUnreadable = (fields: Omit<typeof ReportUnreadable.Type, '_tag'>): ReportUnreadable =>
  Object.assign(new globalThis.Error(fields.message), ReportUnreadable.make(fields), {
    name: 'TestRunner.ReportUnreadable',
  })

const CLI_IDS = ['playwright/cli', '@playwright/test/cli']
const OUTPUT_TAIL_LENGTH = 500

type CliResult = ChildExitStatus & {readonly stdout: string; readonly stderr: string; readonly report: string}

function resolveCli(cwd: string, path: Path) {
  const require = createRequire(path.join(cwd, 'noop.js'))
  return Effect.firstSuccessOf(CLI_IDS.map((id) => Effect.try({try: () => require.resolve(id), catch: () => id}))).pipe(
    Effect.mapError(() => makeCliFailed({message: 'playwright not found in the app (install @playwright/test)'})),
  )
}

function collectText<E>(stream: Stream.Stream<Uint8Array, E>) {
  return stream.pipe(Stream.decodeText(), Stream.mkString)
}

const runCli = Effect.fn('TestRunner.playwrightCli')(
  function* (cwd: string, cliArgs: readonly string[]) {
    const fileSystem = yield* FileSystem
    const path = yield* Path
    const cliPath = yield* resolveCli(cwd, path)
    const reportDirectory = yield* fileSystem.makeTempDirectoryScoped({prefix: 'conciv-playwright-report-'})
    const reportFile = path.join(reportDirectory, 'report.json')
    const handle = yield* ChildProcess.make(process.execPath, [cliPath, 'test', ...cliArgs, '--reporter=json'], {
      cwd,
      env: {PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile},
      extendEnv: true,
      stdin: 'ignore',
    })
    const [stdout, stderr, exit] = yield* Effect.all(
      [collectText(handle.stdout), collectText(handle.stderr), readChildExit(handle)],
      {concurrency: 'unbounded'},
    )
    const report = yield* fileSystem.readFileString(reportFile).pipe(
      Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeed('')),
      Effect.catchTag('PlatformError', (error) => Effect.fail(makeReportUnreadable({message: error.message}))),
    )
    const result: CliResult = {...exit, stdout, stderr, report}
    return result
  },
  Effect.scoped,
  Effect.catchTag('PlatformError', (error) => Effect.fail(makeCliFailed({message: error.message}))),
)

function tail(text: string): string {
  return text.length > OUTPUT_TAIL_LENGTH ? text.slice(-OUTPUT_TAIL_LENGTH) : text
}

function describeMissingReport(result: CliResult): string {
  const parts = [`exit code ${result.code}, signal ${result.signal}`]
  if (result.stderr.trim()) parts.push(`stderr: ${tail(result.stderr.trim())}`)
  if (result.stdout.trim()) parts.push(`stdout: ${tail(result.stdout.trim())}`)
  return `playwright produced no JSON report (${parts.join(', ')})`
}

function readReport(result: CliResult) {
  if (result.report.trim().startsWith('{')) return Effect.succeed(parsePlaywrightReport(result.report))
  return Effect.fail(makeReportUnreadable({message: describeMissingReport(result)}))
}

function summarize(rows: readonly TestRow[]): Summary {
  const count = (state: TestRow['state']) => rows.filter((row) => row.state === state).length
  return {
    passed: count('pass'),
    failed: count('fail'),
    skipped: count('skip'),
    durationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
  }
}

export const runPlaywrightChild = Effect.fn('TestRunner.playwrightChild')(function* (args: ChildArgs) {
  if (args.mode === 'list') {
    const rows = yield* readReport(yield* runCli(args.cwd, ['--list']))
    const path = yield* Path
    const files = uniq(rows.map((row) => row.file)).map((file) => ({file: path.join(args.cwd, file), relPath: file}))
    sendChildMessage({type: 'list', files})
    return
  }
  const rows = yield* readReport(yield* runCli(args.cwd, [...args.patterns, ...(args.name ? ['-g', args.name] : [])]))
  sendChildMessage({type: 'run-start', runId: 'pw1', files: uniq(rows.map((row) => row.file))})
  rows.forEach((row) => sendChildMessage({type: 'test', ...row}))
  const failures = rows.map((row) => row.error).filter((error): error is TestError => error !== undefined)
  sendChildMessage({type: 'run-end', runId: 'pw1', summary: summarize(rows), failures, tests: rows})
})
