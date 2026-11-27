import type {Engine} from '@conciv/backend/start'

export function makePluginBundlerHooks(engine: () => Engine | Promise<Engine> | undefined) {
  return {
    async transform(code: string, id: string) {
      return (await (await engine())?.bundler.transform(code, id)) ?? null
    },
    async resolveId(id: string, importer: string | undefined) {
      return (await (await engine())?.bundler.resolveId(id, importer)) ?? null
    },
    async load(id: string) {
      return (await (await engine())?.bundler.load(id)) ?? null
    },
  }
}
