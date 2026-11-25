import type {Location} from '@conciv/protocol/schema/location'
import type {Model} from '@conciv/protocol/schema/model'
import type {Effect} from 'effect'

export interface ModelDomain {
  readonly list: (input?: {
    readonly location?: {readonly directory?: string | undefined} | undefined
    readonly types?: ReadonlyArray<Model.Type> | undefined
  }) => Effect.Effect<{readonly location: Location.PublicRef; readonly data: ReadonlyArray<Model.Info>}, unknown>
  readonly default: (input?: {
    readonly location?: {readonly directory?: string | undefined} | undefined
  }) => Effect.Effect<{readonly location: Location.PublicRef; readonly data: Model.Info | undefined}, unknown>
}
