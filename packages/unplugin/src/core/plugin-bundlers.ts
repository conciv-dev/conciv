import type {Engine} from '@conciv/backend/start'

export type EngineReader = () => Engine | Promise<Engine> | undefined

async function readBundler(engine: EngineReader): Promise<Engine['bundler'] | undefined> {
  const pending = engine()
  if (pending === undefined) return undefined
  const booted = await Promise.resolve(pending).catch(() => undefined)
  return booted?.bundler
}

export function makePluginBundlerHooks(engine: EngineReader) {
  return {
    async transform(code: string, id: string) {
      return (await readBundler(engine))?.transform(code, id) ?? null
    },
    async resolveId(id: string, importer: string | undefined) {
      return (await readBundler(engine))?.resolveId(id, importer) ?? null
    },
    async load(id: string) {
      return (await readBundler(engine))?.load(id) ?? null
    },
  }
}
