import {sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Project} from '../../schema/project.js'
import {Timestamps} from '../database/schema.sql.js'
import type {PermissionSaved} from '../../schema/permission-saved.js'

export const PermissionTable = sqliteTable(
  'permission',
  {
    id: text().$type<PermissionSaved.Id>().primaryKey(),
    project_id: text().$type<Project.Id>().notNull(),
    action: text().notNull(),
    resource: text().notNull(),
    ...Timestamps,
  },
  (table) => [uniqueIndex('permission_project_action_resource_idx').on(table.project_id, table.action, table.resource)],
)
