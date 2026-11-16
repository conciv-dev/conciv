import {TestRunResultSchema, type Summary, type TestError, type TestRow, type TestRunResult} from './shared/events.js'

export type {TestError, TestRow, TestRunResult}

export type FileGroup = {readonly file: string; readonly tests: readonly TestRow[]}

const COUNT = new Intl.NumberFormat()
const SECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'second', maximumFractionDigits: 1})
const MILLISECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'millisecond', maximumFractionDigits: 0})
const PLURAL = new Intl.PluralRules('en')

export const STATE_LABEL: Record<TestRow['state'], string> = {pass: 'passed', fail: 'failed', skip: 'skipped'}

export function relativePath(file: string, directory: string): string {
  const prefix = directory.endsWith('/') ? directory : `${directory}/`
  return directory && file.startsWith(prefix) ? file.slice(prefix.length) : file
}

export function failureLocation(error: TestError, directory: string): string {
  const path = relativePath(error.file, directory)
  return error.line === undefined ? path : `${path}:${error.line}`
}

export function fixPrompt(error: TestError, directory: string): string {
  return `The test "${error.name}" in ${relativePath(error.file, directory)} is failing:\n${error.message}\nPlease look into it.`
}

export function countLabel(count: number, verb: string): string {
  return `${COUNT.format(count)} ${verb}`
}

export function counts(summary: Summary): string {
  return [
    countLabel(summary.passed, 'passed'),
    countLabel(summary.failed, 'failed'),
    countLabel(summary.skipped, 'skipped'),
  ].join(', ')
}

export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return ms < 1000 ? MILLISECONDS.format(Math.round(ms)) : SECONDS.format(ms / 1000)
}

export function failingLabel(count: number): string {
  return `${COUNT.format(count)} failing ${PLURAL.select(count) === 'one' ? 'test' : 'tests'}`
}

export function failedCount(group: FileGroup): number {
  return group.tests.filter((test) => test.state === 'fail').length
}

export function groupByFile(tests: readonly TestRow[]): FileGroup[] {
  return Object.entries(Object.groupBy(tests, (test) => test.file)).map(([file, rows]) => ({file, tests: rows ?? []}))
}

export function parseRunResult(output: unknown): TestRunResult | undefined {
  const parsed = TestRunResultSchema.safeParse(output)
  return parsed.success ? parsed.data : undefined
}
