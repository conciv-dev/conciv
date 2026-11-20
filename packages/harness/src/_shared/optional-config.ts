import {Config, type ConfigProvider, Effect, Option} from 'effect'

export function readOptionalConfig(provider: ConfigProvider.ConfigProvider, name: string): string | undefined {
  return Effect.runSync(Config.option(Config.String(name)).pipe(Config.map(Option.getOrUndefined)).parse(provider))
}
