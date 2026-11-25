export * as PermissionSaved from './permission-saved.js'

import {Schema} from 'effect'
import {ascending} from '@conciv/protocol/schema/identifier'
import {ProjectId} from '@conciv/protocol/schema/project-id'
import {DateTimeUtcFromMillis, statics} from '@conciv/protocol/schema/schema'

export const Id = Schema.String.pipe(
  Schema.brand('PermissionSaved.ID'),
  Schema.annotate({identifier: 'PermissionSaved.ID'}),
  statics((schema) => ({create: () => schema.make('psv_' + ascending())})),
)
export type Id = typeof Id.Type

export const Info = Schema.Struct({
  id: Id,
  projectId: ProjectId,
  action: Schema.String,
  resource: Schema.String,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
  }),
}).annotate({identifier: 'PermissionSaved.Info'})
export interface Info extends Schema.Schema.Type<typeof Info> {}
