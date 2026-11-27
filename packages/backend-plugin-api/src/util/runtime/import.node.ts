import {statSync} from 'node:fs'
import {stat} from 'node:fs/promises'
import {registerHooks} from 'node:module'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {constants, Script} from 'node:vm'
import {z} from 'zod'
import {pluginHostErrors} from '@conciv/errors'

export async function importModule(specifier: string) {
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

export async function resolveModule(specifier: string, directory: string) {
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

async function resolveFile(target: string) {
  const candidates = path.extname(target) ? [target] : [target, ...extensions.map((extension) => target + extension)]
  const files = await Promise.all(candidates.map(existingFile))
  const file = files.find((candidate) => candidate !== undefined)
  return file && pathToFileURL(file).href
}

async function existingFile(candidate: string) {
  const stats = await stat(candidate).catch((error: unknown) => {
    if (missing(error)) return undefined
    throw error
  })
  return stats?.isFile() ? candidate : undefined
}

function resolvePackage(specifier: string) {
  try {
    return resolveExisting(specifier)
  } catch (error) {
    if (path.extname(specifier) || !missing(error)) throw error
    for (const extension of extensions) {
      try {
        return resolveExisting(specifier + extension)
      } catch (cause) {
        if (!missing(cause)) throw cause
      }
    }
    throw error
  }
}

function resolveExisting(specifier: string) {
  const resolved = import.meta.resolve(specifier)
  if (resolved.startsWith('file:') && !statSync(new URL(resolved)).isFile())
    throw pluginHostErrors.MODULE_FILE_MISSING({resolved})
  return resolved
}

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs']

const CodedError = z.object({code: z.unknown()})

function missing(error: unknown) {
  const parsed = CodedError.safeParse(error)
  return (
    error instanceof Error &&
    parsed.success &&
    ['ENOENT', 'ENOTDIR', 'ERR_MODULE_NOT_FOUND', pluginHostErrors.MODULE_FILE_MISSING.code].includes(
      String(parsed.data.code),
    )
  )
}
