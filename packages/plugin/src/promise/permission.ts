import type {SessionId} from '@conciv/protocol/chat-types'
import type {RequestOptions} from '../client/promise/generated/client.js'
import type {PermissionReplyInput, PermissionRequest} from '../client/promise/generated/types.js'
import type {AssertInput} from '../permission.js'
import type {Effect, Source} from '../schema/permission.js'
import type {Hooks} from './registration.js'

export interface PermissionEvaluation {
  readonly sessionId: SessionId
  readonly agent?: string
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly metadata?: Record<string, unknown>
  readonly source?: Source
  effect: Effect
  message?: string
}

export interface PermissionHooks {
  readonly evaluate: PermissionEvaluation
}

export interface PermissionDomain {
  readonly list: (
    input: {readonly sessionId: SessionId},
    requestOptions?: RequestOptions,
  ) => Promise<Array<PermissionRequest>>
  readonly get: (
    input: {readonly sessionId: SessionId; readonly requestId: string},
    requestOptions?: RequestOptions,
  ) => Promise<PermissionRequest>
  readonly reply: (input: PermissionReplyInput, requestOptions?: RequestOptions) => Promise<void>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly hook: Hooks<PermissionHooks> | undefined
  readonly assert: (input: AssertInput) => Promise<void>
}
