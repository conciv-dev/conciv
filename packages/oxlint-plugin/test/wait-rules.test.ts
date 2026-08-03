import {execFile} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {describe, expect, test} from 'vitest'

const runFile = promisify(execFile)
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const oxlintBin = join(packageDir, 'node_modules', '.bin', 'oxlint')

type Finding = {code: string; message: string}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stdoutOf(value: unknown): string {
  if (isRecord(value) && typeof value.stdout === 'string') return value.stdout
  throw new Error(`oxlint produced no stdout: ${String(value)}`)
}

function findings(payload: string): Finding[] {
  const parsed: unknown = JSON.parse(payload)
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) throw new Error(`unexpected oxlint payload: ${payload}`)
  return parsed.diagnostics
    .filter(isRecord)
    .map((diagnostic) => ({code: String(diagnostic.code), message: String(diagnostic.message)}))
}

async function lintFixture(fixture: string): Promise<Finding[]> {
  const result = await runFile(
    oxlintBin,
    ['-c', 'test/oxlintrc-waits.json', '-f', 'json', `test/fixtures/waits/${fixture}`],
    {cwd: packageDir},
  ).catch((error: unknown) => ({stdout: stdoutOf(error)}))
  return findings(result.stdout)
}

describe('conciv/no-timers-in-tests', () => {
  test('flags every timer a test schedules for itself', async () => {
    const reported = (await lintFixture('timers-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-timers-in-tests)',
    )
    expect(reported).toHaveLength(3)
    expect(reported.map((finding) => finding.message.split(' ')[0])).toEqual([
      'setTimeout',
      'setInterval',
      'setImmediate',
    ])
    expect(reported[0]?.message).toContain('Await the async surface')
  })

  test('leaves a wait that awaits a registered callback alone', async () => {
    const reported = (await lintFixture('honest-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-timers-in-tests)',
    )
    expect(reported).toEqual([])
  })
})

describe('conciv/no-predicate-waits', () => {
  test('flags exported functions and types that take a boolean-returning callback', async () => {
    const reported = (await lintFixture('testkit-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-predicate-waits)',
    )
    expect(reported).toHaveLength(2)
    expect(reported[0]?.message).toContain('turns an assertion into a wait')
  })

  test('leaves value-returning waits and unexported predicates alone', async () => {
    const reported = (await lintFixture('honest-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-predicate-waits)',
    )
    expect(reported).toEqual([])
  })
})
