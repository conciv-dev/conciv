import {fileURLToPath} from 'url'
import {Effect} from 'effect'

export const load = (dir: string) =>
  Effect.tryPromise({
    try: async () => {
      const {default: Config} = await import('@npmcli/config')
      const {default: npmDefinitions} = await import('@npmcli/config/lib/definitions/index.js')
      const {definitions, flatten, nerfDarts, shorthands} = npmDefinitions
      const config = new Config({
        npmPath: fileURLToPath(new URL('..', import.meta.url)),
        cwd: dir,
        env: {...process.env},
        argv: [process.execPath, process.execPath, '--prefix', dir],
        execPath: process.execPath,
        platform: process.platform,
        definitions,
        flatten,
        nerfDarts,
        shorthands,
        warn: false,
      })
      await config.load()
      return config.flat
    },
    catch: (cause) => cause,
  }).pipe(Effect.orElseSucceed((): Record<string, unknown> => ({})))

export const registry = (dir: string) =>
  load(dir).pipe(
    Effect.map((config) => {
      const registry = typeof config.registry === 'string' ? config.registry : 'https://registry.npmjs.org'
      return registry.endsWith('/') ? registry.slice(0, -1) : registry
    }),
  )
