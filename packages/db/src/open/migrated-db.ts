import {chmodSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'

export function openMigratedDb(options: {
  file: string
  lock: string
  mode?: number
  migrate: (db: ReturnType<typeof drizzle>) => void
}): ReturnType<typeof drizzle> {
  const db = drizzle({client: openDatabase(options.file, options.mode)})
  try {
    whileMigrationLockHeld(options.lock, options.mode, () => {
      db.$client.exec('PRAGMA journal_mode = WAL')
      options.migrate(db)
    })
  } catch (error) {
    db.$client.close()
    throw error
  }
  return db
}

function openDatabase(file: string, mode: number | undefined): DatabaseSync {
  const client = new DatabaseSync(file, {timeout: 5000})
  if (mode === undefined) return client
  try {
    chmodSync(file, mode)
  } catch (error) {
    client.close()
    throw error
  }
  return client
}

function whileMigrationLockHeld(lockFile: string, mode: number | undefined, run: () => void): void {
  const lock = openDatabase(lockFile, mode)
  try {
    lock.exec('BEGIN EXCLUSIVE')
    run()
  } finally {
    lock.close()
  }
}
