import type {SessionId} from '@conciv/protocol/chat-types'
import type {RequestOptions} from '../client/promise/generated/client.js'
import type {
  InstructionEntryInfo,
  SessionCommandInput,
  SessionCreateInput,
  SessionInboxCompaction,
  SessionInboxDelivery,
  SessionInboxSynthetic,
  SessionInfo,
  SessionListInput,
  SessionSyntheticInput,
  SessionUpdateInput,
  TokenUsageInfo,
} from '../client/promise/generated/types.js'
import type {Ref} from '../schema/model.js'
import type {Json} from '../experimental/core.js'
import type {Hooks} from './registration.js'

type SessionInput = {readonly sessionId: SessionId}

export type SessionIdleBackground =
  | {
      readonly kind: 'shell'
      readonly sessionId: SessionId
      readonly shellId: string
      readonly command: string
    }
  | {
      readonly kind: 'subagent'
      readonly sessionId: SessionId
      readonly childSessionId: SessionId
      readonly agent: string
      readonly description: string
    }
  | {
      readonly kind: 'image'
      readonly sessionId: SessionId
      readonly path: string
      readonly model: string
    }

export interface SessionIdle {
  readonly sessionId: SessionId
  readonly background: ReadonlyArray<SessionIdleBackground>
}

export interface SessionHooks {
  readonly 'experimental.idle': SessionIdle
}

export interface SessionDomain {
  readonly list: (
    input?: SessionListInput,
    requestOptions?: RequestOptions,
  ) => Promise<{data: Array<SessionInfo>; cursor: {previous?: string | null; next?: string | null}}>
  readonly create: (input?: SessionCreateInput, requestOptions?: RequestOptions) => Promise<SessionInfo>
  readonly get: (input: SessionInput, requestOptions?: RequestOptions) => Promise<SessionInfo>
  readonly remove: (input: SessionInput, requestOptions?: RequestOptions) => Promise<void>
  readonly switchAgent: (
    input: {readonly sessionId: SessionId; readonly agent: string},
    requestOptions?: RequestOptions,
  ) => Promise<void>
  readonly switchModel: (
    input: {readonly sessionId: SessionId; readonly model: Ref},
    requestOptions?: RequestOptions,
  ) => Promise<void>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly generate:
    | ((
        input: {readonly sessionId: SessionId; readonly prompt: string},
        requestOptions?: RequestOptions,
      ) => Promise<{text: string; tokens: TokenUsageInfo; cost: number}>)
    | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly command: ((input: SessionCommandInput, requestOptions?: RequestOptions) => Promise<void>) | undefined
  readonly compact: (
    input: {
      readonly sessionId: SessionId
      /** @remarks Not implemented yet. Always undefined in this version. */
      readonly id?: string | undefined
      /** @remarks Not implemented yet. Always undefined in this version. */
      readonly delivery?: SessionInboxDelivery | undefined
    },
    requestOptions?: RequestOptions,
  ) => Promise<SessionInboxCompaction>
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly synthetic:
    | ((input: SessionSyntheticInput, requestOptions?: RequestOptions) => Promise<SessionInboxSynthetic>)
    | undefined
  readonly interrupt: (
    input: {
      readonly sessionId: SessionId
      readonly resume?: boolean | undefined
    },
    requestOptions?: RequestOptions,
  ) => Promise<{interrupted: boolean}>
  readonly update: (input: SessionUpdateInput, requestOptions?: RequestOptions) => Promise<void>
  readonly wait: (input: SessionInput, requestOptions?: RequestOptions) => Promise<void>
  readonly instructions: {
    readonly entry: {
      readonly list: (input: SessionInput, requestOptions?: RequestOptions) => Promise<Array<InstructionEntryInfo>>
      readonly put: (
        input: {readonly sessionId: SessionId; readonly key: string; readonly value: Json},
        requestOptions?: RequestOptions,
      ) => Promise<void>
      readonly remove: (
        input: {readonly sessionId: SessionId; readonly key: string},
        requestOptions?: RequestOptions,
      ) => Promise<void>
    }
  }
  readonly hook: Hooks<SessionHooks>
}
