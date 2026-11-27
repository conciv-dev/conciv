import {Context, type Effect} from 'effect'
import type {
  Location,
  Model,
  Ruleset,
  SessionCreateInput,
  SessionInboxCompaction,
  SessionInboxDelivery,
  SessionInfo,
  SessionListInput,
} from '@conciv/backend-plugin-api'
import type {EvlogError} from 'evlog'
import type * as SessionInbox from '@conciv/protocol/schema/session-inbox'
import type {SessionId as ProtocolSessionId} from '@conciv/protocol/schema/session-id'
import type * as SessionMessage from '@conciv/protocol/schema/session-message'

type SessionId = SessionInfo['id']
type Metadata = NonNullable<SessionInfo['metadata']>

type CreateInput = Omit<SessionCreateInput, 'id'> & {id?: SessionId} & (
    | {location: Location.Ref; parentId?: never}
    | {parentId: Exclude<SessionCreateInput['parentId'], undefined>; location?: never}
  )

type SyntheticInput = {
  sessionID: ProtocolSessionId
  id?: SessionMessage.Id
  text: string
  description?: string
  metadata?: Record<string, unknown>
  delivery?: SessionInbox.Delivery
  resume?: boolean
}

type CompactInput = {id?: string; delivery?: SessionInboxDelivery} & {sessionId: SessionId}

export interface Interface {
  readonly list: (input?: SessionListInput) => Effect.Effect<
    {
      readonly data: SessionInfo[]
      readonly cursor: {readonly previous?: string; readonly next?: string}
    },
    EvlogError
  >
  readonly create: (input: CreateInput) => Effect.Effect<SessionInfo, EvlogError>
  readonly get: (sessionId: SessionId) => Effect.Effect<SessionInfo, EvlogError>
  readonly remove: (sessionId: SessionId) => Effect.Effect<void, EvlogError>
  readonly switchAgent: (input: {sessionId: SessionId; agent: string}) => Effect.Effect<void, EvlogError>
  readonly switchModel: (input: {sessionId: SessionId; model: Model.Ref}) => Effect.Effect<void, EvlogError>
  readonly rename: (input: {sessionId: SessionId; title: string}) => Effect.Effect<void, EvlogError>
  readonly setMetadata: (input: {sessionId: SessionId; metadata: Metadata}) => Effect.Effect<void, EvlogError>
  readonly setPermissions: (input: {sessionId: SessionId; permissions: Ruleset}) => Effect.Effect<void, EvlogError>
  readonly compact: (input: CompactInput) => Effect.Effect<SessionInboxCompaction, EvlogError>
  readonly synthetic: (input: SyntheticInput) => Effect.Effect<SessionInbox.Synthetic, EvlogError>
  readonly wait: (id: SessionId) => Effect.Effect<void, EvlogError>
  readonly interrupt: (sessionId: SessionId, options?: {readonly resume?: boolean}) => Effect.Effect<boolean>
}

export const Service = Context.Service<Interface>('@conciv/Session')
