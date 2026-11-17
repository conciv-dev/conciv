export * as PermissionSaved from './permission-saved.js'

import {Schema} from 'effect'
import {ascending} from '@conciv/plugin/schema/identifier'
import {ProjectId} from '@conciv/plugin/schema/project-id'
import {DateTimeUtcFromMillis, statics} from '@conciv/plugin/schema/schema'

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
