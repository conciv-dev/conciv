import {uniq} from 'es-toolkit'
import {TestRunResultSchema, type Summary, type TestError, type TestRow, type TestRunResult} from './events.js'

export type {Summary, TestError, TestRow, TestRunResult}
export {initialRunView, selectEndedFiles, selectSummary, selectTests, type RunView} from './run-state.js'
export {followRunView} from './follow.js'

export type FileGroup = {readonly file: string; readonly tests: readonly TestRow[]}

const COUNT = new Intl.NumberFormat()
const SECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'second', maximumFractionDigits: 1})
const MILLISECONDS = new Intl.NumberFormat(undefined, {style: 'unit', unit: 'millisecond', maximumFractionDigits: 0})
const NARROW_SECONDS = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'second',
  unitDisplay: 'narrow',
  maximumFractionDigits: 1,
})
const NARROW_MILLISECONDS = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'millisecond',
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
})
const PLURAL = new Intl.PluralRules('en')

export const STATE_LABEL: Record<TestRow['state'], string> = {pass: 'passed', fail: 'failed', skip: 'skipped'}

export function relativePath(file: string, directory: string): string {
  const prefix = directory.endsWith('/') ? directory : `${directory}/`
  return directory && file.startsWith(prefix) ? file.slice(prefix.length) : file
}

export function pathTail(file: string): string {
  return file.split('/').slice(-2).join('/')
}

export function failureLocation(error: TestError, path: string): string {
  return error.line === undefined ? path : `${path}:${error.line}`
}

export function fixPrompt(error: TestError, path: string): string {
  return `The test "${error.name}" in ${path} is failing:\n${error.message}\nPlease look into it.`
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

export function shortDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return ms < 1000 ? NARROW_MILLISECONDS.format(Math.round(ms)) : NARROW_SECONDS.format(ms / 1000)
}

export function failingLabel(count: number): string {
  return `${COUNT.format(count)} failing ${PLURAL.select(count) === 'one' ? 'test' : 'tests'}`
}

export function failedCount(group: FileGroup): number {
  return group.tests.filter((test) => test.state === 'fail').length
}

export function testFiles(tests: readonly TestRow[]): string[] {
  return uniq(tests.map((test) => test.file)).toSorted()
}

export function fileGroup(tests: readonly TestRow[], file: string): FileGroup {
  return {file, tests: tests.filter((test) => test.file === file)}
}

export function parseRunResult(output: unknown): TestRunResult | undefined {
  const parsed = TestRunResultSchema.safeParse(output)
  return parsed.success ? parsed.data : undefined
}
