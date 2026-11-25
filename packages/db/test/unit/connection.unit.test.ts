import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/types/state-types'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {openDb} from '../../src/connection.js'

describe('openDb', () => {
  it('opens a database that applied the draft items migration under its old folder name', async () => {
    const stateRoot = tempDir('conciv-db-moved-migration-')
    const file = join(concivStateDir(stateRoot), 'conciv.db')
    await Effect.runPromise(Effect.scoped(openDb(stateRoot)))
    const renaming = new DatabaseSync(file)
    renaming
      .prepare('UPDATE __drizzle_migrations SET name = ? WHERE name = ?')
      .run('20261115164723_draft_items', '20261119142244_draft_items')
    renaming.close()

    await Effect.runPromise(Effect.scoped(openDb(stateRoot)))

    const opened = new DatabaseSync(file)
    const draftColumns = opened
      .prepare('SELECT name FROM pragma_table_info(?)')
      .all('drafts')
      .map((row) => String(row.name))
    const draftItemsRows = opened
      .prepare('SELECT name FROM __drizzle_migrations WHERE name LIKE ?')
      .all('%_draft_items')
    opened.close()
    expect(draftColumns).toContain('items')
    expect(draftItemsRows).toHaveLength(1)
  })
})
