import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const packageNames = new Map<string, string | null>()

function manifestName(path: string): string | null {
  if (!existsSync(path)) return null
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
    return parsed.name
  }
  return null
}

function packageNameAt(dir: string): string | null {
  const cached = packageNames.get(dir)
  if (cached !== undefined) return cached
  const parent = dirname(dir)
  const resolved = manifestName(join(dir, 'package.json')) ?? (parent === dir ? null : packageNameAt(parent))
  packageNames.set(dir, resolved)
  return resolved
}

export function isConcivSrcTsx(id: string): boolean {
  const file = id.split('?')[0] ?? id
  if (!file.endsWith('.tsx') || !file.includes('/src/') || file.includes('node_modules')) return false
  return packageNameAt(dirname(file))?.startsWith('@conciv/') ?? false
}
