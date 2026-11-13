import type {RequestOptions} from '../client/promise/generated/client.js'
import type {ModelListInput} from '../client/promise/generated/types.js'
import type {PublicRef} from '../schema/location.js'
import type * as Model from '../schema/model.js'
import type {Transform} from './registration.js'

export interface ModelEditor {
  list(providerId?: string): readonly Model.Info[]
  get(providerId: string, modelId: string): Model.Info | undefined
  update(providerId: string, modelId: string, update: (model: Model.Info) => void): void
  remove(providerId: string, modelId: string): void
  readonly default: {
    get(): {providerId: string; modelId: string} | undefined
    set(providerId: string, modelId: string): void
  }
}

export interface ModelDomain {
  readonly list: (
    input?: ModelListInput,
    requestOptions?: RequestOptions,
  ) => Promise<{location: PublicRef; data: Array<Model.Info>}>
  readonly default: (requestOptions?: RequestOptions) => Promise<{location: PublicRef; data: Model.Info | null}>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly transform: Transform<ModelEditor> | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly reload: (() => Promise<void>) | undefined
}
