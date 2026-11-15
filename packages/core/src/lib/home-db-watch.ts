import {statSync} from 'node:fs'
import {mkdir, watch} from 'node:fs/promises'
import {join} from 'node:path'
import {isEqual} from 'es-toolkit'

const HOME_DB = 'home.db'

export async function* homeDbReads<T>(
  folder: string,
  signal: AbortSignal | undefined,
  read: () => T,
): AsyncGenerator<T, void, void> {
  await mkdir(folder, {recursive: true, mode: 0o700})
  const changes = watch(folder, {signal})
  let written = homeDbStamp(folder)
  let current = read()
  yield current
  try {
    for await (const change of changes) {
      if (change.filename?.startsWith(HOME_DB) === false) continue
      const stamp = homeDbStamp(folder)
      if (stamp === written) continue
      written = stamp
      const next = read()
      if (isEqual(next, current)) continue
      current = next
      yield current
    }
  } catch (error) {
    if (signal?.aborted === true) return
    throw error
  }
}

function homeDbStamp(folder: string): string {
  return [HOME_DB, `${HOME_DB}-wal`]
    .map((file) => {
      const found = statSync(join(folder, file), {throwIfNoEntry: false})
      return found === undefined ? 'absent' : `${found.mtimeMs}:${found.size}`
    })
    .join('|')
}
