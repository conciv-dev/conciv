import {ConfigProvider} from 'effect'

export function defaultConfigProvider(): ConfigProvider.ConfigProvider {
  return ConfigProvider.fromEnv({preserveEmptyStrings: true})
}
