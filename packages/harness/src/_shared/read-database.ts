import {existsSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'

const BUSY_TIMEOUT_MS = 5000

export function withDatabase<T>(path: string, absent: T, run: (db: DatabaseSync) => T): T {
  if (!existsSync(path)) return absent
  const db = new DatabaseSync(path, {readOnly: true, timeout: BUSY_TIMEOUT_MS})
  try {
    return run(db)
  } finally {
    db.close()
  }
}
