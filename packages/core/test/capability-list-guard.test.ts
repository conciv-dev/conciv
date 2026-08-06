import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {builtinToolNames} from '@conciv/tools/builtins'

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

const MULTI_SEGMENT_NAME = /^[a-z][a-zA-Z0-9]*[._][a-zA-Z0-9_.]+$/

function declaredNamesIn(text: string): string[] {
  if (!text.includes('defineTool(') && !text.includes('toolDefinition(')) return []
  const named = [...text.matchAll(/name: '([^']+)'/g)].map((match) => match[1] ?? '')
  const mapKeys = [...text.matchAll(/'([^']+)':/g)].map((match) => match[1] ?? '')
  return [...named, ...mapKeys].filter(Boolean)
}

const declarationsByFile = new Map(scannedFiles.map((path) => [path, declaredNamesIn(readFileSync(path, 'utf8'))]))

const capabilityNames = [...new Set([...builtinToolNames(), ...[...declarationsByFile.values()].flat()])].filter(
  (name) => MULTI_SEGMENT_NAME.test(name),
)

function withoutMapIndexing(text: string): string {
  return text.replaceAll(/\[\s*'[^']+'\s*\]/g, '[]')
}

function foreignNamesIn(path: string): string[] {
  const text = withoutMapIndexing(readFileSync(path, 'utf8'))
  const declared = new Set(declarationsByFile.get(path))
  return capabilityNames.filter(
    (name) => !declared.has(name) && (text.includes(`'${name}'`) || text.includes(`"${name}"`)),
  )
}

describe('capability lists live in the registry declarations only', () => {
  test('the scan is grounded: it sees the builtins, the extension declarations, and the source tree', () => {
    expect(capabilityNames).toContain('server.config')
    expect(capabilityNames).toContain('canvas.draw')
    expect(capabilityNames).toContain('recording_start')
    expect(capabilityNames.length).toBeGreaterThan(40)
    expect(scannedFiles.length).toBeGreaterThan(200)
  })

  test('no source file outside a declaration site enumerates registered capability names', () => {
    const violations = scannedFiles
      .map((path) => ({path: relative(workspaceRoot, path), names: foreignNamesIn(path)}))
      .filter((entry) => entry.names.length >= 2)
    expect(violations, 'these files carry a capability-keyed list outside the registry declarations').toEqual([])
  })
})
