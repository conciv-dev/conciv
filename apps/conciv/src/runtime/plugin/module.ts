import {
  evaluatePluginBundle,
  evaluatePluginChunk,
  inertModule,
  mainOnlyModule,
  type BridgePluginExperimental,
  type PluginChunk,
  type PluginModule,
  type Entry,
} from '@conciv/plugin/experimental/host'

const modules = {
  effect: () => import('effect'),
  '@conciv/plugin/experimental': () => import('@conciv/plugin/experimental'),
  '@conciv/plugin/rpc': () => import('@conciv/plugin/rpc'),
  zod: () => import('zod'),
  'solid-js': () => import('solid-js'),
  'solid-js/web': () => import('solid-js/web'),
  'solid-js/store': () => import('solid-js/store'),
  '@conciv/plugin/experimental/page': () => import('@conciv/plugin/experimental/page'),
  '@conciv/plugin/experimental/grab': () => import('@conciv/plugin/experimental/grab'),
  '@conciv/ui-kit-tap': () => import('@conciv/ui-kit-tap'),
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
