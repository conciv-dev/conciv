import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const nameCache = new Map<string, string | null>()

function manifestName(path: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
      return parsed.name
    }
    return null
  } catch {
    return null
  }
}

function packageNameFor(dir: string): string | null {
  const cached = nameCache.get(dir)
  if (cached !== undefined) return cached
  const own = manifestName(join(dir, 'package.json'))
  const parent = dirname(dir)
  const resolved = own ?? (parent === dir ? null : packageNameFor(parent))
  nameCache.set(dir, resolved)
  return resolved
}

const isConcivName = (name: string) => name === 'conciv' || name.startsWith('@conciv/')

export function isConcivSrcTsx(id: string): boolean {
  const file = id.split('?')[0] ?? id
  if (!file.endsWith('.tsx')) return false
  if (!/[\\/]src[\\/]/.test(file)) return false
  if (file.includes('node_modules')) return false
  const name = packageNameFor(dirname(file))
  return name !== null && isConcivName(name)
}
