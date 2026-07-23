import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import type {ServerRouteInfo, ServerRouteKind} from '@conciv/protocol/framework-types'

const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

type ImportMap = Map<string, string>

const IMPORT_RE = /import\s*\{\s*Route as (\w+)\s*\}\s*from\s*['"]([^'"]+)['"]/g
const UPDATE_RE = /const\s+\w+\s*=\s*(\w+)\.update\(\{([\s\S]*?)\}\s*as any\)/g
const ID_RE = /id:\s*['"]([^'"]*)['"]/
const PATH_RE = /path:\s*['"]([^'"]*)['"]/

function collectImports(source: string): ImportMap {
  const map: ImportMap = new Map()
  for (const match of source.matchAll(IMPORT_RE)) {
    const name = match[1]
    const spec = match[2]
    if (name && spec) map.set(name, spec)
  }
  return map
}

function resolveFile(baseDir: string, spec: string | undefined): string | null {
  if (!spec) return null
  const resolved = resolve(baseDir, spec)
  if (existsSync(resolved)) return resolved
  for (const extension of FILE_EXTENSIONS) {
    const candidate = `${resolved}${extension}`
    if (existsSync(candidate)) return candidate
  }
  return resolved
}

function classify(id: string, path: string | null): ServerRouteKind {
  if (id === '__root__') return 'layout'
  if (path === null || path === '') return 'layout'
  return 'page'
}

function rootFrom(imports: ImportMap, baseDir: string): ServerRouteInfo | null {
  for (const [name, spec] of imports) {
    if (spec.endsWith('__root') || name === 'rootRouteImport') {
      return {path: '/', kind: 'layout', dynamic: false, file: resolveFile(baseDir, spec)}
    }
  }
  return null
}

function updateBlockToRoute(
  importName: string | undefined,
  body: string,
  imports: ImportMap,
  baseDir: string,
): ServerRouteInfo | null {
  const id = ID_RE.exec(body)?.[1]
  if (id === undefined) return null
  const path = PATH_RE.exec(body)?.[1] ?? null
  const effectivePath = path ?? id
  const spec = importName ? imports.get(importName) : undefined
  return {
    path: effectivePath,
    kind: classify(id, path),
    dynamic: effectivePath.includes('$'),
    file: resolveFile(baseDir, spec),
  }
}

function parseRouteManifest(source: string, baseDir: string): ServerRouteInfo[] {
  const imports = collectImports(source)
  const root = rootFrom(imports, baseDir)
  const routes: ServerRouteInfo[] = root ? [root] : []
  for (const match of source.matchAll(UPDATE_RE)) {
    const route = updateBlockToRoute(match[1], match[2] ?? '', imports, baseDir)
    if (route) routes.push(route)
  }
  return routes
}

export async function readRouteManifest(cwd: string): Promise<ServerRouteInfo[]> {
  const genPath = join(cwd, 'src', 'routeTree.gen.ts')
  const source = await readFile(genPath, 'utf8')
  return parseRouteManifest(source, dirname(genPath))
}
