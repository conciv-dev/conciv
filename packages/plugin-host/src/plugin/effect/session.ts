import type {Session} from '../../schema/session.js'
import type {Effect} from 'effect'
import type {
  InstructionEntryInfo,
  Model,
  SessionCreateInput,
  SessionInboxCompaction,
  SessionInboxDelivery,
  SessionInboxSynthetic,
  SessionInfo,
  SessionListInput,
  SessionSyntheticInput,
  SessionUpdateInput,
} from '@conciv/plugin'
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

export interface SessionHooks {
  readonly 'experimental.idle': SessionIdle
}

export type SessionDomain = {
  readonly list: (input?: SessionListInput) => Effect.Effect<
    {
      readonly data: ReadonlyArray<SessionInfo>
      readonly cursor: {readonly previous?: string | null; readonly next?: string | null}
    },
    unknown
  >
  readonly create: (input?: SessionCreateInput) => Effect.Effect<SessionInfo, unknown>
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
  readonly synthetic: (input: SessionSyntheticInput) => Effect.Effect<SessionInboxSynthetic, unknown>
  readonly interrupt: (input: {
    readonly sessionId: SessionId
    readonly resume?: boolean | undefined
  }) => Effect.Effect<{readonly interrupted: boolean}, unknown>
  readonly update: (input: SessionUpdateInput) => Effect.Effect<void, unknown>
  readonly wait: (input: SessionInput) => Effect.Effect<void, unknown>
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
