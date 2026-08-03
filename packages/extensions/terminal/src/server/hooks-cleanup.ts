import {readdir, rm, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {isSessionId} from '@conciv/protocol/chat-types'
import {CONCIV_HOOKS_PLUGIN_ROOT, concivHooksPluginDir} from '@conciv/protocol/state-types'

const HOOKS_PLUGIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function removeHooksPlugin(stateDir: string, concivSessionId: string): Promise<void> {
  if (!isSessionId(concivSessionId)) return
  await rm(concivHooksPluginDir(stateDir, concivSessionId), {recursive: true, force: true}).catch(() => {})
}

export async function sweepHooksPlugins(stateDir: string, now: number): Promise<void> {
  const root = join(stateDir, CONCIV_HOOKS_PLUGIN_ROOT)
  const entries = await readdir(root, {withFileTypes: true}).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSessionId(entry.name)) continue
    const path = join(root, entry.name)
    const info = await stat(path).catch(() => null)
    if (!info || now - info.mtimeMs < HOOKS_PLUGIN_MAX_AGE_MS) continue
    await rm(path, {recursive: true, force: true}).catch(() => {})
  }
}
