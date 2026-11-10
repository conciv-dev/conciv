import {basename, dirname, join, resolve} from 'node:path'
import type {NapiResolveOptions} from 'oxc-resolver'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {loadConfigFromFile, type AliasOptions, type PluginOption, type UserConfig} from 'vite'

export async function viteEntries(input: {cwd: string}): Promise<ViteRoot[]> {
  const {cwd} = input
  const tree = createStorage({driver: fsDriver({base: cwd, readOnly: true, ignore: IGNORED})})
  const configs = (await tree.getKeys())
    .map((key) => key.replaceAll(':', '/'))
    .filter((path) => CONFIG_NAMES.has(basename(path)))
    .toSorted()
    .map((path) => join(cwd, path))
  if (configs.length > 0) return Promise.all(configs.map((file) => rootOf(file)))
  if (await tree.hasItem(HTML_ENTRY))
    return [
      {root: cwd, entries: [join(cwd, HTML_ENTRY)], resolve: resolveOptions(undefined), plugins: [], unreadable: []},
    ]
  return []
}

type ViteRoot = {root: string; entries: string[]; resolve: NapiResolveOptions; plugins: string[]; unreadable: string[]}

type RollInput = string | string[] | Record<string, string>

const CONFIG_NAMES = new Set(['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'])
const IGNORED = ['**/node_modules/**', '**/dist/**', '**/.git/**']
const HTML_ENTRY = 'index.html'
const DEFAULT_CONDITIONS = ['import', 'module', 'browser', 'development', 'default']
const DEFAULT_MAIN_FIELDS = ['browser', 'module', 'jsnext:main', 'jsnext', 'main']
const DEFAULT_EXTENSIONS = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
const EXTENSION_ALIAS = {
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
}

async function rootOf(file: string): Promise<ViteRoot> {
  const loaded = await loadConfigFromFile({command: 'serve', mode: 'development'}, file, dirname(file), 'silent').catch(
    () => null,
  )
  if (loaded === null)
    return {root: dirname(file), entries: [], resolve: resolveOptions(undefined), plugins: [], unreadable: [file]}
  const {config} = loaded
  const root = resolve(dirname(file), config.root ?? '.')
  const input = config.build?.rolldownOptions?.input ?? config.build?.rollupOptions?.input
  const entries = input === undefined ? [HTML_ENTRY] : inputs(input)
  return {
    root,
    entries: entries.map((entry) => resolve(root, entry)),
    resolve: resolveOptions(config.resolve),
    plugins: await pluginNames(config.plugins ?? []),
    unreadable: [],
  }
}

async function pluginNames(option: PluginOption): Promise<string[]> {
  const plugin = await option
  if (Array.isArray(plugin)) return (await Promise.all(plugin.map((each) => pluginNames(each)))).flat()
  return typeof plugin === 'object' && plugin !== null && 'name' in plugin ? [plugin.name] : []
}

function inputs(input: RollInput): string[] {
  if (typeof input === 'string') return [input]
  if (Array.isArray(input)) return input
  return Object.values(input)
}

function resolveOptions(options: UserConfig['resolve']): NapiResolveOptions {
  return {
    alias: aliases(options?.alias),
    conditionNames: [...DEFAULT_CONDITIONS, ...(options?.conditions ?? [])],
    mainFields: [...(options?.mainFields ?? DEFAULT_MAIN_FIELDS)],
    extensions: [...(options?.extensions ?? DEFAULT_EXTENSIONS)],
    extensionAlias: EXTENSION_ALIAS,
  }
}

function aliases(alias: AliasOptions | undefined): Record<string, string[]> {
  if (alias === undefined) return {}
  if (Array.isArray(alias)) {
    return Object.fromEntries(
      alias.flatMap((entry) => (typeof entry.find === 'string' ? [[entry.find, [entry.replacement]]] : [])),
    )
  }
  return Object.fromEntries(Object.entries(alias).map(([find, replacement]) => [find, [replacement]]))
}
