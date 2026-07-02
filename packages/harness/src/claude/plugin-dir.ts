import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

function findPluginDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'plugins', 'claude')
    if (existsSync(join(candidate, '.claude-plugin', 'plugin.json'))) return candidate
    dir = dirname(dir)
  }
  return null
}

export const CONCIV_PLUGIN_DIR = findPluginDir()
