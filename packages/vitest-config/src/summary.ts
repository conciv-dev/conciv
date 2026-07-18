import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {stripVTControlCharacters} from 'node:util'

type Failure = {test: string; message: string}

export type Coverage = {covered: number; total: number}

export type CaseStatus = 'passed' | 'failed' | 'flaky' | 'skipped'

export type CaseResult = {
  title: string
  status: CaseStatus
  durationMs: number
  retries: number
  message: string
}

export type PackageSummary = {
  name: string
  passed: number
  failed: number
  flaky: number
  skipped: number
  timeMs: number
  cases: CaseResult[]
  coverage: Coverage | null
}

export type RenderOptions = {title: string; details: boolean}

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

function countOf(cases: CaseResult[], status: CaseStatus): number {
  return cases.filter((entry) => entry.status === status).length
}

function summaryOfCases(name: string, cases: CaseResult[], timeMs: number): PackageSummary {
  return {
    name,
    passed: countOf(cases, 'passed'),
    failed: countOf(cases, 'failed'),
    flaky: countOf(cases, 'flaky'),
    skipped: countOf(cases, 'skipped'),
    timeMs,
    cases,
    coverage: null,
  }
}

function emptySummary(name: string): PackageSummary {
  return summaryOfCases(name, [], 0)
}

function failuresOf(summary: PackageSummary): Failure[] {
  return summary.cases
    .filter((entry) => entry.status === 'failed')
    .map((entry) => ({test: entry.title, message: entry.message}))
}

function vitestCaseStatus(result: Record<string, unknown>): CaseStatus {
  if (statusOf(result) === 'failed') return 'failed'
  return statusOf(result) === 'passed' ? 'passed' : 'skipped'
}

function vitestCase(result: Record<string, unknown>): CaseResult {
  const messages = Array.isArray(result.failureMessages) ? result.failureMessages.map(asString) : []
  return {
    title: asString(result.fullName),
    status: vitestCaseStatus(result),
    durationMs: asNumber(result.duration),
    retries: 0,
    message: stripVTControlCharacters(messages.join('\n')),
  }
}

function crashedWithoutAssertions(file: Record<string, unknown>): boolean {
  return (
    statusOf(file) === 'failed' && toRecords(file.assertionResults).every((result) => statusOf(result) !== 'failed')
  )
}

function fileCrashCase(file: Record<string, unknown>): CaseResult {
  return {
    title: asString(file.name),
    status: 'failed',
    durationMs: fileDuration(file),
    retries: 0,
    message: stripVTControlCharacters(asString(file.message)),
  }
}

function fileDuration(file: Record<string, unknown>): number {
  return Math.max(0, asNumber(file.endTime) - asNumber(file.startTime))
}

function summaryOfFiles(name: string, files: Record<string, unknown>[]): PackageSummary {
  const cases = [
    ...files.flatMap((file) => toRecords(file.assertionResults).map(vitestCase)),
    ...files.filter(crashedWithoutAssertions).map(fileCrashCase),
  ]
  const timeMs = files.reduce((total, file) => total + fileDuration(file), 0)
  return summaryOfCases(name, cases, timeMs)
}

function groupBy<Value>(entries: [string, Value][]): Map<string, Value[]> {
  const groups = new Map<string, Value[]>()
  for (const [key, value] of entries) groups.set(key, [...(groups.get(key) ?? []), value])
  return groups
}

const PLAYWRIGHT_STATUS: Record<string, CaseStatus> = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
}

type ProjectCase = {project: string; result: CaseResult}

function playwrightCase(titles: string[], spec: Record<string, unknown>, test: Record<string, unknown>): ProjectCase {
  const results = toRecords(test.results)
  const messages = results.flatMap((result) => toRecords(result.errors).map((error) => asString(error.message)))
  return {
    project: asString(test.projectName),
    result: {
      title: [...titles, asString(spec.title)].filter((part) => part !== '').join(' › '),
      status: PLAYWRIGHT_STATUS[statusOf(test)] ?? 'skipped',
      durationMs: results.reduce((total, result) => total + asNumber(result.duration), 0),
      retries: Math.max(0, results.length - 1),
      message: stripVTControlCharacters(messages.join('\n')),
    },
  }
}

