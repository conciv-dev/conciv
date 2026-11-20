import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {openDb} from './db.js'

function renameAppliedMigration(file: string, from: string, to: string): void {
  const client = new DatabaseSync(file)
  client.prepare('UPDATE __drizzle_migrations SET name = ? WHERE name = ?').run(to, from)
  client.close()
}

function readDatabase(file: string): {draftColumns: string[]; draftItemsRows: number} {
  const client = new DatabaseSync(file)
  const draftColumns = client
    .prepare('SELECT name FROM pragma_table_info(?)')
    .all('drafts')
    .map((row) => String(row.name))
  const draftItemsRows = client
    .prepare('SELECT name FROM __drizzle_migrations WHERE name LIKE ?')
    .all('%_draft_items').length
  client.close()
  return {draftColumns, draftItemsRows}
}

describe('openDb', () => {
  it('opens a database that applied the draft items migration under its old folder name', async () => {
    const stateRoot = tempDir('conciv-db-moved-migration-')
    const file = join(concivStateDir(stateRoot), 'conciv.db')
    await Effect.runPromise(Effect.scoped(openDb(stateRoot)))
    renameAppliedMigration(file, '20261119142244_draft_items', '20261115164723_draft_items')

    await Effect.runPromise(Effect.scoped(openDb(stateRoot)))

    const opened = readDatabase(file)
    expect(opened.draftColumns).toContain('items')
    expect(opened.draftItemsRows).toBe(1)
  })
})
