import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

export const CONCIV_STATE_DIR = '.conciv'

export const CONCIV_HOOKS_PLUGIN_ROOT = 'claude-hooks'

export function concivStateDir(root: string): string {
  return join(root, CONCIV_STATE_DIR)
}

export function concivHooksPluginDir(stateDir: string, concivSessionId: string): string {
  return join(stateDir, CONCIV_HOOKS_PLUGIN_ROOT, concivSessionId)
}

const CONCIV_STATE_GITIGNORE = ['*', '!.gitignore', '!settings/', '!settings/**', '!harnesses.json', ''].join('\n')

export function createConcivStateDir(stateDir: string): string {
  mkdirSync(stateDir, {recursive: true})
  const ignoreFile = join(stateDir, '.gitignore')
  if (existsSync(ignoreFile)) return stateDir
  try {
    writeFileSync(ignoreFile, CONCIV_STATE_GITIGNORE, {flag: 'wx'})
  } catch (error) {
    console.error('conciv: could not write', ignoreFile, error)
  }
  return stateDir
}
