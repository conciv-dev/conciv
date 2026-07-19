import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'

export const EXAMPLES_DIR = 'apps/examples'

const TEST_DIR_NAMES = ['test', 'tests', '__tests__', 'e2e']
const TEST_CONFIG_PATTERN = /^(vitest|playwright|jest|cypress)\.config\./
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/
const TEST_SCRIPT_PATTERN = /^(test|e2e)(:|$)/
const TEST_DEP_PATTERN = /^(vitest|jest|cypress|playwright|@playwright\/|@vitest\/|@testing-library\/)/

export type ExampleAppViolation = {app: string; kind: 'file' | 'directory' | 'script' | 'dependency'; detail: string}

function walk(dir: string, rootRelative: string, found: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const relative = rootRelative === '' ? entry : `${rootRelative}/${entry}`
    if (statSync(full).isDirectory()) {
      if (TEST_DIR_NAMES.includes(entry)) found.push(`${relative}/`)
      else walk(full, relative, found)
      continue
    }
    if (TEST_FILE_PATTERN.test(entry) || TEST_CONFIG_PATTERN.test(entry)) found.push(relative)
  }
}

export function findExampleAppTestSetup(rootDir: string): ExampleAppViolation[] {
  const examplesDir = join(rootDir, EXAMPLES_DIR)
  if (!existsSync(examplesDir)) return []
  const violations: ExampleAppViolation[] = []
  for (const app of readdirSync(examplesDir)) {
    const appDir = join(examplesDir, app)
    if (!statSync(appDir).isDirectory()) continue
    const found: string[] = []
    walk(appDir, '', found)
    for (const entry of found) {
      violations.push({app, kind: entry.endsWith('/') ? 'directory' : 'file', detail: entry})
    }
    const manifestPath = join(appDir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest !== 'object' || manifest === null) continue
    const record = manifest as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const name of Object.keys(record.scripts ?? {})) {
      if (TEST_SCRIPT_PATTERN.test(name)) violations.push({app, kind: 'script', detail: name})
    }
    for (const name of Object.keys({...record.dependencies, ...record.devDependencies})) {
      if (TEST_DEP_PATTERN.test(name)) violations.push({app, kind: 'dependency', detail: name})
    }
  }
  return violations
}

export function describeExampleAppViolations(violations: ExampleAppViolation[]): string {
  const lines = violations.map((entry) => `  ${EXAMPLES_DIR}/${entry.app}: ${entry.kind} ${entry.detail}`)
  return [
    `Example apps are demos and must not carry tests (${violations.length} found):`,
    ...lines,
    '',
    'Move the coverage to the owning package, @conciv/extension-testkit, or an e2e/ consumer app.',
  ].join('\n')
}
