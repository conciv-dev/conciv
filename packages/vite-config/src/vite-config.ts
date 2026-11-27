import {dirname, extname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {dts} from 'rolldown-plugin-dts'
import type {EnvironmentOptions, Plugin, PluginOption, UserConfig} from 'vite'

export type Entries = ReadonlyArray<string> | Readonly<Record<string, string>>

export type LibEnvironment = {
  entries: Entries
  external?: ReadonlyArray<string | RegExp>
  noExternal?: ReadonlyArray<string | RegExp> | true
  unbundle?: true
  banner?: string
  define?: Readonly<Record<string, string>>
  outDir?: string
  jsx?: 'preserve'
  types?: false
}

export type LibOptions = {
  root: string
  plugins?: PluginOption[]
  environments: Readonly<Record<string, LibEnvironment>>
}

function commonDirectory(paths: ReadonlyArray<string>): string {
  const parts = paths.map((path) => dirname(path).split('/'))
  const first = parts[0] ?? []
  const mismatch = first.findIndex((segment, index) => parts.some((other) => other[index] !== segment))
  return first.slice(0, mismatch === -1 ? first.length : mismatch).join('/')
}

function isList(entries: Entries): entries is ReadonlyArray<string> {
  return Array.isArray(entries)
}

function resolveEntries(directory: string, base: string, entries: Entries): Record<string, string> {
  const named: Readonly<Record<string, string>> = isList(entries)
    ? Object.fromEntries(entries.map((path) => [relative(base, path).slice(0, -extname(path).length), path]))
    : entries
  return Object.fromEntries(Object.entries(named).map(([name, path]) => [name, join(directory, path)]))
}

function environmentOptions(
  directory: string,
  name: string,
  options: LibEnvironment,
  first: boolean,
): EnvironmentOptions {
  const server = name !== 'client'
  const base = commonDirectory(isList(options.entries) ? options.entries : Object.values(options.entries))
  const noExternal = options.noExternal === true ? true : [...(options.noExternal ?? [])]
  return {
    resolve: server ? {external: true, noExternal} : {},
    define: options.define,
    build: {
      lib: {entry: resolveEntries(directory, base, options.entries), formats: ['es']},
      outDir: options.outDir,
      emptyOutDir: first,
      sourcemap: !options.jsx,
      emitAssets: server || undefined,
      rolldownOptions: {
        external: [...(options.external ?? [])],
        output: {
          banner: options.banner,
          ...(options.unbundle ? {preserveModules: true, preserveModulesRoot: join(directory, base)} : {}),
          ...(options.jsx ? {entryFileNames: '[name].jsx', chunkFileNames: '[name]-[hash].jsx'} : {}),
        },
      },
    },
  }
}

function packageTypes(): Plugin {
  return {
    name: 'conciv:package-types',
    resolveId: {
      order: 'pre',
      filter: {id: /^[\w@]/},
      async handler(id, importer) {
        if (!importer || !/\.d\.[cm]?ts$/.test(importer)) return null
        const resolved = await this.resolve(id, importer, {skipSelf: true}).catch(() => null)
        return !resolved || resolved.external || resolved.id.includes('/node_modules/') ? {id, external: true} : null
      },
    },
  }
}

function declarations(directory: string, name: string): PluginOption[] {
  return [packageTypes(), ...dts({cwd: directory, tsconfig: 'tsconfig.build.json', sourcemap: true})].map((plugin) => ({
    ...plugin,
    apply: 'build',
    applyToEnvironment: (candidate) => candidate.name === name,
  }))
}

export function libConfig(options: LibOptions): UserConfig {
  const directory = dirname(fileURLToPath(options.root))
  const environments = Object.entries(options.environments)
  const typed = environments.filter(([, entry]) => entry.types !== false && !entry.jsx).map(([name]) => name)
  const preservesJsx = environments.some(([, entry]) => entry.jsx === 'preserve')
  return {
    oxc: {exclude: [/\.js$/, /\.d\.[cm]?ts$/, ...(preservesJsx ? [/\.tsx$/] : [])]},
    plugins: [...(options.plugins ?? []), ...typed.flatMap((name) => declarations(directory, name))],
    environments: Object.fromEntries(
      environments.map(([name, entry], index) => [name, environmentOptions(directory, name, entry, index === 0)]),
    ),
    builder: {
      buildApp: async (builder) => {
        for (const [name] of environments) {
          const target = builder.environments[name]
          if (!target) throw new Error(`the build has no ${name} environment`)
          await builder.build(target)
        }
      },
    },
  }
}
