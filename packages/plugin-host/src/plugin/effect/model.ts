import type {Location} from '../../schema/location.js'
import type {Model} from '../../schema/model.js'
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
