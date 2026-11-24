import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {describe, expect, it} from '@effect/vitest'
import {Effect} from 'effect'
import {openDb} from './db.js'

describe('openDb', () => {
  it.effect('opens a database that applied the draft items migration under its old folder name', () =>
    Effect.gen(function* () {
      const stateRoot = tempDir('conciv-db-moved-migration-')
      const file = join(concivStateDir(stateRoot), 'conciv.db')
      yield* Effect.scoped(openDb(stateRoot))
      const renaming = new DatabaseSync(file)
      renaming
        .prepare('UPDATE __drizzle_migrations SET name = ? WHERE name = ?')
        .run('20261115164723_draft_items', '20261119142244_draft_items')
      renaming.close()

      yield* Effect.scoped(openDb(stateRoot))

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
    }),
  )
})
