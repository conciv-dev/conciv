import {SqliteClient} from '@effect/sql-sqlite-node'
import {Layer} from 'effect'
import type {SqlClient} from 'effect/sql'

export const supportsTuningPragmas = true

export const supportsForeignKeyToggle = true

export const sqliteLayer = (
  config: SqliteClient.SqliteClientConfig,
): Layer.Layer<SqliteClient.SqliteClient | SqlClient.SqlClient> => Layer.orDie(SqliteClient.layer(config))
