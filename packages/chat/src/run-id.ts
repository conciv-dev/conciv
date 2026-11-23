import {Schema} from 'effect'
import {ascending} from '@conciv/plugin/schema/identifier'
import {statics} from '@conciv/plugin/schema/schema'

export const RunId = Schema.String.check(Schema.isStartingWith('run_')).pipe(
  Schema.brand('Run.ID'),
  Schema.annotate({identifier: 'Run.ID'}),
  statics((schema) => ({create: () => schema.make('run_' + ascending())})),
)
export type RunId = typeof RunId.Type
