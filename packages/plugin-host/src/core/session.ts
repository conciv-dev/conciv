export * as Session from './session.js'

import {Context, type Effect} from 'effect'
import type {
  Location,
  Model,
  Ruleset,
  SessionCreateInput,
  SessionInboxCompaction,
  SessionInboxDelivery,
  SessionInboxSynthetic,
  SessionInfo,
  SessionListInput,
  SessionSyntheticInput,
} from '@conciv/plugin'
import type {
  AgentNotFoundError,
  CompactionConflictError,
  InvalidListCursorError,
  NotFoundError,
  SyntheticConflictError,
} from './session/error.js'

type SessionId = SessionInfo['id']
type Metadata = NonNullable<SessionInfo['metadata']>

type CreateInput = SessionCreateInput &
  (
    | {location: Location.Ref; parentId?: never}
    | {parentId: Exclude<SessionCreateInput['parentId'], undefined>; location?: never}
  )

type CompactInput = {id?: string; delivery?: SessionInboxDelivery} & {sessionId: SessionId}

export interface Interface {
  readonly list: (input?: SessionListInput) => Effect.Effect<
    {
      readonly data: SessionInfo[]
      readonly cursor: {readonly previous?: string; readonly next?: string}
    },
    InvalidListCursorError
  >
  readonly create: (input: CreateInput) => Effect.Effect<SessionInfo, NotFoundError>
  readonly get: (sessionId: SessionId) => Effect.Effect<SessionInfo, NotFoundError>
  readonly remove: (sessionId: SessionId) => Effect.Effect<void, NotFoundError>
  readonly switchAgent: (input: {
    sessionId: SessionId
    agent: string
  }) => Effect.Effect<void, NotFoundError | AgentNotFoundError>
  readonly switchModel: (input: {sessionId: SessionId; model: Model.Ref}) => Effect.Effect<void, NotFoundError>
  readonly rename: (input: {sessionId: SessionId; title: string}) => Effect.Effect<void, NotFoundError>
  readonly setMetadata: (input: {sessionId: SessionId; metadata: Metadata}) => Effect.Effect<void, NotFoundError>
  readonly setPermissions: (input: {sessionId: SessionId; permissions: Ruleset}) => Effect.Effect<void, NotFoundError>
  readonly compact: (
    input: CompactInput,
  ) => Effect.Effect<SessionInboxCompaction, NotFoundError | CompactionConflictError>
  readonly wait: (id: SessionId) => Effect.Effect<void, NotFoundError>
  readonly interrupt: (sessionId: SessionId, options?: {readonly resume?: boolean}) => Effect.Effect<boolean>
  readonly synthetic: (
    input: SessionSyntheticInput,
  ) => Effect.Effect<SessionInboxSynthetic, NotFoundError | SyntheticConflictError>
}

export const Service = Context.Service<Interface>('@opencode/Session')
