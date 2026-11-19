import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {addSourceToJsx} from '@tanstack/devtools-bundler-core'

const UNSTAMPED_PATHS = ['?raw', '/dist/', '/build/', 'node_modules']

const SOLID_SINGLETONS = [
  'solid-js',
  'solid-js/web',
  'solid-js/store',
  '@tanstack/solid-router',
  '@ark-ui/solid',
  '@conciv/plugin',
]

function readPackageName(id: string): string {
  const segments = id.split('/')
  return id.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? id)
}

function resolvableFrom(id: string, root: string): boolean {
  let dir = root
  while (true) {
    if (existsSync(join(dir, 'node_modules', readPackageName(id), 'package.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

export function concivSolidConfig(opts: {root?: string; warmupFiles?: readonly string[]} = {}) {
  const root = opts.root
  const singletons =
    root === undefined ? [...SOLID_SINGLETONS] : SOLID_SINGLETONS.filter((id) => resolvableFrom(id, root))
  return {
    resolve: {dedupe: singletons},
    optimizeDeps: {
      exclude: singletons,
      include: [],
    },
    server: {forwardConsole: false, warmup: {clientFiles: [...(opts.warmupFiles ?? [])]}},
  }
}

export function dropIncludedFromExcludes(
  optimizeDeps: {include?: string[]; exclude?: string[]} | undefined,
  managedIds: readonly string[],
): void {
  if (!optimizeDeps?.exclude?.length) return
  const included = new Set(optimizeDeps.include ?? [])
  const managed = new Set(managedIds)
  optimizeDeps.exclude = optimizeDeps.exclude.filter((id) => !(managed.has(id) && included.has(id)))
}

export function stampJsxSource(code: string, id: string): ReturnType<typeof addSourceToJsx> | null {
  if (UNSTAMPED_PATHS.some((part) => id.includes(part))) return null
  return addSourceToJsx(code, id) ?? null
}
