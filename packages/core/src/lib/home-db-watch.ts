import {lstatSync} from 'node:fs'
import {join} from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {isEqual} from 'es-toolkit'
import {z} from 'zod'
import {closeHomeDb, openHomeDb, type HomeDb} from '@conciv/db'

const HOME_DB_POLL_MS = 1000

const DataVersionSchema = z.object({data_version: z.number()})

export async function* homeDbReads<T>(
  folder: string,
  signal: AbortSignal | undefined,
  read: () => T,
): AsyncGenerator<T, void, void> {
  let db: HomeDb | undefined
  try {
    db = openWhenPresent(folder)
    let seen = db === undefined ? undefined : dataVersion(db)
    let current = read()
    yield current
    for (;;) {
      await setTimeout(HOME_DB_POLL_MS, undefined, {signal, ref: false})
      db ??= openWhenPresent(folder)
      if (db === undefined) continue
      const version = dataVersion(db)
      if (version === seen) continue
      seen = version
      const next = read()
      if (isEqual(next, current)) continue
      current = next
      yield current
    }
  } catch (error) {
    if (signal?.aborted === true) return
    throw error
  } finally {
    if (db !== undefined) closeHomeDb(db)
  }
}

function openWhenPresent(folder: string): HomeDb | undefined {
  if (lstatSync(join(folder, 'home.db'), {throwIfNoEntry: false}) === undefined) return undefined
  return openHomeDb(folder)
}

function dataVersion(db: HomeDb): number {
  return DataVersionSchema.parse(db.$client.prepare('PRAGMA data_version').get()).data_version
}
