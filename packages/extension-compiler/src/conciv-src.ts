import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const nameCache = new Map<string, string | null>()

function manifestName(path: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
      return parsed.name
    }
    return null
  } catch {
    return null
  }
}

function packageNameFor(dir: string): string | null {
  const cached = nameCache.get(dir)
  if (cached !== undefined) return cached
  const own = manifestName(join(dir, 'package.json'))
  const parent = dirname(dir)
  const resolved = own ?? (parent === dir ? null : packageNameFor(parent))
  nameCache.set(dir, resolved)
  return resolved
}

const isConcivName = (name: string) => name.startsWith('@conciv/')

type JsxConfig = {
  jsx: string | null
  jsxImportSource: string | null
}

type RawTsconfig = {
  jsx: unknown
  jsxImportSource: unknown
  extends: unknown
}

function parseTsconfig(path: string): RawTsconfig | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    const rawCompilerOptions = record.compilerOptions
    const compilerOptions =
      typeof rawCompilerOptions === 'object' && rawCompilerOptions !== null
        ? (rawCompilerOptions as Record<string, unknown>)
        : {}
    return {jsx: compilerOptions.jsx, jsxImportSource: compilerOptions.jsxImportSource, extends: record.extends}
  } catch {
    return null
  }
}

function resolveExtendsPath(fromPath: string, extendsValue: string): string | null {
  if (!extendsValue.startsWith('.')) return null
  const joined = join(dirname(fromPath), extendsValue)
  return joined.endsWith('.json') ? joined : `${joined}.json`
}

function resolveJsxConfig(path: string, visited: Set<string>): JsxConfig {
  if (visited.has(path)) return {jsx: null, jsxImportSource: null}
  visited.add(path)
  const raw = parseTsconfig(path)
  if (raw === null) return {jsx: null, jsxImportSource: null}
  const ownJsx = typeof raw.jsx === 'string' ? raw.jsx : null
  const ownJsxImportSource = typeof raw.jsxImportSource === 'string' ? raw.jsxImportSource : null
  if (typeof raw.extends !== 'string') return {jsx: ownJsx, jsxImportSource: ownJsxImportSource}
  const extendsPath = resolveExtendsPath(path, raw.extends)
  if (extendsPath === null) return {jsx: ownJsx, jsxImportSource: ownJsxImportSource}
  const parentConfig = resolveJsxConfig(extendsPath, visited)
  return {
    jsx: ownJsx ?? parentConfig.jsx,
    jsxImportSource: ownJsxImportSource ?? parentConfig.jsxImportSource,
  }
}

const tsconfigCache = new Map<string, JsxConfig | null>()

function jsxConfigFor(dir: string): JsxConfig | null {
  const cached = tsconfigCache.get(dir)
  if (cached !== undefined) return cached
  const ownTsconfig = join(dir, 'tsconfig.json')
  const parent = dirname(dir)
  const resolved = existsSync(ownTsconfig)
    ? resolveJsxConfig(ownTsconfig, new Set())
    : parent === dir
      ? null
      : jsxConfigFor(parent)
  tsconfigCache.set(dir, resolved)
  return resolved
}

function isNonSolidJsx(config: JsxConfig | null): boolean {
  if (config === null) return false
  if (config.jsxImportSource !== null && config.jsxImportSource !== 'solid-js') return true
  if ((config.jsx === 'react-jsx' || config.jsx === 'react-jsxdev') && config.jsxImportSource !== 'solid-js') {
    return true
  }
  return false
}

export function concivSrcEntry(resolvedPath: string): string | null {
  if (resolvedPath.includes('node_modules')) return null
  const extension = ['.jsx', '.js'].find((candidate) => resolvedPath.endsWith(candidate))
  if (extension === undefined) return null
  const marker = resolvedPath.lastIndexOf('/dist/')
  if (marker === -1) return null
  const stem = resolvedPath.slice(marker + '/dist/'.length, -extension.length)
  const srcStem = `${resolvedPath.slice(0, marker)}/src/${stem}`
  const srcCandidate = [`${srcStem}.tsx`, `${srcStem}.ts`].find((candidate) => existsSync(candidate)) ?? null
  if (srcCandidate === null) return null
  if (isNonSolidJsx(jsxConfigFor(dirname(srcCandidate)))) return null
  return srcCandidate
}

export function isConcivSrcTsx(id: string): boolean {
  const file = id.split('?')[0] ?? id
  if (!file.endsWith('.tsx')) return false
  if (!/[\\/]src[\\/]/.test(file)) return false
  if (file.includes('node_modules')) return false
  const name = packageNameFor(dirname(file))
  return name !== null && isConcivName(name)
}
