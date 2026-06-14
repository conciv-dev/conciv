import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

// The claude adapter's bundled plugin ships at `plugins/claude/` off the harness package root
// (shipped via the package `files` list; each harness gets its own `plugins/<id>/` subdir).
// Walk up from this module to find it — robust to the dev src layout (src/claude/) and the
// hashed dist chunk layout, both a few levels below the root.
function findPluginDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'plugins', 'claude')
    if (existsSync(join(candidate, '.claude-plugin', 'plugin.json'))) return candidate
    dir = dirname(dir)
  }
  return null
}

// Resolved once at module load; null if the plugin dir is missing (build/packaging slip).
export const AIDX_PLUGIN_DIR = findPluginDir()
