import {Effect, FileSystem, Option, Path} from 'effect'
import {ManifestUnreadable} from './failures.js'
import type {RouteInfo, RouteInfoKind} from './rpc.js'

const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

type ImportMap = Readonly<Record<string, string>>

const IMPORT_RE = /import\s*\{\s*Route as (\w+)\s*\}\s*from\s*['"]([^'"]+)['"]/g
const UPDATE_RE = /const\s+\w+\s*=\s*(\w+)\.update\(\{([\s\S]*?)\}\s*as any\)/g
const ID_RE = /id:\s*['"]([^'"]*)['"]/
const PATH_RE = /path:\s*['"]([^'"]*)['"]/

function collectImports(source: string): ImportMap {
  return Object.fromEntries(
    [...source.matchAll(IMPORT_RE)].flatMap(([, name, spec]) => (name && spec ? [[name, spec] as const] : [])),
  )
}

const resolveFile = Effect.fn('tanstack.routeManifest.resolveFile')(function* (
  baseDir: string,
  spec: string | undefined,
) {
  if (!spec) return null
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const resolved = path.resolve(baseDir, spec)
  const found = yield* Effect.findFirst(
    [resolved, ...FILE_EXTENSIONS.map((extension) => `${resolved}${extension}`)],
    (candidate) => fs.exists(candidate).pipe(Effect.orElseSucceed(() => false)),
  )
  return Option.getOrElse(found, () => resolved)
})

function classify(id: string, path: string | null): RouteInfoKind {
  if (id === '__root__') return 'layout'
  if (path === null || path === '') return 'layout'
  return 'page'
}

const rootFrom = Effect.fn('tanstack.routeManifest.root')(function* (imports: ImportMap, baseDir: string) {
  const root = Object.entries(imports).find(([name, spec]) => spec.endsWith('__root') || name === 'rootRouteImport')
  if (!root) return []
  const route: RouteInfo = {path: '/', kind: 'layout', dynamic: false, file: yield* resolveFile(baseDir, root[1])}
  return [route]
})

const updateBlockToRoute = Effect.fn('tanstack.routeManifest.route')(function* (
  importName: string | undefined,
  body: string,
  imports: ImportMap,
  baseDir: string,
) {
  const id = ID_RE.exec(body)?.[1]
  if (id === undefined) return []
  const path = PATH_RE.exec(body)?.[1] ?? null
  const effectivePath = path ?? id
  const spec = importName ? imports[importName] : undefined
  const route: RouteInfo = {
    path: effectivePath,
    kind: classify(id, path),
    dynamic: effectivePath.includes('$'),
    file: yield* resolveFile(baseDir, spec),
  }
  return [route]
})

export const readRouteManifest = Effect.fn('tanstack.routeManifest.read')(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const genPath = path.join(cwd, 'src', 'routeTree.gen.ts')
  const source = yield* fs
    .readFileString(genPath)
    .pipe(Effect.mapError((cause) => ManifestUnreadable.make({message: cause.message, cause})))
  const baseDir = path.dirname(genPath)
  const imports = collectImports(source)
  const root = yield* rootFrom(imports, baseDir)
  const routes = yield* Effect.forEach([...source.matchAll(UPDATE_RE)], (match) =>
    updateBlockToRoute(match[1], match[2] ?? '', imports, baseDir),
  )
  return [...root, ...routes.flat()]
})
