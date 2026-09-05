import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {lock} from 'proper-lockfile'

const LOCK_FILE = 'settings.lock'
const LOCK_OPTIONS = {
  stale: 5_000,
  update: 2_000,
  realpath: false,
  retries: {retries: 12, factor: 1.5, minTimeout: 25, maxTimeout: 500, randomize: true},
}

export function isLockContention(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ELOCKED'
}

export async function withDirectoryLock<T>(directory: string, run: () => Promise<T>): Promise<T> {
  mkdirSync(directory, {recursive: true})
  const release = await lock(directory, {...LOCK_OPTIONS, lockfilePath: join(directory, LOCK_FILE)})
  try {
    return await run()
  } finally {
    await release()
  }
}
