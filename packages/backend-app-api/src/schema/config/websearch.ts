import {Schema} from 'effect'

export const Id = Schema.String.pipe(Schema.brand('WebSearch.ID'), Schema.annotate({identifier: 'WebSearch.ID'}))
export type Id = typeof Id.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  provider: Schema.Union([
    Schema.Literal('random').annotate({
      description:
        'Reuse a randomly selected provider until it is rate limited, then switch to another available provider.',
    }),
    Id,
  ]),
}).annotate({identifier: 'ConfigWebSearch.Info'})

export const Selection = Schema.Union([Schema.Literal(false), Info])
export type Selection = typeof Selection.Type
