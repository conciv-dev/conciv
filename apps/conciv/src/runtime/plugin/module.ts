import {
  evaluatePluginBundle,
  inertModule,
  mainOnlyModule,
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

export async function pluginDefinition(id: string, code: string): Promise<Entry> {
  const loaded = new Map<string, object>(
    await Promise.all(Object.entries(modules).map(async ([name, load]) => [name, await load()] as const)),
  )

  const bundle = await Promise.try(() =>
    evaluatePluginBundle(code, {
      require: (name) => {
        const module = loaded.get(name)

        if (module) return module

        if (mainOnlyModule(name)) return inertModule(name)

        throw new Error(`A plugin's ./plugin-experimental bundle requires a module the app does not share: ${name}`)
      },
    }),
  ).then(
    (value) => ({ok: true as const, value}),
    (cause: unknown) => ({ok: false as const, cause}),
  )

  if (!bundle.ok) return {id, windowEntry: () => Promise.reject(bundle.cause)}

  const setup = bundle.value.setup

  return {...bundle.value.definition, id, windowEntry: async () => ({default: (ctx: never) => setup?.(ctx)})}
}
