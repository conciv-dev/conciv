import type {Engine} from '@conciv/backend/start'

type PluginBundlers = Awaited<ReturnType<Engine['bundlers']>>

type PluginBundler = PluginBundlers[number]

type Code = Awaited<ReturnType<NonNullable<PluginBundler['bundler']['transform']>>>

type Transformed = Exclude<Code, string | null | undefined>

type Chain = {result: Transformed | undefined; changes: number}

export type EngineReader = () => Engine | Promise<Engine> | undefined

async function readBundlers(engine: EngineReader): Promise<PluginBundlers> {
  const pending = engine()
  if (pending === undefined) return []
  const booted = await Promise.resolve(pending).catch(() => undefined)
  return booted === undefined ? [] : booted.bundlers()
}

function readCode(result: Code): Transformed | undefined {
  if (result === null || result === undefined) return undefined
  return typeof result === 'string' ? {code: result} : result
}

function runHook<Answer>(plugin: PluginBundler, hook: string, id: string, run: () => Answer): Promise<Awaited<Answer>> {
  return Promise.try(run).catch((cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`conciv: the ${hook} hook of plugin ${plugin.id} failed on ${id}: ${reason}`, {cause})
  })
}

function transformInOrder(plugins: PluginBundlers, code: string, id: string): Promise<Chain> {
  return plugins.reduce<Promise<Chain>>(
    async (previous, plugin) => {
      const done = await previous
      const transform = plugin.bundler.transform
      if (transform === undefined) return done
      const next = readCode(await runHook(plugin, 'transform', id, () => transform(done.result?.code ?? code, id)))
      return next === undefined ? done : {result: next, changes: done.changes + 1}
    },
    Promise.resolve({result: undefined, changes: 0}),
  )
}

function firstAnswer<Answer>(
  plugins: PluginBundlers,
  hook: string,
  id: string,
  ask: (plugin: PluginBundler) => Promise<Answer | null | undefined> | Answer | null | undefined,
): Promise<Answer | null> {
  return plugins.reduce<Promise<Answer | null>>(async (previous, plugin) => {
    const found = await previous
    if (found !== null) return found
    return (await runHook(plugin, hook, id, () => ask(plugin))) ?? null
  }, Promise.resolve(null))
}

export function makePluginBundlerHooks(engine: EngineReader) {
  return {
    async transform(code: string, id: string): Promise<Transformed | null> {
      const {result, changes} = await transformInOrder(await readBundlers(engine), code, id)
      if (result === undefined) return null
      return changes === 1 ? result : {code: result.code}
    },
    async resolveId(id: string, importer: string | undefined): Promise<string | null> {
      return firstAnswer(await readBundlers(engine), 'resolveId', id, (plugin) =>
        plugin.bundler.resolveId?.(id, importer),
      )
    },
    async load(id: string): Promise<Transformed | null> {
      return firstAnswer(await readBundlers(engine), 'load', id, async (plugin) =>
        readCode(await plugin.bundler.load?.(id)),
      )
    },
  }
}
