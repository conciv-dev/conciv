import {Schema} from 'effect'
import {ascending} from '@conciv/protocol/schema/identifier'
import {statics} from '@conciv/protocol/schema/schema'

export const EngineId = Schema.String.check(Schema.isStartingWith('eng_')).pipe(
  Schema.brand('Engine.ID'),
  Schema.annotate({identifier: 'Engine.ID'}),
  statics((schema) => ({create: () => schema.make('eng_' + ascending())})),
)
export type EngineId = typeof EngineId.Type