function playwrightCases(suites: Record<string, unknown>[], titles: string[]): ProjectCase[] {
  return suites.flatMap((suite) => {
    const path = [...titles, asString(suite.title)]
    const own = toRecords(suite.specs).flatMap((spec) =>
      toRecords(spec.tests).map((test) => playwrightCase(path, spec, test)),
    )
    return [...own, ...playwrightCases(toRecords(suite.suites), path)]
  })
}

function playwrightGlobalCrashes(report: Record<string, unknown>): CaseResult[] {
  return toRecords(report.errors).map((error) => ({
    title: 'playwright run',
    status: 'failed',
    durationMs: 0,
    retries: 0,
    message: stripVTControlCharacters(asString(error.message)),
  }))
}

function playwrightTime(cases: CaseResult[]): number {
  return cases.reduce((total, entry) => total + entry.durationMs, 0)
}

function parsePlaywrightReport(reportPackage: string, report: Record<string, unknown>): PackageSummary[] {
  const cases = playwrightCases(toRecords(report.suites), [])
  const results = cases.map((entry) => entry.result)
  const byProject = groupBy(cases.map((entry): [string, CaseResult] => [entry.project, entry.result]))
  const named =
    byProject.size <= 1
      ? [summaryOfCases(reportPackage, results, playwrightTime(results))]
      : [...byProject.entries()].map(([project, grouped]) =>
          summaryOfCases(`${reportPackage} (${project})`, grouped, playwrightTime(grouped)),
        )
  const crashes = playwrightGlobalCrashes(report)
  if (crashes.length === 0) return named
  return [...named, summaryOfCases(reportPackage, crashes, 0)]
}

