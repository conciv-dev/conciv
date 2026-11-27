import {dirname, extname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {dts} from 'rolldown-plugin-dts'
import type {EnvironmentOptions, Plugin, PluginOption, UserConfig} from 'vite'

export type Entries = ReadonlyArray<string> | Readonly<Record<string, string>>

export type LibEnvironment = {
  entries?: Entries
  external?: ReadonlyArray<string | RegExp>
  noExternal?: ReadonlyArray<string | RegExp> | true
  bundle?: boolean
  banner?: string
  define?: Readonly<Record<string, string>>
  outDir?: string
  jsx?: 'preserve'
  types?: false
  consumer?: 'client'
  bundleDir?: string
  typesOnly?: true
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

function namedEntries(entries: Entries): Readonly<Record<string, string>> {
  if (!isList(entries)) return entries
  const base = commonDirectory(entries)
  return Object.fromEntries(entries.map((path) => [relative(base, path).slice(0, -extname(path).length), path]))
}

function splitBundled([name, environment]: [string, LibEnvironment]): Array<[string, LibEnvironment]> {
  const named = environment.entries ? Object.entries(namedEntries(environment.entries)) : []
  if (environment.bundle !== true || environment.types === false || named.length < 2) return [[name, environment]]
  const consumer = environment.consumer ?? (name === 'client' ? 'client' : undefined)
  return [
    [name, {...environment, types: false}],
    ...named.map(([entry, path]): [string, LibEnvironment] => [
      `${name}_types_${entry.replaceAll(/[^\w$]/g, '_')}`,
      {...environment, consumer, entries: {[entry]: path}, typesOnly: true},
    ]),
  ]
}

function environmentOptions(
  directory: string,
  name: string,
  options: LibEnvironment,
  first: boolean,
): EnvironmentOptions {
  if (!options.entries) return {consumer: options.consumer}
  const server = name !== 'client' && options.consumer !== 'client'
  const named = namedEntries(options.entries)
  const base = commonDirectory(Object.values(named))
  const noExternal = options.noExternal === true ? true : [...(options.noExternal ?? [])]
  const count = Object.keys(named).length
  const unbundled = options.bundle === false || (options.bundle !== true && !options.bundleDir && count > 1)
  return {
    consumer: options.consumer,
    resolve: server ? {external: true, noExternal} : {},
    define: options.define,
    build: {
      lib: {
        entry: Object.fromEntries(Object.entries(named).map(([entry, path]) => [entry, join(directory, path)])),
        formats: ['es'],
      },
      outDir: options.outDir,
      emptyOutDir: first,
      sourcemap: !options.jsx && !options.bundleDir,
      emitAssets: server || undefined,
      rolldownOptions: {
        external: [...(options.external ?? [])],
        output: {
          banner: options.banner,
          ...(unbundled
            ? {preserveModules: true, preserveModulesRoot: join(directory, base), virtualDirname: `_virtual/${name}`}
            : {}),
          ...(options.jsx ? {entryFileNames: '[name].jsx', chunkFileNames: '[name]-[hash].jsx'} : {}),
          ...(options.bundleDir
            ? {
                entryFileNames: `${options.bundleDir}/[name]-[hash].js`,
                chunkFileNames: `${options.bundleDir}/[name]-[hash].js`,
                assetFileNames: `${options.bundleDir}/[name]-[hash][extname]`,
                minify: true,
              }
            : {}),
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
        const source = resolved && !resolved.external && !/\/(dist|node_modules)\//.test(resolved.id)
        return source ? null : {id, external: true}
      },
    },
  }
}

function declarations(directory: string, name: string, emitDtsOnly: boolean): PluginOption[] {
  const plugins = dts({cwd: directory, tsconfig: 'tsconfig.build.json', sourcemap: true, emitDtsOnly})
  return [packageTypes(), ...plugins].map((plugin) => ({
    ...plugin,
    apply: 'build',
    applyToEnvironment: (candidate) => candidate.name === name,
  }))
}

export function libConfig(options: LibOptions): UserConfig {
  const directory = dirname(fileURLToPath(options.root))
  const environments = Object.entries(options.environments).flatMap(splitBundled)
  const typed = environments.filter(
    ([, entry]) => entry.entries && entry.types !== false && !entry.jsx && !entry.bundleDir,
  )
  const preservesJsx = environments.some(([, entry]) => entry.jsx === 'preserve')
  return {
    oxc: {exclude: [/\.js$/, /\.d\.[cm]?ts$/, ...(preservesJsx ? [/\.tsx$/] : [])]},
    plugins: [
      ...(options.plugins ?? []),
      ...typed.flatMap(([name, entry]) => declarations(directory, name, entry.typesOnly === true)),
    ],
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
