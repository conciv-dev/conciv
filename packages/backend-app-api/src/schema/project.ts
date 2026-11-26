import {Schema} from 'effect'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import {ProjectId} from '@conciv/protocol/schema/project-id'

export const Id = ProjectId
export type Id = typeof Id.Type

const VcsType = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9._-]*$/u))

export const Vcs = Schema.Struct({type: VcsType, store: AbsolutePath}).annotate({identifier: 'Project.Vcs'})
export type Vcs = typeof Vcs.Type
