import {between, inArray} from 'drizzle-orm'
import {check, integer, real, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import {extensionTable} from '@conciv/db'
import {designConfig} from '../../shared/tolerances.js'
import {designTables} from '../tables.js'

const table = extensionTable('design')

const {fom_nodes: _view, ...tables} = designTables(table, 'runs')

const {runs} = tables

const ARTIFACT_KINDS = ['design', 'screenshot', 'source', 'transcript', 'report'] as const

const {score} = designConfig.runs

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
    lifetime: text().notNull(),
    written: integer().notNull(),
  },
  (self) => [check('artifacts_kind', inArray(self.kind, [...ARTIFACT_KINDS]).inlineParams())],
)

export const storeTables = {
  ...tables,
  artifacts,
  lanes: table('lanes', {
    run_id: integer()
      .notNull()
      .unique()
      .references(() => runs.run_id, {onDelete: 'cascade'}),
    path: text().notNull(),
    registered: integer().notNull(),
  }),
  judgements: table(
    'judgements',
    {
      run_id: integer()
        .notNull()
        .references(() => runs.run_id, {onDelete: 'cascade'}),
      target_id: text().notNull(),
      width: real().notNull(),
      score: integer().notNull(),
      reason: text().notNull(),
      judge_model: text().notNull(),
      at: integer().notNull(),
    },
    (self) => [
      uniqueIndex('judgements_judge').on(self.run_id, self.target_id, self.width, self.judge_model),
      check('judgements_score', between(self.score, score.lowest, score.highest).inlineParams()),
    ],
  ),
  reports: table('reports', {
    report_id: integer().primaryKey({autoIncrement: true}),
    wave: text().notNull(),
    artifact_id: integer().references(() => artifacts.artifact_id),
    queries: text({mode: 'json'}).$type<unknown>().notNull(),
    at: integer().notNull(),
  }),
}
