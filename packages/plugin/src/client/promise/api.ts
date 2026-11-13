import type {RequestOptions} from './generated/client.js'
import type {
  GenerateDecisionResult,
  GenerateDecisionsInput,
  GenerateImageInput,
  GenerateImageResult,
  GenerateTextInput,
} from './generated/types.js'

export type {RpcApi, RpcCallOptions, RpcClient, RpcEventPayload} from './rpc.js'
export type {SelectedEvent, SubscribeOptions} from '../shared-events.js'

export interface ExperimentalGenerateApi {
  readonly text: (input: GenerateTextInput, requestOptions?: RequestOptions) => Promise<{text: string}>
  readonly image: (input: GenerateImageInput, requestOptions?: RequestOptions) => Promise<GenerateImageResult>
  readonly decisions: (
    input: GenerateDecisionsInput,
    requestOptions?: RequestOptions,
  ) => Promise<GenerateDecisionResult>
}
