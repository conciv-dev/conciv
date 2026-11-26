import {index, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import {Timestamps} from '../database/timestamps.js'
import type * as Job from '../job.js'
import type * as SessionMessage from '@conciv/protocol/schema/session-message'
import type {SessionId} from '@conciv/protocol/schema/session-id'

export const JobTable = sqliteTable(
  'job',
  {
    notification_id: text().$type<SessionMessage.Id>().primaryKey(),
    id: text().notNull(),
    session_id: text().$type<SessionId>().notNull(),
    child_session_id: text().$type<SessionId>(),
    kind: text().notNull(),
    title: text(),
    status: text().$type<Job.Status>().notNull(),
    output: text(),
    error: text(),
    recovery: text({mode: 'json'}).$type<Job.Recovery>().notNull(),
    ...Timestamps,
  },
  (table) => [
    index('job_session_idx').on(table.session_id),
    index('job_child_session_idx').on(table.child_session_id),
    index('job_id_idx').on(table.id),
  ],
)
