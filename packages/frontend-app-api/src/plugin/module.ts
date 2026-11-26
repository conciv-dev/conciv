import {z} from 'zod'
import type {Plugin} from '@conciv/frontend-plugin-api'
import type {PluginModule, Entry} from '@conciv/frontend-plugin-api/host'
import type {PluginChunk} from './installed'
import type {BridgePluginExperimental} from './startup'

const modules = {
  effect: () => import('effect'),
  '@conciv/frontend-plugin-api': () => import('@conciv/frontend-plugin-api'),
  '@conciv/protocol/schema/rpc': () => import('@conciv/protocol/schema/rpc'),
  zod: () => import('zod'),
  'solid-js': () => import('solid-js'),
  'solid-js/web': () => import('solid-js/web'),
  'solid-js/store': () => import('solid-js/store'),
  '@conciv/client': () => import('@conciv/client'),
  '@conciv/frontend-plugin-api/page': () => import('@conciv/frontend-plugin-api/page'),
  '@conciv/frontend-plugin-api/grab': () => import('@conciv/frontend-plugin-api/grab'),
} satisfies Record<PluginModule, () => Promise<object>>

const chunkFile = /^\.\/([\w.-]+\.cjs)$/

export async function pluginDefinition(
  id: string,
  experimental: Pick<BridgePluginExperimental, 'code' | 'chunks' | 'file'>,
  fetchChunks: (file: string) => Promise<readonly PluginChunk[]>,
): Promise<Entry> {
  const loaded = new Map<string, object>(
    await Promise.all(Object.entries(modules).map(async ([name, load]) => [name, await load()] as const)),
  )
  const evaluated = new Map<string, object>()

  const evaluate = (chunks: readonly PluginChunk[]) =>
    chunks.forEach((chunk) => {
      if (!evaluated.has(chunk.file))
        evaluated.set(chunk.file, evaluatePluginChunk(chunk.code, {require: requireFrom(chunk.file)}))
    })

  const requireFrom = (requirer: string) => (name: string) => {
    if (name === `./${experimental.file}`) return evaluated.get(experimental.file) ?? unfinishedEntry(requirer)

    const file = chunkFile.exec(name)?.[1]

    if (file !== undefined) return evaluated.get(file) ?? unloadedChunk(requirer, file)

    const module = loaded.get(name)

    if (module) return module

    if (mainOnlyModule(name)) return inertModule(name)

    throw new Error(`A plugin's ./plugin-experimental bundle requires a module the app does not share: ${name}`)
  }

  const described = (requirer: string) => (requirer === experimental.file ? 'bundle' : `chunk ${requirer}`)

  const unfinishedEntry = (requirer: string) => {
    throw new Error(
      `A plugin's ./plugin-experimental ${described(requirer)} requires the entry ${experimental.file} before it finished evaluating`,
    )
  }

  const unloadedChunk = (requirer: string, file: string): Promise<object> => {
    if (!evaluated.has(requirer))
      throw new Error(
        `A plugin's ./plugin-experimental ${described(requirer)} requires the chunk ${file}, which the engine did not send before it`,
      )

    return fetchChunks(file).then((chunks) => {
      evaluate(chunks)

      return evaluated.get(file) ?? Promise.reject(new Error(`The engine answered without the chunk ${file}`))
    })
  }

  const bundle = await Promise.try(() => {
    evaluate(experimental.chunks)
    const value = evaluatePluginBundle(experimental.code, {require: requireFrom(experimental.file)})
    evaluated.set(experimental.file, value.exports)

    return value
  }).then(
    (value) => ({ok: true as const, value}),
    (cause: unknown) => ({ok: false as const, cause}),
  )

  if (!bundle.ok) return {id, windowEntry: () => Promise.reject(bundle.cause)}

  const setup = bundle.value.setup

  return {...bundle.value.definition, id, windowEntry: async () => ({default: (ctx: never) => setup?.(ctx)})}
}

const nodeBuiltins: readonly string[] = [
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'inspector/promises',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]

function mainOnlyModule(name: string) {
  return name.startsWith('node:') || nodeBuiltins.includes(name)
}

type InertModule = () => void

function inertModule(name: string): InertModule {
  const label = `[inert module ${name}]`

  const handler: ProxyHandler<InertModule> = {
    get(_, key) {
      if (key === 'then') return undefined

      if (key === Symbol.toPrimitive || key === 'toString') return () => label

      if (key === Symbol.hasInstance) return () => false

      return placeholder
    },
    set: () => true,
    defineProperty: () => true,
    deleteProperty: () => true,
    apply: () => placeholder,
    construct: () => placeholder,
  }

  const placeholder = new Proxy<InertModule>(function inert() {}, handler)

  return placeholder
}

type BundlePlugin = Plugin.Declarations & {
  readonly setup?: (ctx: never) => Plugin.Cleanup | void
}

type PluginBundle = {
  readonly definition: Plugin.Declarations
  readonly setup?: (ctx: never) => Plugin.Cleanup | void
  readonly exports: object
}

type PluginBundleHost = {
  require(name: string): object
}

function evaluatePluginBundle(code: string, host: PluginBundleHost): PluginBundle {
  const exports = evaluatePluginChunk(code, host)
  const plugin = 'default' in exports ? exports.default : exports

  if (!matchesPlugin(plugin)) {
    const decoded = BundleDefinition.safeParse(plugin)
    const problem = decoded.success ? 'it does not match' : z.prettifyError(decoded.error)

    throw new Error(
      `A plugin's ./plugin-experimental bundle must default-export a \`Plugin.define\` from \`@conciv/frontend-plugin-api\`: ${problem}`,
    )
  }

  const {setup, ...definition} = plugin

  if (!setup) throw new Error("A plugin's ./plugin-experimental bundle must have a window `setup`")

  return {definition, setup, exports}
}

type BundleModule = {exports: object}

function evaluatePluginChunk(code: string, host: PluginBundleHost): object {
  const module: BundleModule = {exports: {}}

  new Function('require', 'module', 'exports', code)(host.require, module, module.exports)

  return module.exports
}

const BundleDefinition = z.object({
  stores: z
    .record(
      z.string(),
      z.object({
        scope: z.enum(['global', 'project', 'session']),
        schema: z.custom(isStandardSchema),
        encode: z.custom((encode) => typeof encode === 'function').optional(),
      }),
    )
    .optional(),
  icons: z.record(z.string(), z.string()).optional(),
  setup: z.custom((value) => typeof value === 'function').optional(),
  beforeRegister: z.custom((value) => typeof value === 'function').optional(),
  enforce: z.enum(['pre', 'post']).optional(),
})

function matchesPlugin(plugin: unknown): plugin is BundlePlugin {
  return BundleDefinition.safeParse(plugin).success
}

const StandardProps = z.object({validate: z.custom((validate) => typeof validate === 'function')})

function isStandardSchema(value: unknown) {
  if (typeof value !== 'object' && typeof value !== 'function') return false
  if (value === null) return false
  return StandardProps.safeParse(Reflect.get(value, '~standard')).success
}
