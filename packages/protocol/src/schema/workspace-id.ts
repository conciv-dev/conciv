import {Schema} from 'effect'
import type {Maker} from './identifier.js'
import {statics} from './schema.js'

export const WorkspaceId = Schema.String.check(Schema.isStartingWith('wrk')).pipe(
  Schema.brand('Workspace.ID'),
  Schema.annotate({identifier: 'Workspace.ID'}),
  statics((schema) => {
    const create = (ids: Maker) => schema.make('wrk_' + ids.ascending())
    return {
      ascending: (ids: Maker, id?: string) => {
        if (!id) return create(ids)
        return schema.make(id)
      },
      create,
    }
  }),
)
export type WorkspaceId = typeof WorkspaceId.Type
