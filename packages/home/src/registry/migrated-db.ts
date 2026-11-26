import {drizzle} from 'drizzle-orm/node-sqlite'
import {openDatabase, takeMigrationLock} from '@conciv/types/migration-lock'

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

function whileMigrationLockHeld(lockFile: string, run: () => void): void {
  const lock = takeMigrationLock(lockFile)
  try {
    run()
  } finally {
    lock.close()
  }
}
