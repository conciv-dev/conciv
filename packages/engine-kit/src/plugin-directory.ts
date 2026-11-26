import {existsSync, readFileSync} from 'node:fs'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {z} from 'zod'
import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'

const ManifestNameSchema = z.object({name: z.string().optional()})

function packageNamed(name: string, directory: string): boolean {
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) return false
  return ManifestNameSchema.parse(JSON.parse(readFileSync(manifest, 'utf8'))).name === name
}

function installedPlugin(name: string, directory: string): string {
  if (packageNamed(name, directory)) return directory
  const installed = join(directory, 'node_modules', name)
  if (existsSync(join(installed, 'package.json'))) return installed
  const parent = dirname(directory)
  if (parent === directory) throw new Error(`the plugin ${name} is not installed in the package under test`)
  return installedPlugin(name, parent)
}

export function pluginDirectory(target: string): string {
  if (isAbsolute(target)) return target
  if (target.startsWith('.')) return resolve(target)
  return installedPlugin(target, process.cwd())
}

const ServerExportSchema = z.object({exports: z.object({'.': z.object({import: z.string()})})})

const ServerModuleSchema = z.object({
  default: z.custom<Plugin>((value) => z.object({id: z.string()}).safeParse(value).success),
})

export async function serverPlugin(name: string): Promise<Plugin> {
  const directory = pluginDirectory(name)
  const manifest = ServerExportSchema.parse(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')))
  const loaded: unknown = await import(pathToFileURL(join(directory, manifest.exports['.'].import)).href)
  return ServerModuleSchema.parse(loaded).default
}
