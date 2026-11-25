import {concivHome} from '@conciv/db'
import {Config, ConfigProvider, Effect, Option} from 'effect'
import {range} from 'es-toolkit'

type EnvEntry = readonly [string, string]

const ConcivHomeConfig = Config.option(Config.String('CONCIV_HOME'))

export function readConcivHome(homeDir: string | undefined): Effect.Effect<string, Config.ConfigError> {
  return ConcivHomeConfig.pipe(
    Effect.map((home) => concivHome({homeDir, env: {CONCIV_HOME: Option.getOrUndefined(home)}})),
  )
}

function childSegments(node: ConfigProvider.Node): ReadonlyArray<string | number> {
  if (node._tag === 'Record') return [...node.keys]
  if (node._tag === 'Array') return range(node.length)
  return []
}

function entriesAt(
  provider: ConfigProvider.ConfigProvider,
  path: ConfigProvider.Path,
): Effect.Effect<EnvEntry[], ConfigProvider.SourceError> {
  return provider.load(path).pipe(
    Effect.flatMap((node) => {
      if (node === undefined) return Effect.succeed([])
      const own: EnvEntry[] = path.length > 0 && node.value !== undefined ? [[path.join('_'), node.value]] : []
      return Effect.forEach(childSegments(node), (segment) => entriesAt(provider, [...path, segment])).pipe(
        Effect.map((children) => [...own, ...children.flat()]),
      )
    }),
  )
}

export const readProcessEnv: Effect.Effect<
  Record<string, string>,
  ConfigProvider.SourceError
> = ConfigProvider.ConfigProvider.pipe(
  Effect.flatMap((provider) => entriesAt(provider, [])),
  Effect.map((entries) => Object.fromEntries(entries)),
)

export function runWithProvider<Value, Failure>(
  provider: ConfigProvider.ConfigProvider,
  effect: Effect.Effect<Value, Failure>,
): Promise<Value> {
  return Effect.runPromise(effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider)))
}
