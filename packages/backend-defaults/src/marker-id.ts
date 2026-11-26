import {Schema} from 'effect'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {statics} from '@conciv/protocol/schema/schema'

export const MarkerId = Schema.String.check(Schema.isStartingWith('mrk_')).pipe(
  Schema.brand('Marker.ID'),
  Schema.annotate({identifier: 'Marker.ID'}),
  statics((schema) => ({create: (ids: Maker) => schema.make('mrk_' + ids.ascending())})),
)
export type MarkerId = typeof MarkerId.Type
