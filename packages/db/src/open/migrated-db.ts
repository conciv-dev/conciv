import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'

export function openMigratedDb(options: {
  file: string
  lock: string
  migrate: (db: ReturnType<typeof drizzle>) => void
}): ReturnType<typeof drizzle> {
  const db = drizzle({client: openDatabase(options.file)})
  try {
    whileMigrationLockHeld(options.lock, () => {
      db.$client.exec('PRAGMA journal_mode = WAL')
      options.migrate(db)
    })
  } catch (error) {
    db.$client.close()
    throw error
  }
  return db
}

const BUSY_TIMEOUT_MS = 5000

function openDatabase(file: string, busyTimeoutMs = BUSY_TIMEOUT_MS): DatabaseSync {
  return new DatabaseSync(file, {timeout: busyTimeoutMs})
}

export function takeMigrationLock(lockFile: string, busyTimeoutMs?: number): DatabaseSync {
  const lock = openDatabase(lockFile, busyTimeoutMs)
  try {
    lock.exec('BEGIN EXCLUSIVE')
  } catch (error) {
    lock.close()
    throw error
  }
  return lock
}

function whileMigrationLockHeld(lockFile: string, run: () => void): void {
  const lock = takeMigrationLock(lockFile)
  try {
    run()
  } finally {
    lock.close()
  }
}
