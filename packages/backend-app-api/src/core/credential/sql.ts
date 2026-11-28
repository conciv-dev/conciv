import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import {Timestamps} from '../database/timestamps.js'
import type * as Credential from '../credential.js'

export const CredentialTable = sqliteTable('credential', {
  id: text().$type<Credential.Id>().primaryKey(),
  integration_id: text().$type<Credential.Info['integrationId']>(),
  label: text().notNull(),
  value: text({mode: 'json'}).$type<Credential.StoredValue>().notNull(),
  connector_id: text(),
  method_id: text(),
  active: integer({mode: 'boolean'}),
  ...Timestamps,
})
