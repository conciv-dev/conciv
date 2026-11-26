import {sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Brand} from 'effect'
import {Timestamps} from '../database/timestamps.js'

export const PermissionTable = sqliteTable(
  'permission',
  {
    id: text().$type<string & Brand.Brand<'PermissionSaved.ID'>>().primaryKey(),
    project_id: text().$type<string & Brand.Brand<'Project.ID'>>().notNull(),
    action: text().notNull(),
    resource: text().notNull(),
    ...Timestamps,
  },
  (table) => [uniqueIndex('permission_project_action_resource_idx').on(table.project_id, table.action, table.resource)],
)
