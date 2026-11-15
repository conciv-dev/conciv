import {
  evaluatePluginBundle,
  evaluatePluginChunk,
  inertModule,
  mainOnlyModule,
  type BridgePluginExperimental,
  type PluginModule,
  type Entry,
} from '@conciv/plugin/experimental/host'

const modules = {
  '@conciv/plugin/experimental': () => import('@conciv/plugin/experimental'),
  '@conciv/plugin/rpc': () => import('@conciv/plugin/rpc'),
  zod: () => import('zod'),
  'solid-js': () => import('solid-js'),
  'solid-js/web': () => import('solid-js/web'),
  'solid-js/store': () => import('solid-js/store'),
} satisfies Record<PluginModule, () => Promise<object>>

const chunkFile = /^\.\/([\w.-]+\.cjs)$/

const entryKey = '.'

export async function pluginDefinition(
  id: string,
  experimental: Pick<BridgePluginExperimental, 'code' | 'chunks'>,
): Promise<Entry> {
  const loaded = new Map<string, object>(
    await Promise.all(Object.entries(modules).map(async ([name, load]) => [name, await load()] as const)),
  )
  const evaluated = new Map<string, object>()

  const requireFrom = (requirer: string) => (name: string) => {
    const file = chunkFile.exec(name)?.[1]

    if (file !== undefined) return evaluated.get(file) ?? unloadedChunk(requirer, file)

    const module = loaded.get(name)

    if (module) return module

    if (mainOnlyModule(name)) return inertModule(name)

    throw new Error(`A plugin's ./plugin-experimental bundle requires a module the app does not share: ${name}`)
  }

  const unloadedChunk = (requirer: string, file: string): never => {
    throw new Error(
      `A plugin's ./plugin-experimental ${requirer === entryKey ? 'bundle' : `chunk ${requirer}`} requires the chunk ${file}, which the engine did not send before it`,
    )
  }

  const bundle = await Promise.try(() => {
    experimental.chunks.forEach((chunk) =>
      evaluated.set(chunk.file, evaluatePluginChunk(chunk.code, {require: requireFrom(chunk.file)})),
    )

    return evaluatePluginBundle(experimental.code, {require: requireFrom(entryKey)})
  }).then(
    (value) => ({ok: true as const, value}),
    (cause: unknown) => ({ok: false as const, cause}),
  )

  if (!bundle.ok) return {id, windowEntry: () => Promise.reject(bundle.cause)}

  const setup = bundle.value.setup

  return {...bundle.value.definition, id, windowEntry: async () => ({default: (ctx: never) => setup?.(ctx)})}
}
