import type {RpcCallOptions} from '@conciv/client'
import type {PublicRef} from '@conciv/protocol/schema/location'
import type * as Model from '@conciv/protocol/schema/model'
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
    requestOptions?: RpcCallOptions,
  ) => Promise<{location: PublicRef; data: Array<Model.Info>}>
  readonly default: (requestOptions?: RpcCallOptions) => Promise<{location: PublicRef; data: Model.Info | null}>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly transform: Transform<ModelEditor> | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly reload: (() => Promise<void>) | undefined
}

export interface ModelListInput {
  readonly types?: ReadonlyArray<'chat' | 'decision' | 'image' | (string & {})> | undefined
}
