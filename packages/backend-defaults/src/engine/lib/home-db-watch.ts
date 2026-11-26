import {access} from 'node:fs/promises'
import {join} from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {isEqual} from 'es-toolkit'
import {z} from 'zod'
import {closeHomeDb, openHomeDb, prepareHome, type HomeDb} from '@conciv/home'

const HOME_DB_POLL_MS = 1000

const DataVersionSchema = z.object({data_version: z.number()})

export async function* homeDbReads<T>(
  folder: string,
  signal: AbortSignal | undefined,
  read: () => Promise<T>,
): AsyncGenerator<T, void, void> {
  let db: HomeDb | undefined
  try {
    db = await openWhenPresent(folder)
    let seen = db === undefined ? undefined : dataVersion(db)
    let current = await read()
    yield current
    for (;;) {
      await setTimeout(HOME_DB_POLL_MS, undefined, {signal, ref: false})
      db ??= await openWhenPresent(folder)
      if (db === undefined) continue
      const version = dataVersion(db)
      if (version === seen) continue
      seen = version
      const next = await read()
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

async function openWhenPresent(folder: string): Promise<HomeDb | undefined> {
  const present = await access(join(folder, 'home.db')).then(
    () => true,
    () => false,
  )
  if (!present) return undefined
  return openHomeDb(await prepareHome(folder))
}

function dataVersion(db: HomeDb): number {
  return DataVersionSchema.parse(db.$client.prepare('PRAGMA data_version').get()).data_version
}
