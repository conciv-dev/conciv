import type {SessionId} from '@conciv/types/chat-types'
import type {RpcCallOptions} from '@conciv/client/plugin'
import type {AssertInput} from '../permission.js'
import type {Effect, Source} from '@conciv/protocol/schema/permission'
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
    requestOptions?: RpcCallOptions,
  ) => Promise<Array<PermissionRequest>>
  readonly get: (
    input: {readonly sessionId: SessionId; readonly requestId: string},
    requestOptions?: RpcCallOptions,
  ) => Promise<PermissionRequest>
  readonly reply: (input: PermissionReplyInput, requestOptions?: RpcCallOptions) => Promise<void>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly hook: Hooks<PermissionHooks> | undefined
  readonly assert: (input: typeof AssertInput.Encoded) => Promise<void>
}
export interface PermissionRequest {
  readonly id: string
  readonly sessionId: SessionId
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly save?: ReadonlyArray<string>
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly source?: Source
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly message?: string
}

export interface PermissionReplyInput {
  readonly sessionId: SessionId
  readonly requestId: string
  readonly decision: 'once' | 'always' | 'reject'
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly message?: string | undefined
}
