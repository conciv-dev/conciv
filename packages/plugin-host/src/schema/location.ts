export * as Location from './location.js'

import {Schema, Struct} from 'effect'
import {AbsolutePath, optional} from './schema.js'
import {ProjectId} from './project-id.js'
import {WorkspaceId} from './workspace-id.js'

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  directory: AbsolutePath,
  workspaceId: optional(WorkspaceId),
}).annotate({identifier: 'Location.Ref'})

export const PublicRef = Schema.Struct(Struct.omit(Ref.fields, ['workspaceId'])).annotate({
  identifier: 'Location.PublicRef',
})
export interface PublicRef extends Schema.Schema.Type<typeof PublicRef> {}

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  directory: AbsolutePath,
  workspaceId: optional(WorkspaceId),
  project: Schema.Struct({
    id: ProjectId,
  }),
}).annotate({identifier: 'Location.Info'})
