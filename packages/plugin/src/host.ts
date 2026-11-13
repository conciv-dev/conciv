import {existsSync, readFileSync, statSync} from 'node:fs'
import {registerHooks} from 'node:module'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {constants, Script} from 'node:vm'
import {z} from 'zod'

export interface Target {
  readonly directory: string
  readonly name?: string
}

export interface Entrypoints {
  readonly server?: string
  readonly rpc?: string
  /**
   * The prebuilt CommonJS bundle of the app part (`./plugin-experimental`, or `plugin-experimental.cjs` or
   * `plugin-experimental.js` in a local directory without `exports`). In a local directory without `exports` it may
   * instead be the TypeScript source `plugin-experimental.tsx` or `plugin-experimental.ts`, which the bundler
   * integration compiles. Each page the conciv app shows runs its default export.
   */
  readonly experimental?: string
}

export function resolve(input: Target): Entrypoints {
  const manifest = input.name ? undefined : packageManifest(input.directory)
  const target =
    typeof manifest?.name === 'string' && manifest.exports !== undefined ? {...input, name: manifest.name} : input
  const entry = (subpaths: readonly string[]) => {
    for (const subpath of subpaths) {
      const specifier = target.name
        ? [target.name, subpath].filter(Boolean).join('/')
        : path.resolve(target.directory, subpath || 'index')
      try {
        const resolved = resolveModule(specifier, target.directory)
        if (resolved) return resolved
      } catch (error) {
        if (!hasCode(error, resolutionMisses)) throw error
      }
    }
    return undefined
  }
  return {
    server: entry(['server', '']),
    rpc: entry(['rpc']),
    experimental: target.name
      ? [entry(['plugin-experimental'])].find((file) => file && /\.c?js$/.test(file))
      : entry([
          'plugin-experimental.cjs',
          'plugin-experimental.js',
          'plugin-experimental.tsx',
          'plugin-experimental.ts',
        ]),
  }
}

export function load(entrypoint: string): Promise<unknown> {
  return importModule(entrypoint)
}

/**
 * The id of a plugin without an engine part: its package name, or a local directory's name when it has no
 * package.json name. An engine part names its plugin in `Plugin.define` instead.
 */
export function packageId(target: Target) {
  if (target.name) return target.name
  const name = packageManifest(target.directory)?.name
  return typeof name === 'string' && name ? name : path.basename(target.directory)
}

const resolutionMisses = [
  'ENOENT',
  'ENOTDIR',
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_UNSUPPORTED_DIR_IMPORT',
]

const fileMisses = ['ENOENT', 'ENOTDIR', 'ERR_MODULE_NOT_FOUND']

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs']

const CodedError = z.object({code: z.unknown()})

function hasCode(error: unknown, codes: readonly string[]) {
  const parsed = CodedError.safeParse(error)
  return error instanceof Error && parsed.success && codes.includes(String(parsed.data.code))
}

async function importModule(specifier: string) {
  const imported: unknown = await new Script(`import(${JSON.stringify(specifier)})`, {
    importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  }).runInThisContext()
  if (typeof imported !== 'object' || imported === null) return imported
  const exports: unknown = Reflect.get(imported, 'module.exports')
  if (
    exports !== Reflect.get(imported, 'default') ||
    (typeof exports !== 'object' && typeof exports !== 'function') ||
    exports === null
  )
    return imported
  return Object.assign({}, imported, exports)
}

function resolveModule(specifier: string, directory: string) {
  if (path.isAbsolute(specifier)) return resolveFile(specifier)
  const hook = registerHooks({
    resolve(next, context, nextResolve) {
      return nextResolve(next, {...context, parentURL: pathToFileURL(path.join(directory, 'package.json')).href})
    },
  })
  try {
    return resolvePackage(specifier)
  } finally {
    hook.deregister()
  }
}

function resolveFile(target: string) {
  const candidates = path.extname(target) ? [target] : [target, ...extensions.map((extension) => target + extension)]
  const file = candidates.find((candidate) => statSync(candidate, {throwIfNoEntry: false})?.isFile())
  return file && pathToFileURL(file).href
}

function resolvePackage(specifier: string) {
  try {
    return resolveExisting(specifier)
  } catch (error) {
    if (path.extname(specifier) || !hasCode(error, fileMisses)) throw error
    for (const extension of extensions) {
      try {
        return resolveExisting(specifier + extension)
      } catch (cause) {
        if (!hasCode(cause, fileMisses)) throw cause
      }
    }
    throw error
  }
}

function resolveExisting(specifier: string) {
  const resolved = import.meta.resolve(specifier)
  if (resolved.startsWith('file:')) statSync(new URL(resolved))
  return resolved
}

const Manifest = z.object({name: z.unknown().optional(), exports: z.unknown().optional()})

function packageManifest(directory: string) {
  const file = path.join(directory, 'package.json')
  if (!existsSync(file)) return undefined
  const parsed = Manifest.safeParse(parseJson(readFileSync(file, 'utf8')))
  return parsed.success ? parsed.data : undefined
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
