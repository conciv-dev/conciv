import {join} from 'node:path'

export const CONCIV_STATE_DIR = '.conciv'

export const CONCIV_HOOKS_PLUGIN_ROOT = 'claude-hooks'

export function concivStateDir(root: string): string {
  return join(root, CONCIV_STATE_DIR)
}

export function concivHooksPluginDir(stateDir: string, concivSessionId: string): string {
  return join(stateDir, CONCIV_HOOKS_PLUGIN_ROOT, concivSessionId)
}
