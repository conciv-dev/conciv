import {access} from 'node:fs/promises'
import {DatabaseSync} from 'node:sqlite'
import {whenMissing} from './when-missing.js'

const BUSY_TIMEOUT_MS = 5000

export async function withDatabase<T>(path: string, absent: T, run: (db: DatabaseSync) => T): Promise<T> {
  const present = await access(path).then(() => true, whenMissing(false))
  if (!present) return absent
  const db = new DatabaseSync(path, {readOnly: true, timeout: BUSY_TIMEOUT_MS})
  try {
    return run(db)
  } finally {
    db.close()
  }
}
