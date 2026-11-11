import {inArray} from 'drizzle-orm'
import {check, integer, real, text} from 'drizzle-orm/sqlite-core'
import {extensionTable} from '@conciv/db'
import {designTables} from '../tables.js'

const table = extensionTable('design')

const tables = designTables(table)

const {runs} = tables

const ARTIFACT_KINDS = ['design', 'screenshot', 'source', 'transcript', 'source_diff'] as const

const artifacts = table(
  'artifacts',
  {
    artifact_id: integer().primaryKey({autoIncrement: true}),
    run_id: integer().references(() => runs.run_id, {onDelete: 'cascade'}),
    kind: text({enum: ARTIFACT_KINDS}).notNull(),
    width: real(),
    path: text().notNull(),
    size: integer().notNull(),
    checksum: text().notNull(),
    written: integer().notNull(),
  },
  (self) => [check('artifacts_kind', inArray(self.kind, [...ARTIFACT_KINDS]).inlineParams())],
)

export const storeTables = {
  ...tables,
  artifacts,
}
