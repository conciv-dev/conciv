import {basename, dirname, join} from 'node:path'

export function e2eStateDir(configDir: string): string {
  return join(dirname(configDir), '.conciv-e2e', basename(configDir))
}

export function e2ePluginCopyDir(configDir: string, plugin: string): string {
  return join(e2eStateDir(configDir), 'plugins', plugin)
}
