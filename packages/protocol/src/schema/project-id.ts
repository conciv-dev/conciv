import {Schema} from 'effect'
import {statics} from './schema.js'

export const ProjectId = Schema.String.pipe(
  Schema.brand('Project.ID'),
  Schema.annotate({identifier: 'Project.ID'}),
  statics((schema) => ({global: schema.make('global')})),
)
export type ProjectId = typeof ProjectId.Type
