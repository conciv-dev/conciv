import type {SessionId} from '@conciv/types/chat-types'
import type {Json} from '@conciv/types/json'
import type {PublicRef} from '@conciv/protocol/schema/location'
import type {Ref} from '@conciv/protocol/schema/model'
import type {Ruleset} from '@conciv/protocol/schema/permission'

export type SessionInboxDelivery = 'steer' | 'queue'

export interface TokenUsageInfo {
  input: number
  output: number
  reasoning: number
  cache: {read: number; write: number}
}

export interface SessionInfo {
  id: SessionId
  /** @remarks Not implemented yet. Always undefined in this version. */
  parentId?: SessionId
  /** @remarks Not implemented yet. Always undefined in this version. */
  fork?: {sessionId: SessionId; boundary: {type: 'before'; messageId: string} | {type: 'through'; messageId: string}}
  /** @remarks Not implemented yet. Always undefined in this version. */
  projectId: string | undefined
  agent?: string
  model?: Ref
  cost: number
  tokens: TokenUsageInfo
  /** @remarks Not implemented yet. Always undefined in this version. */
  outcome?: 'succeeded' | 'failed' | 'interrupted'
  time: {
    created: number
    updated: number
    /** @remarks Not implemented yet. Always undefined in this version. */
    busy?: number
    /** @remarks Not implemented yet. Always undefined in this version. */
    idle?: number
    /** @remarks Not implemented yet. Always undefined in this version. */
    viewed?: number
    /** @remarks Not implemented yet. Always undefined in this version. */
    archived?: number
  }
  title?: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  subpath?: string
  metadata?: {[key: string]: Json}
  permissions?: Ruleset
  /** @remarks Not implemented yet. Always undefined in this version. */
  revert?: {
    messageId: string
    partId?: string
    snapshot?: string
    files?: Array<{
      file: string
      patch: string
      additions: number
      deletions: number
      status: 'added' | 'deleted' | 'modified'
      more?: true
    }>
  }
  location: PublicRef
}

export interface SessionListInput {
  readonly limit?: number | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly order?: 'asc' | 'desc' | undefined
  readonly search?: string | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly parentId?: string | null | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly archived?: boolean | undefined
  readonly cursor?: string | undefined
}

export interface SessionCreateInput {
  readonly id?: string | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly parentId?: string | null | undefined
  readonly title?: string | null | undefined
  readonly agent?: string | null | undefined
  readonly model?: Ref | null | undefined
  readonly metadata?: {readonly [key: string]: Json} | null | undefined
  readonly permissions?: Ruleset | null | undefined
}

export interface SessionUpdateInput {
  readonly sessionId: SessionId
  readonly title?: string | undefined
  readonly metadata?: {readonly [key: string]: Json} | undefined
  readonly permissions?: Ruleset | undefined
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly archived?: boolean | undefined
}

export interface SessionInboxCompaction {
  /** @remarks Not implemented yet. Always undefined in this version. */
  id: string | undefined
  sessionId: SessionId
  time: {created: number}
  type: 'compaction'
  payload: {}
  /** @remarks Not implemented yet. Always undefined in this version. */
  delivery: SessionInboxDelivery | undefined
}

export interface SessionInboxSynthetic {
  id: string
  sessionID: SessionId
  time: {created: number}
  type: 'synthetic'
  payload: {text: string; description?: string; metadata?: {[key: string]: Json}}
  delivery: SessionInboxDelivery
}

export interface PromptMention {
  readonly start: number
  readonly end: number
  readonly text: string
}

export interface SessionCommandInput {
  readonly sessionId: SessionId
  readonly name: string
  readonly text: string
  readonly files?:
    | ReadonlyArray<{
        readonly uri: string
        readonly source?: {readonly type: 'inline'} | {readonly type: 'uri'; readonly uri: string}
        readonly name?: string
        readonly description?: string
        readonly mention?: PromptMention
      }>
    | undefined
  readonly agents?: ReadonlyArray<{readonly name: string; readonly mention?: PromptMention}> | undefined
  readonly skills?: ReadonlyArray<{readonly id: string; readonly mention?: PromptMention}> | undefined
  readonly delivery?: SessionInboxDelivery | null | undefined
}

export interface SessionSyntheticInput {
  readonly sessionID: SessionId
  readonly id?: string | null | undefined
  readonly text: string
  readonly description?: string | null | undefined
  readonly metadata?: {readonly [key: string]: Json} | undefined
  readonly delivery?: SessionInboxDelivery | null | undefined
  readonly resume?: boolean | null | undefined
}

export interface InstructionEntryInfo {
  key: string
  value: Json
}
