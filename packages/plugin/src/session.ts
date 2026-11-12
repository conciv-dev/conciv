import type {SessionId} from '@conciv/protocol/chat-types'
import type {RequestOptions} from './domains.js'
import type {PublicRef} from './location.js'
import type {Ref} from './model.js'
import type {Ruleset} from './permission.js'
import type {Hooks} from './registration.js'
import type {Json} from './storage.js'

export type SessionInboxDelivery = 'steer' | 'queue'

export interface TokenUsage {
  input: number
  output: number
  reasoning: number
  cache: {read: number; write: number}
}

export interface SessionInfo {
  id: SessionId
  /** Not implemented yet. Always undefined in this version. */
  parentId?: SessionId
  /** Not implemented yet. Always undefined in this version. */
  fork?: {sessionId: SessionId; boundary: {type: 'before'; messageId: string} | {type: 'through'; messageId: string}}
  /** Not implemented yet. Always undefined in this version. */
  projectId: string | undefined
  agent?: string
  model?: Ref
  cost: number
  tokens: TokenUsage
  /** Not implemented yet. Always undefined in this version. */
  outcome?: 'succeeded' | 'failed' | 'interrupted'
  time: {
    /** Not implemented yet. Always undefined in this version. */
    created: number | undefined
    updated: number
    /** Not implemented yet. Always undefined in this version. */
    busy?: number
    /** Not implemented yet. Always undefined in this version. */
    idle?: number
    /** Not implemented yet. Always undefined in this version. */
    viewed?: number
    /** Not implemented yet. Always undefined in this version. */
    archived?: number
  }
  title?: string
  /** Not implemented yet. Always undefined in this version. */
  subpath?: string
  /** Not implemented yet. Always undefined in this version. */
  metadata?: {[key: string]: Json}
  permissions?: Array<{action: string; resource: string; effect: 'allow' | 'deny' | 'ask'}>
  /** Not implemented yet. Always undefined in this version. */
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
  /** Not implemented yet. Always undefined in this version. */
  readonly order?: 'asc' | 'desc' | undefined
  readonly search?: string | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly parentId?: string | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly archived?: boolean | undefined
  readonly cursor?: string | undefined
}

export interface SessionCreateInput {
  /** Not implemented yet. Always undefined in this version. */
  readonly id?: string | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly parentId?: string | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly title?: string | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly agent?: string | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly model?: Ref | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly metadata?: {readonly [key: string]: Json} | null | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly permissions?: Ruleset | null | undefined
}

export interface SessionUpdateInput {
  readonly sessionId: SessionId
  readonly title?: string | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly metadata?: {readonly [key: string]: Json} | undefined
  readonly permissions?: Ruleset | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly archived?: boolean | undefined
}

export interface SessionInboxCompaction {
  /** Not implemented yet. Always undefined in this version. */
  id: string | undefined
  sessionId: SessionId
  time: {created: number}
  type: 'compaction'
  payload: {}
  /** Not implemented yet. Always undefined in this version. */
  delivery: SessionInboxDelivery | undefined
}

export interface SessionInboxSynthetic {
  id: string
  sessionId: SessionId
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
  readonly sessionId: SessionId
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

type SessionInput = {readonly sessionId: SessionId}

/**
 * Background work still running for the idle Session or one of its descendants. `sessionId` is
 * the Session that owns the job: the idle Session itself, or a descendant such as a subagent child.
 */
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

/**
 * Runs when a Session finishes model work and has no pending input, just before it goes idle.
 * It does not run after interruption, failure, or control-only work such as a manual compaction.
 * Input admitted by the hook, such as a synthetic message, runs in the same execution instead
 * of the Session going idle.
 *
 * `background` lists work that is still running. When the Session's own shell or subagent finishes,
 * its notice wakes the Session and the hook runs again, so a plugin that waits for that work can
 * simply return. Work a descendant owns, such as a shell a subagent left running, wakes that
 * descendant instead, so it is listed for information only. Notices admitted with `resume: false`,
 * such as those recovered after a restart, wait for the next wake. Experimental.
 */
export interface SessionIdle {
  readonly sessionId: SessionId
  /** Not implemented yet. Always undefined in this version. */
  readonly background: ReadonlyArray<SessionIdleBackground> | undefined
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
  /** Not implemented yet. Always undefined in this version. */
  readonly generate:
    | ((
        input: {readonly sessionId: SessionId; readonly prompt: string},
        requestOptions?: RequestOptions,
      ) => Promise<{text: string; tokens: TokenUsage; cost: number}>)
    | undefined
  /** Not implemented yet. Always undefined in this version. */
  readonly command: ((input: SessionCommandInput, requestOptions?: RequestOptions) => Promise<void>) | undefined
  readonly compact: (
    input: {
      readonly sessionId: SessionId
      /** Not implemented yet. Always undefined in this version. */
      readonly id?: string | undefined
      /** Not implemented yet. Always undefined in this version. */
      readonly delivery?: SessionInboxDelivery | undefined
    },
    requestOptions?: RequestOptions,
  ) => Promise<SessionInboxCompaction>
  readonly synthetic: (input: SessionSyntheticInput, requestOptions?: RequestOptions) => Promise<SessionInboxSynthetic>
  readonly interrupt: (
    input: {
      readonly sessionId: SessionId
      /** Not implemented yet. Always undefined in this version. */
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
