import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test', 'tests', 'e2e'])

const NON_SOURCE_FILE = /\.(test|test-d|stories|browser\.test|it\.test)\.tsx?$/

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    if (!/\.tsx?$/.test(entry) || NON_SOURCE_FILE.test(entry)) continue
    found.push(path)
  }
  return found
}

const scannedFiles = [join(workspaceRoot, 'packages'), join(workspaceRoot, 'apps', 'conciv')]
  .flatMap(sourceFiles)
  .filter((path) => relative(workspaceRoot, path).split('/').includes('src'))

const RETIRED_PAGE_CHAIN_NAMES = [
  /\bDOM_HANDLERS\b/,
  /\bPAGE_QUERY_KINDS\b/,
  /\bPageVerbMap\b/,
  /\bpage\.run\b/,
  /\bdispatchExtVerb\b/,
  /\bscopedPageCaller\b/,
  /\bBUILTIN_PAGE_TOOLS\b/,
  /\bcallPageVerb\b/,
  /\bMUTATING_KINDS\b/,
  /\bMIRROR_KINDS\b/,
]

describe('the pre-dispatcher page plumbing stays deleted', () => {
  test('the scan is grounded: it walks the shipped source tree', () => {
    expect(scannedFiles.length).toBeGreaterThan(200)
    const scanned = scannedFiles.map((path) => relative(workspaceRoot, path))
    expect(scanned).toContain('packages/extensions/page/src/shared/defs.ts')
    expect(scanned).toContain('packages/core/src/tool-registry.ts')
  })

  test('no shipped source file mentions a retired page-chain identifier', () => {
    const hits = scannedFiles.flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      return RETIRED_PAGE_CHAIN_NAMES.filter((pattern) => pattern.test(text)).map((pattern) => ({
        file: relative(workspaceRoot, path),
        pattern: String(pattern),
      }))
    })
    expect(hits, 'these files resurrect pre-dispatcher page plumbing').toEqual([])
  })
})
