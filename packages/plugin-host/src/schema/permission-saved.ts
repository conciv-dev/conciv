export * as PermissionSaved from './permission-saved.js'

import {Schema} from 'effect'
import {ascending} from './identifier.js'
import {ProjectId} from './project-id.js'
import {DateTimeUtcFromMillis, statics} from './schema.js'

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
