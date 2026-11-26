import type * as Session from '@conciv/protocol/schema/session'
import type {Effect, JsonSchema} from 'effect'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import type * as Model from '@conciv/protocol/schema/model'
import type {PromptInput, SessionCompactionResult, SessionRequestOptions, SystemPart} from '../promise/session.js'
import type * as Agent from '@conciv/protocol/schema/agent'
import type * as SessionInbox from '@conciv/protocol/schema/session-inbox'
import type {
  InstructionEntryInfo,
  SessionCreateInput,
  SessionInboxCompaction,
  SessionInboxDelivery,
  SessionInfo,
  SessionListInput,
  SessionSyntheticInput,
  SessionUpdateInput,
} from '../promise/session-info.js'
import type {ModelHooks} from './registration.js'

type SessionId = SessionInfo['id']
type SessionInput = {readonly sessionId: SessionId}

export type SessionIdleBackground =
  | {
      readonly kind: 'shell'
      readonly sessionId: Session.Id
      readonly shellId: string
      readonly command: string
    }
  | {
      readonly kind: 'subagent'
      readonly sessionId: Session.Id
      readonly childSessionId: Session.Id
      readonly agent: string
      readonly description: string
    }
  | {
      readonly kind: 'image'
      readonly sessionId: Session.Id
      readonly path: string
      readonly model: string
    }

export interface SessionIdle {
  readonly sessionId: Session.Id
  readonly background: ReadonlyArray<SessionIdleBackground>
}

export interface SessionPrompt {
  readonly sessionId: Session.Id
  readonly messageId: string
  prompt: PromptInput
  metadata?: Record<string, unknown>
  delivery: SessionInboxDelivery
}

export interface SessionRequest {
  readonly sessionId: Session.Id
  readonly model: Model.Ref
  system: Array<SystemPart>
  messages: Array<ModelMessage>
  options: SessionRequestOptions
}

export interface SessionContext extends SessionRequest {
  readonly agent: Agent.Id
  tools: Record<string, {description: string; input: JsonSchema.JsonSchema}>
}

export interface SessionCompaction extends SessionContext {
  result?: SessionCompactionResult
}

export interface SessionHooks {
  readonly prompt: SessionPrompt
  readonly context: SessionContext
  readonly compaction: SessionCompaction
  readonly 'experimental.idle': SessionIdle
}

export type SessionOutsideCall = {readonly sessionId: SessionId; readonly toolCallId: string}

export type SessionDomain = {
  readonly list: (input?: SessionListInput) => Effect.Effect<
    {
      readonly data: ReadonlyArray<SessionInfo>
      readonly cursor: {readonly previous?: string | null; readonly next?: string | null}
    },
    unknown
  >
  readonly create: (
    input?: Omit<SessionCreateInput, 'id'> & {readonly id?: SessionId | undefined},
  ) => Effect.Effect<SessionInfo, unknown>
  readonly get: (input: SessionInput) => Effect.Effect<SessionInfo, unknown>
  readonly remove: (input: SessionInput) => Effect.Effect<void, unknown>
  readonly switchAgent: (input: {readonly sessionId: SessionId; readonly agent: string}) => Effect.Effect<void, unknown>
  readonly switchModel: (input: {
    readonly sessionId: SessionId
    readonly model: Model.Ref
  }) => Effect.Effect<void, unknown>
  readonly generate: undefined
  readonly command: undefined
  readonly compact: (input: {
    readonly sessionId: SessionId
    readonly id?: string | undefined
    readonly delivery?: SessionInboxDelivery | undefined
  }) => Effect.Effect<SessionInboxCompaction, unknown>
  readonly synthetic: (input: SessionSyntheticInput) => Effect.Effect<SessionInbox.Synthetic, unknown>
  readonly interrupt: (input: {
    readonly sessionId: SessionId
    readonly resume?: boolean | undefined
  }) => Effect.Effect<{readonly interrupted: boolean}, unknown>
  readonly update: (input: SessionUpdateInput) => Effect.Effect<void, unknown>
  readonly wait: (input: SessionInput) => Effect.Effect<void, unknown>
  readonly expectOutside: (input: SessionOutsideCall) => Effect.Effect<void>
  readonly notifyOutside: (input: SessionOutsideCall & {readonly text: string}) => Effect.Effect<void>
  readonly instructions: {
    readonly entry: {
      readonly list: (input: SessionInput) => Effect.Effect<ReadonlyArray<InstructionEntryInfo>, unknown>
      readonly put: (input: {
        readonly sessionId: SessionId
        readonly key: string
        readonly value: InstructionEntryInfo['value']
      }) => Effect.Effect<void, unknown>
      readonly remove: (input: {readonly sessionId: SessionId; readonly key: string}) => Effect.Effect<void, unknown>
    }
  }
} & {
  readonly hook: ModelHooks<SessionHooks>
}
