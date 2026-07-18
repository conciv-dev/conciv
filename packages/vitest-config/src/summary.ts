import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {stripVTControlCharacters} from 'node:util'

export type Failure = {test: string; message: string}

export type Coverage = {covered: number; total: number}

export type PackageSummary = {
  name: string
  passed: number
  failed: number
  skipped: number
  timeMs: number
  failures: Failure[]
  coverage: Coverage | null
}

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.turbo', '.git', 'test', 'src'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function manifestName(dir: string): string {
  const manifest = readJson(join(dir, 'package.json'))
  const name = isRecord(manifest) ? asString(manifest.name) : ''
  return name === '' ? dir : name
}

const packageByDir = new Map<string, string | null>()

function owningPackage(dir: string): string | null {
  const cached = packageByDir.get(dir)
  if (cached !== undefined) return cached
  const parent = dirname(dir)
  const resolved = existsSync(join(dir, 'package.json'))
    ? manifestName(dir)
    : parent === dir
      ? null
      : owningPackage(parent)
  packageByDir.set(dir, resolved)
  return resolved
}

function findFiles(roots: string[], fileName: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) walk(join(dir, entry.name))
      if (entry.isFile() && entry.name === fileName) found.push(join(dir, entry.name))
    }
  }
  for (const root of roots) walk(root)
  return found.toSorted()
}

function statusOf(result: Record<string, unknown>): string {
  return asString(result.status)
}

function assertionFailure(result: Record<string, unknown>): Failure {
  const messages = Array.isArray(result.failureMessages) ? result.failureMessages.map(asString) : []
  return {test: asString(result.fullName), message: stripVTControlCharacters(messages.join('\n'))}
}

function crashedWithoutAssertions(file: Record<string, unknown>): boolean {
  return (
    statusOf(file) === 'failed' && toRecords(file.assertionResults).every((result) => statusOf(result) !== 'failed')
  )
}

function fileFailure(file: Record<string, unknown>): Failure {
  return {test: asString(file.name), message: stripVTControlCharacters(asString(file.message))}
}

function fileDuration(file: Record<string, unknown>): number {
  return Math.max(0, asNumber(file.endTime) - asNumber(file.startTime))
}

function emptySummary(name: string): PackageSummary {
  return {name, passed: 0, failed: 0, skipped: 0, timeMs: 0, failures: [], coverage: null}
}

function summaryOfFiles(name: string, files: Record<string, unknown>[]): PackageSummary {
  const assertions = files.flatMap((file) => toRecords(file.assertionResults))
  const failures = [
    ...assertions.filter((result) => statusOf(result) === 'failed').map(assertionFailure),
    ...files.filter(crashedWithoutAssertions).map(fileFailure),
  ]
  return {
    name,
    passed: assertions.filter((result) => statusOf(result) === 'passed').length,
    failed: failures.length,
    skipped: assertions.filter((result) => statusOf(result) !== 'passed' && statusOf(result) !== 'failed').length,
    timeMs: files.reduce((total, file) => total + fileDuration(file), 0),
    failures,
    coverage: null,
  }
}

function groupBy<Value>(entries: [string, Value][]): Map<string, Value[]> {
  const groups = new Map<string, Value[]>()
  for (const [key, value] of entries) groups.set(key, [...(groups.get(key) ?? []), value])
  return groups
}

export function parseReport(reportPackage: string, raw: string): PackageSummary[] {
  const report: unknown = JSON.parse(raw)
  const files = toRecords(isRecord(report) ? report.testResults : [])
  const byPackage = groupBy(
    files.map((file): [string, Record<string, unknown>] => {
      const path = asString(file.name)
      const owner = path === '' ? null : owningPackage(dirname(path))
      return [owner ?? reportPackage, file]
    }),
  )
  if (byPackage.size === 0) return [emptySummary(reportPackage)]
  return [...byPackage.entries()].map(([name, grouped]) => summaryOfFiles(name, grouped))
}

function coverageOfEntry(entry: Record<string, unknown>): Coverage {
  const lines = isRecord(entry.lines) ? entry.lines : {}
  return {covered: asNumber(lines.covered), total: asNumber(lines.total)}
}

export function parseCoverage(reportPackage: string, raw: string): Map<string, Coverage> {
  const report: unknown = JSON.parse(raw)
  const entries = isRecord(report) ? Object.entries(report).filter(([key]) => key !== 'total') : []
  const byPackage = groupBy(
    entries.map(([path, entry]): [string, Coverage] => [
      owningPackage(dirname(path)) ?? reportPackage,
      isRecord(entry) ? coverageOfEntry(entry) : {covered: 0, total: 0},
    ]),
  )
  return new Map(
    [...byPackage.entries()].map(([name, coverages]) => [
      name,
      coverages.reduce((sum, entry) => ({covered: sum.covered + entry.covered, total: sum.total + entry.total}), {
        covered: 0,
        total: 0,
      }),
    ]),
  )
}

