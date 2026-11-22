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

const BUSY_TIMEOUT_MS = 5000

function openDatabase(file: string, mode: number | undefined, busyTimeoutMs = BUSY_TIMEOUT_MS): DatabaseSync {
  const client = new DatabaseSync(file, {timeout: busyTimeoutMs})
  if (mode === undefined) return client
  try {
    chmodSync(file, mode)
  } catch (error) {
    client.close()
    throw error
  }
  return client
}

export function takeMigrationLock(lockFile: string, mode?: number, busyTimeoutMs?: number): DatabaseSync {
  const lock = openDatabase(lockFile, mode, busyTimeoutMs)
  try {
    lock.exec('BEGIN EXCLUSIVE')
  } catch (error) {
    lock.close()
    throw error
  }
  return lock
}

function whileMigrationLockHeld(lockFile: string, mode: number | undefined, run: () => void): void {
  const lock = takeMigrationLock(lockFile, mode)
  try {
    run()
  } finally {
    lock.close()
  }
}
