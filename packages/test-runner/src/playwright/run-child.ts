import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {writeSync} from 'node:fs'
import type {Summary, TestError, TestRow} from '@opendui/aidx-protocol/test-types'
import type {ChildMessage} from '../child-protocol.js'
import {parsePlaywrightReport} from './report.js'

// Out-of-process playwright runner logic. Pure module (no top-level exec); child.ts is the entry.
// Spawns the app's `playwright test --reporter=json`, then maps the JSON report to TestEvents.

function send(msg: ChildMessage): void {
  writeSync(3, JSON.stringify(msg) + '\n')
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
function flagValues(argv: string[], name: string): string[] {
  return argv.flatMap((a, i) => {
    const v = argv[i + 1]
    return a === name && v !== undefined ? [v] : []
  })
}

// The previewed app's playwright CLI, resolved from its cwd (versions differ per app).
function resolveCli(cwd: string): string {
  const req = createRequire(join(cwd, 'noop.js'))
  for (const id of ['playwright/cli', '@playwright/test/cli']) {
    try {
      return req.resolve(id)
    } catch {
      // try the next candidate
    }
  }
  throw new Error('playwright not found in the app (install @playwright/test)')
}

// Run the CLI and return its JSON report (stdout) + stderr. Playwright exits non-zero on test
// failures but still writes the report, so we resolve regardless of exit code.
function runCli(cwd: string, cliArgs: string[]): Promise<{report: string; stderr: string}> {
  const cliPath = resolveCli(cwd)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'test', ...cliArgs, '--reporter=json'], {cwd, env: process.env})
    let report = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => (report += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', reject)
    child.on('close', () => resolve({report, stderr}))
  })
}

function summarize(rows: TestRow[]): Summary {
  const count = (s: TestRow['state']) => rows.filter((r) => r.state === s).length
  return {
    passed: count('pass'),
    failed: count('fail'),
    skipped: count('skip'),
    durationMs: rows.reduce((sum, r) => sum + r.durationMs, 0),
  }
}

async function runTests(cwd: string, argv: string[]): Promise<void> {
  const patterns = flagValues(argv, '--pattern')
  const name = flagValue(argv, '--name')
  const {report, stderr} = await runCli(cwd, [...patterns, ...(name ? ['-g', name] : [])])
  if (!report.trim().startsWith('{')) throw new Error(stderr.trim() || 'playwright produced no JSON report')
  const rows = parsePlaywrightReport(report)
  const files = [...new Set(rows.map((r) => r.file))]
  send({type: 'run-start', runId: 'pw1', files})
  for (const row of rows) send({type: 'test', ...row})
  const failures = rows.map((r) => r.error).filter((e): e is TestError => e !== undefined)
  send({type: 'run-end', runId: 'pw1', summary: summarize(rows), failures, tests: rows})
}

async function runList(cwd: string): Promise<void> {
  const {report, stderr} = await runCli(cwd, ['--list'])
  if (!report.trim().startsWith('{')) throw new Error(stderr.trim() || 'playwright produced no JSON report')
  // Report paths are already rootDir-relative, so they are the relPath; absolutize for `file`.
  const files = [...new Set(parsePlaywrightReport(report).map((r) => r.file))]
  send({type: 'list', files: files.map((f) => ({file: join(cwd, f), relPath: f}))})
}

export async function runChild(): Promise<void> {
  const argv = process.argv.slice(2)
  const mode = flagValue(argv, '--mode') ?? 'run'
  const cwd = flagValue(argv, '--cwd') ?? process.cwd()
  try {
    await (mode === 'list' ? runList(cwd) : runTests(cwd, argv))
    process.exit(0)
  } catch (e) {
    send({type: 'error', reason: e instanceof Error ? e.message : String(e)})
    process.exit(1)
  }
}
