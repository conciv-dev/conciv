import {Schema} from 'effect'
import {ascending} from '@conciv/plugin/schema/identifier'
import {statics} from '@conciv/plugin/schema/schema'

export const MarkerId = Schema.String.check(Schema.isStartingWith('mrk_')).pipe(
  Schema.brand('Marker.ID'),
  Schema.annotate({identifier: 'Marker.ID'}),
  statics((schema) => ({create: () => schema.make('mrk_' + ascending())})),
)
export type MarkerId = typeof MarkerId.Type
