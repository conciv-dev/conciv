import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliEntry = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

const WORKSPACE_DIRS = ['packages', 'packages/extensions', 'apps']

const BROWSER_ONLY = ['solid-js', 'lucide-solid', '@ark-ui/', '@conciv/ui-kit']

function manifestDirs(): string[] {
  return WORKSPACE_DIRS.flatMap((group) => {
    const groupDir = join(repoRoot, group)
    if (!existsSync(groupDir)) return []
    return readdirSync(groupDir, {withFileTypes: true})
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(groupDir, entry.name))
      .filter((dir) => existsSync(join(dir, 'package.json')))
  })
}

function workspaceDirsByName(): Record<string, string> {
  const found: Record<string, string> = {}
  for (const dir of manifestDirs()) {
    const manifest: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const name = typeof manifest === 'object' && manifest !== null && 'name' in manifest ? manifest.name : undefined
    if (typeof name === 'string') found[name] = dir
  }
  return found
}

function importTarget(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry
  if (typeof entry !== 'object' || entry === null) return undefined
  if ('import' in entry) return importTarget(entry.import)
  if ('default' in entry) return importTarget(entry.default)
  return undefined
}

function exportedFile(packageDir: string, subpath: string): string | undefined {
  const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) return undefined
  const map = manifest.exports
  if (typeof map !== 'object' || map === null) return undefined
  const key = subpath === '' ? '.' : `./${subpath}`
  if (!(key in map)) return undefined
  const target = importTarget(Reflect.get(map, key))
  return target ? resolve(packageDir, target) : undefined
}

const STATIC_SPECIFIER = /^(?:import|export)[^\n"']*["']([^"'\s]+)["'];?[^\n]*$/gm
const LAZY_SPECIFIER = /import\(\s*["'](\.[^"'\s]+)["']/g

function specifiersIn(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(STATIC_SPECIFIER), ...source.matchAll(LAZY_SPECIFIER)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  )
}

function packageNameOf(specifier: string): {name: string; subpath: string} {
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts.slice(0, 1).join('/')
  return {name, subpath: specifier.slice(name.length + 1)}
}

function existingFile(candidate: string | undefined): string | undefined {
  return candidate !== undefined && existsSync(candidate) ? candidate : undefined
}

function resolvedFrom(file: string, specifier: string, workspaces: Record<string, string>): string | undefined {
  if (specifier.startsWith('.')) return existingFile(resolve(dirname(file), specifier))
  const {name, subpath} = packageNameOf(specifier)
  const packageDir = workspaces[name]
  if (packageDir === undefined) return undefined
  return existingFile(exportedFile(packageDir, subpath))
}

function runtimeClosure(entry: string): Set<string> {
  const workspaces = workspaceDirsByName()
  const visited = new Set<string>()
  const external = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    for (const specifier of specifiersIn(file)) {
      if (!specifier.startsWith('.')) external.add(specifier)
      const next = resolvedFrom(file, specifier, workspaces)
      if (next !== undefined) queue.push(next)
    }
  }
  return external
}

test('the published CLI never loads the browser half of the widget stack', () => {
  const external = [...runtimeClosure(cliEntry)]
  const browser = external.filter((specifier) => BROWSER_ONLY.some((prefix) => specifier.startsWith(prefix)))
  expect(browser).toEqual([])
})

test('the CLI reads the tool declarations without loading the extension package index', () => {
  const external = runtimeClosure(cliEntry)
  expect([...external].filter((specifier) => specifier.startsWith('@conciv/extension'))).toEqual([
    '@conciv/extension/tool',
  ])
})
