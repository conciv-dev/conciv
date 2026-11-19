import {setTimeout} from 'node:timers/promises'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {Effect} from 'effect'

export const tmpdir = async (prefix = 'conciv-core-test-') => {
  const dir = await make(prefix)
  return {
    path: dir,
    [Symbol.asyncDispose]() {
      return remove(dir)
    },
  }
}

export const tmpdirScoped = (prefix = 'conciv-core-test-') =>
  Effect.acquireRelease(
    Effect.tryPromise(() => make(prefix)),
    (dir) => Effect.tryPromise(() => remove(dir)).pipe(Effect.orDie),
  ).pipe(Effect.map((path) => ({path})))

const make = async (prefix: string) => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))

async function remove(dir: string, retries = 30): Promise<void> {
  try {
    await fs.rm(dir, {recursive: true, force: true})
  } catch (error) {
    if (retries === 0 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'EBUSY')
      throw error
    await setTimeout(100)
    return remove(dir, retries - 1)
  }
}
