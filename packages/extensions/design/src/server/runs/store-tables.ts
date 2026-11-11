import {inArray} from 'drizzle-orm'
import {check, index, integer, real, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import {extensionTable} from '@conciv/db'
import {ARTIFACT_KINDS} from '../../shared/defs.js'
import {designTables} from '../tables.js'

const table = extensionTable('design')

const tables = designTables(table)

const {runs} = tables

const artifacts = table(
  'artifacts',
  {
    artifact_id: integer().primaryKey({autoIncrement: true}),
    run_id: integer()
      .notNull()
      .references(() => runs.run_id, {onDelete: 'cascade'}),
    session: text().notNull(),
    target_id: text(),
    round: integer(),
    width: real(),
    kind: text({enum: ARTIFACT_KINDS}).notNull(),
    path: text().notNull(),
    content_type: text().notNull(),
    size: integer().notNull(),
    checksum: text().notNull(),
    written: integer().notNull(),
  },
  (self) => [
    uniqueIndex('artifacts_path').on(self.path),
    index('artifacts_by_round').on(self.run_id, self.target_id, self.round, self.kind),
    check('artifacts_kind', inArray(self.kind, [...ARTIFACT_KINDS]).inlineParams()),
  ],
)

export const storeTables = {
  ...tables,
  artifacts,
}
