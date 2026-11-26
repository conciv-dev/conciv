import {DatabaseSync} from 'node:sqlite'

const BUSY_TIMEOUT_MS = 5000

export function openDatabase(file: string, busyTimeoutMs = BUSY_TIMEOUT_MS): DatabaseSync {
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
