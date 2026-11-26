import {Schema} from 'effect'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {statics} from '@conciv/protocol/schema/schema'

export const EngineId = Schema.String.check(Schema.isStartingWith('eng_')).pipe(
  Schema.brand('Engine.ID'),
  Schema.annotate({identifier: 'Engine.ID'}),
  statics((schema) => ({create: (ids: Maker) => schema.make('eng_' + ids.ascending())})),
)
export type EngineId = typeof EngineId.Type
