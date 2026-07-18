import {readFileSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {stripVTControlCharacters} from 'node:util'

export type Failure = {test: string; message: string}

export type PackageSummary = {
  name: string
  passed: number
  failed: number
  skipped: number
  timeMs: number
  failures: Failure[]
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

function packageName(dir: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const name = isRecord(manifest) ? asString(manifest.name) : ''
  return name === '' ? dir : name
}

function findReports(roots: string[]): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) walk(join(dir, entry.name))
      if (entry.isFile() && entry.name === 'test-results.json') found.push(join(dir, entry.name))
    }
  }
  for (const root of roots) walk(root)
  return found.toSorted()
}

export function parseReport(name: string, raw: string): PackageSummary {
  const report: unknown = JSON.parse(raw)
  const files = isRecord(report) && Array.isArray(report.testResults) ? report.testResults : []
  const summary: PackageSummary = {name, passed: 0, failed: 0, skipped: 0, timeMs: 0, failures: []}
  for (const file of files) {
    if (!isRecord(file)) continue
    summary.timeMs += Math.max(0, asNumber(file.endTime) - asNumber(file.startTime))
    const results = Array.isArray(file.assertionResults) ? file.assertionResults : []
    const failedBefore = summary.failed
    for (const result of results) {
      if (!isRecord(result)) continue
      const status = asString(result.status)
      if (status === 'passed') summary.passed += 1
      if (status === 'failed') {
        summary.failed += 1
        const messages = Array.isArray(result.failureMessages) ? result.failureMessages.map(asString) : []
        summary.failures.push({test: asString(result.fullName), message: stripVTControlCharacters(messages.join('\n'))})
      }
      if (status !== 'passed' && status !== 'failed') summary.skipped += 1
    }
    if (asString(file.status) === 'failed' && summary.failed === failedBefore) {
      summary.failed += 1
      summary.failures.push({test: asString(file.name), message: stripVTControlCharacters(asString(file.message))})
    }
  }
  return summary
}

export function loadSummaries(roots: string[]): PackageSummary[] {
  return findReports(roots).map((path) => parseReport(packageName(dirname(path)), readFileSync(path, 'utf8')))
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function seconds(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(1)}s`
}

function row(summary: PackageSummary): string {
  const icon = summary.failed > 0 ? '❌' : '✅'
  const failed = summary.failed > 0 ? `${summary.failed}` : ''
  const skipped = summary.skipped > 0 ? `${summary.skipped}` : ''
  return `| ${icon} ${summary.name} | ${summary.passed} | ${failed} | ${skipped} | ${seconds(summary.timeMs)} |`
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
      skipped: sum.skipped + entry.skipped,
      timeMs: sum.timeMs + entry.timeMs,
    }),
    {passed: 0, failed: 0, skipped: 0, timeMs: 0},
  )
  const headline =
    totals.failed > 0
      ? `❌ **${totals.failed} failed** · ${totals.passed} passed · ${seconds(totals.timeMs)}`
      : `✅ **${totals.passed} passed** · ${seconds(totals.timeMs)}`
  const lines = [
    '## Test results',
    '',
    headline,
    '',
    '| Package | Passed | Failed | Skipped | Time |',
    '| --- | --- | --- | --- | --- |',
    ...sorted.map(row),
    '',
    ...sorted.flatMap(failureSection),
  ]
  return `${lines.join('\n')}\n`
}
