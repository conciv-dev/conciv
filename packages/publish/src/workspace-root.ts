import {access} from 'node:fs/promises'
import {dirname, join} from 'node:path'

// Walk up from `start` until the directory holding pnpm-workspace.yaml is found.
export async function findRoot(start: string): Promise<string> {
  let dir = start
  for (;;) {
    try {
      await access(join(dir, 'pnpm-workspace.yaml'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error('workspace root (pnpm-workspace.yaml) not found')
      dir = parent
    }
  }
}
