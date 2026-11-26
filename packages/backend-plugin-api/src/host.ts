import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {z} from 'zod'
import {importModule, resolveModule} from './util/runtime-import.js'

export interface Target {
  readonly directory: string
  readonly name?: string
}

export interface Entrypoints {
  readonly server?: string
  readonly rpc?: string
  readonly experimental?: string
}

export async function resolve(input: Target): Promise<Entrypoints> {
  const manifest = input.name ? undefined : await packageManifest(input.directory)
  const target =
    typeof manifest?.name === 'string' && manifest.exports !== undefined ? {...input, name: manifest.name} : input
  const entry = async (subpaths: readonly string[]) => {
    for (const subpath of subpaths) {
      const specifier = target.name
        ? [target.name, subpath].filter(Boolean).join('/')
        : path.resolve(target.directory, subpath || 'index')
      try {
        const resolved = await resolveModule(specifier, target.directory)
        if (resolved) return resolved
      } catch (error) {
        if (!hasCode(error, resolutionMisses)) throw error
      }
    }
    return undefined
  }
  const experimental = await (target.name
    ? entry(['plugin-experimental'])
    : entry(['plugin-experimental.cjs', 'plugin-experimental.js']))
  return {
    server: await entry(['server', '']),
    rpc: await entry(['rpc']),
    experimental: experimental && /\.c?js$/.test(experimental) ? experimental : undefined,
  }
}

export function load(entrypoint: string): Promise<unknown> {
  return importModule(entrypoint)
}

export async function packageId(target: Target) {
  if (target.name) return target.name
  const name = (await packageManifest(target.directory))?.name
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

const CodedError = z.object({code: z.unknown()})

function hasCode(error: unknown, codes: readonly string[]) {
  const parsed = CodedError.safeParse(error)
  return error instanceof Error && parsed.success && codes.includes(String(parsed.data.code))
}

const Manifest = z.object({name: z.unknown().optional(), exports: z.unknown().optional()})

async function packageManifest(directory: string) {
  const text = await readFile(path.join(directory, 'package.json'), 'utf8').catch((error: unknown) => {
    if (hasCode(error, ['ENOENT'])) return undefined
    throw error
  })
  if (text === undefined) return undefined
  const parsed = Manifest.safeParse(parseJson(text))
  return parsed.success ? parsed.data : undefined
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
