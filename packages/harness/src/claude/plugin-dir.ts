import {access} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const MAX_LEVELS = 6

function candidateDirs(): string[] {
  const start = dirname(fileURLToPath(import.meta.url))
  return Array.from({length: MAX_LEVELS}, (_, level) => resolve(start, ...Array<string>(level).fill('..')))
}

async function hasPluginManifest(candidate: string): Promise<boolean> {
  return access(join(candidate, '.claude-plugin', 'plugin.json')).then(
    () => true,
    () => false,
  )
}

export async function claudePluginDir(): Promise<string | null> {
  const candidates = candidateDirs().map((dir) => join(dir, 'plugins', 'claude'))
  const found = await Promise.all(candidates.map(hasPluginManifest))
  return candidates[found.indexOf(true)] ?? null
}