export function parseReport(reportPackage: string, raw: string): PackageSummary[] {
  const report: unknown = JSON.parse(raw)
  if (isRecord(report) && Array.isArray(report.suites)) return parsePlaywrightReport(reportPackage, report)
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

function toCoverage(value: unknown): Coverage | null {
  if (!isRecord(value)) return null
  return {covered: asNumber(value.covered), total: asNumber(value.total)}
}

function toCaseStatus(value: unknown): CaseStatus {
  const status = asString(value)
  if (status === 'passed' || status === 'failed' || status === 'flaky' || status === 'skipped') return status
  return 'skipped'
}

function toCaseResult(value: unknown): CaseResult {
  const record = isRecord(value) ? value : {}
  return {
    title: asString(record.title),
    status: toCaseStatus(record.status),
    durationMs: asNumber(record.durationMs),
    retries: asNumber(record.retries),
    message: stripVTControlCharacters(asString(record.message)),
  }
}

export function parseSummaries(raw: string): PackageSummary[] {
  const parsed: unknown = JSON.parse(raw)
  return toRecords(parsed).map((entry) => ({
    ...summaryOfCases(
      asString(entry.name),
      (Array.isArray(entry.cases) ? entry.cases : []).map(toCaseResult),
      asNumber(entry.timeMs),
    ),
    coverage: toCoverage(entry.coverage),
  }))
}

export function mergeSummaries(summaries: PackageSummary[]): PackageSummary[] {
  const byName = groupBy(summaries.map((summary): [string, PackageSummary] => [summary.name, summary]))
  return [...byName.entries()].map(([name, grouped]) =>
    grouped.reduce(
      (merged, entry) => ({
        ...summaryOfCases(name, [...merged.cases, ...entry.cases], merged.timeMs + entry.timeMs),
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
    ...summary,
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

function inlineText(text: string): string {
  return escapeHtml(text).replaceAll(/\s+/gu, ' ').trim()
}

function seconds(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(1)}s`
}

function coveragePct(coverage: Coverage | null): string {
  if (coverage === null || coverage.total === 0) return ''
  return `${((coverage.covered / coverage.total) * 100).toFixed(1)}%`
}

function packageIcon(summary: PackageSummary): string {
  if (summary.failed > 0) return '❌'
  return summary.flaky > 0 ? '⚠️' : '✅'
}

const CASE_ICONS: Record<CaseStatus, string> = {passed: '✅', failed: '❌', flaky: '⚠️', skipped: '⏭️'}

function blankIfZero(count: number): string {
  return count > 0 ? `${count}` : ''
}

function row(summary: PackageSummary): string {
  const cells = [
    `${packageIcon(summary)} ${summary.name}`,
    `${summary.passed}`,
    blankIfZero(summary.failed),
    blankIfZero(summary.flaky),
    blankIfZero(summary.skipped),
    coveragePct(summary.coverage),
    seconds(summary.timeMs),
  ]
  return `| ${cells.join(' | ')} |`
}

const MAX_FAILURE_CHARS = 8_000

function fencedBlock(body: string): string {
  const longestRun = [...body.matchAll(/`+/g)].reduce((longest, run) => Math.max(longest, run[0].length), 0)
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return `${fence}\n${body}\n${fence}`
}

function failureBody(message: string): string {
  if (message.length <= MAX_FAILURE_CHARS) return message
  return `${message.slice(0, MAX_FAILURE_CHARS)}\n… truncated ${message.length - MAX_FAILURE_CHARS} characters`
}

function failureSection(summary: PackageSummary): string[] {
  return failuresOf(summary).map(
    (failure) =>
      `<details>\n<summary>❌ <code>${inlineText(summary.name)}</code> ${inlineText(failure.test)}</summary>\n\n${fencedBlock(failureBody(failure.message))}\n\n</details>`,
  )
}

function caseRows(entry: CaseResult): string[] {
  const cells = [
    inlineText(entry.title),
    `${CASE_ICONS[entry.status]} ${entry.status}`,
    seconds(entry.durationMs),
    blankIfZero(entry.retries),
  ]
  const testRow = `<tr><td>${cells.join('</td><td>')}</td></tr>`
  if (entry.message === '') return [testRow]
  return [testRow, `<tr><td colspan="4"><pre>${escapeHtml(entry.message)}</pre></td></tr>`]
}

function detailsLabel(summary: PackageSummary): string {
  const counts = [
    `${summary.passed} passed`,
    ...(summary.failed > 0 ? [`${summary.failed} failed`] : []),
    ...(summary.flaky > 0 ? [`${summary.flaky} flaky`] : []),
    ...(summary.skipped > 0 ? [`${summary.skipped} skipped`] : []),
  ]
  return `${packageIcon(summary)} <code>${inlineText(summary.name)}</code> · ${counts.join(' · ')} · ${seconds(summary.timeMs)}`
}

function detailsSection(summary: PackageSummary): string {
  const header = '<tr><th>Test</th><th>Status</th><th>Duration</th><th>Retries</th></tr>'
  const rows = summary.cases.flatMap(caseRows)
  const open = summary.failed > 0 ? ' open' : ''
  return `<details${open}>\n<summary>${detailsLabel(summary)}</summary>\n<table>\n${[header, ...rows].join('\n')}\n</table>\n</details>`
}

function headline(packages: PackageSummary[]): string {
  const totals = packages.reduce(
    (sum, entry) => ({
      passed: sum.passed + entry.passed,
      failed: sum.failed + entry.failed,
      flaky: sum.flaky + entry.flaky,
      timeMs: sum.timeMs + entry.timeMs,
      coverage: mergeCoverage(sum.coverage, entry.coverage),
    }),
    {passed: 0, failed: 0, flaky: 0, timeMs: 0, coverage: null as Coverage | null},
  )
  const flakyNote = totals.flaky > 0 ? ` · ${totals.flaky} flaky` : ''
  const coverageNote = totals.coverage === null ? '' : ` · ${coveragePct(totals.coverage)} line coverage`
  if (totals.failed > 0)
    return `❌ **${totals.failed} failed** · ${totals.passed} passed${flakyNote} · ${seconds(totals.timeMs)}${coverageNote}`
  return `✅ **${totals.passed} passed**${flakyNote} · ${seconds(totals.timeMs)}${coverageNote}`
}

export function renderSummary(packages: PackageSummary[], options?: Partial<RenderOptions>): string {
  const title = options?.title ?? 'Test results'
  const sorted = packages.toSorted((a, b) => b.failed - a.failed || a.name.localeCompare(b.name))
  const sections = options?.details ? sorted.map(detailsSection) : sorted.flatMap(failureSection)
  const lines = [
    `## ${title}`,
    '',
    headline(sorted),
    '',
    '| Package | Passed | Failed | Flaky | Skipped | Coverage | Time |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...sorted.map(row),
    '',
    ...sections,
  ]
  return `${lines.join('\n')}\n`
}