function mergeSummaries(summaries: PackageSummary[]): PackageSummary[] {
  const byName = groupBy(summaries.map((summary): [string, PackageSummary] => [summary.name, summary]))
  return [...byName.entries()].map(([name, grouped]) =>
    grouped.reduce(
      (merged, entry) => ({
        name,
        passed: merged.passed + entry.passed,
        failed: merged.failed + entry.failed,
        skipped: merged.skipped + entry.skipped,
        timeMs: merged.timeMs + entry.timeMs,
        failures: [...merged.failures, ...entry.failures],
        coverage: mergeCoverage(merged.coverage, entry.coverage),
      }),
      emptySummary(name),
    ),
  )
}

function mergeCoverage(left: Coverage | null, right: Coverage | null): Coverage | null {
  if (left === null) return right
  if (right === null) return left
  return {covered: left.covered + right.covered, total: left.total + right.total}
}

function attachCoverage(summaries: PackageSummary[], coverage: Map<string, Coverage>): PackageSummary[] {
  return summaries.map((summary) => ({
    name: summary.name,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    timeMs: summary.timeMs,
    failures: summary.failures,
    coverage: mergeCoverage(summary.coverage, coverage.get(summary.name) ?? null),
  }))
}

export function loadSummaries(roots: string[]): PackageSummary[] {
  const summaries = findFiles(roots, 'test-results.json').flatMap((path) => {
    const reportDir = dirname(path)
    const reportPackage = manifestName(reportDir)
    const parsed = parseReport(reportPackage, readFileSync(path, 'utf8'))
    const coveragePath = join(reportDir, 'coverage', 'coverage-summary.json')
    if (!existsSync(coveragePath)) return parsed
    return attachCoverage(parsed, parseCoverage(reportPackage, readFileSync(coveragePath, 'utf8')))
  })
  return mergeSummaries(summaries)
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function seconds(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(1)}s`
}

function coveragePct(coverage: Coverage | null): string {
  if (coverage === null || coverage.total === 0) return ''
  return `${((coverage.covered / coverage.total) * 100).toFixed(1)}%`
}

function row(summary: PackageSummary): string {
  const icon = summary.failed > 0 ? '❌' : '✅'
  const failed = summary.failed > 0 ? `${summary.failed}` : ''
  const skipped = summary.skipped > 0 ? `${summary.skipped}` : ''
  return `| ${icon} ${summary.name} | ${summary.passed} | ${failed} | ${skipped} | ${coveragePct(summary.coverage)} | ${seconds(summary.timeMs)} |`
}

function failureSection(summary: PackageSummary): string[] {
  return summary.failures.map(
    (failure) =>
      `<details>\n<summary>❌ <code>${escapeHtml(summary.name)}</code> ${escapeHtml(failure.test)}</summary>\n\n\`\`\`\n${failure.message}\n\`\`\`\n\n</details>`,
  )
}

export function renderSummary(packages: PackageSummary[]): string {
  const sorted = packages.toSorted((a, b) => b.failed - a.failed || a.name.localeCompare(b.name))
  const totals = sorted.reduce(
    (sum, entry) => ({
      passed: sum.passed + entry.passed,
      failed: sum.failed + entry.failed,
      timeMs: sum.timeMs + entry.timeMs,
      coverage: mergeCoverage(sum.coverage, entry.coverage),
    }),
    {passed: 0, failed: 0, timeMs: 0, coverage: null as Coverage | null},
  )
  const coverageNote = totals.coverage === null ? '' : ` · ${coveragePct(totals.coverage)} line coverage`
  const headline =
    totals.failed > 0
      ? `❌ **${totals.failed} failed** · ${totals.passed} passed · ${seconds(totals.timeMs)}${coverageNote}`
      : `✅ **${totals.passed} passed** · ${seconds(totals.timeMs)}${coverageNote}`
  const lines = [
    '## Test results',
    '',
    headline,
    '',
    '| Package | Passed | Failed | Skipped | Coverage | Time |',
    '| --- | --- | --- | --- | --- | --- |',
    ...sorted.map(row),
    '',
    ...sorted.flatMap(failureSection),
  ]
  return `${lines.join('\n')}\n`
}
