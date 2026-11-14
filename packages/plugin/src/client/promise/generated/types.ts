import type {SessionId} from '@conciv/protocol/chat-types'
import type {Json} from '../../../experimental/core.js'
import type {PublicRef} from '../../../schema/location.js'
import type {DurableEnvelope, PayloadBase} from '../../../schema/event.js'
import type {Ref} from '../../../schema/model.js'
import type {Ruleset, Source} from '../../../schema/permission.js'

export interface GenerateUsage {
  input?: number
  output?: number
}

export type GenerateNative = {[key: string]: Json}

export interface GenerateTextInput {
  readonly prompt: string
  readonly model?: Ref | null | undefined
}

export interface GenerateImageInput {
  readonly model: Ref
  readonly prompt: string
  readonly images?: ReadonlyArray<{readonly data: string; readonly mime: string; readonly name?: string}> | undefined
  readonly n?: number | undefined
  readonly aspect?: `${number}${':'}${number}` | undefined
  readonly resolution?: ('1K' | '2K' | '4K' | (string & {})) | undefined
}

export interface GenerateImageResult {
  images: Array<{type: 'image'; data: string; mime: string; name?: string}>
  cost?: number
  tokens?: GenerateUsage
  native?: GenerateNative
}

export interface GenerateDecisionsInput {
  readonly model: Ref
  readonly input: ReadonlyArray<
    | {readonly type: 'text'; readonly text: string}
    | {readonly type: 'json'; readonly value: Json}
    | {readonly type: 'file'; readonly data: string; readonly mime: string; readonly name?: string}
  >
  readonly questions: ReadonlyArray<
    | {
        readonly type: 'predicate'
        readonly name: string
        readonly instructions: string
        readonly criteria?: {readonly true?: string; readonly false?: string}
      }
    | {
        readonly type: 'choice'
        readonly name: string
        readonly instructions: string
        readonly choices: ReadonlyArray<{readonly value: string | boolean; readonly description?: string}>
      }
    | {
        readonly type: 'score'
        readonly name: string
        readonly instructions: string
        readonly levels: ReadonlyArray<{readonly label: string; readonly description?: string}>
      }
  >
}

export type GenerateChoiceValue = string | boolean

export type GenerateDecisionAnswer =
  | {type: 'predicate'; name: string; probability: number}
  | {
      type: 'choice'
      name: string
      choice: GenerateChoiceValue
      probabilities: Array<{value: GenerateChoiceValue; probability: number}>
      confidence: number
    }
  | {
      type: 'score'
      name: string
      score: number
      probabilities: Array<{value: number; label: string; probability: number}>
      confidence: number
    }
  | {type: 'error'; name: string; reason: string; message?: string}

export interface GenerateDecisionResult {
  answers: Array<GenerateDecisionAnswer>
  cost?: number
  tokens?: GenerateUsage
  native?: GenerateNative
}

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
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly id?: string | null | undefined
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

export type PluginSource =
  | {readonly type: 'builtin'}
  | {
      readonly type: 'package'
      readonly target: string
      readonly version?: string
      readonly outdated?: true
      readonly updating?: true
    }
  | {readonly type: 'local'; readonly path: string}
  | {readonly type: 'sdk'}

export interface PluginFeatures {
  readonly server?: true
  readonly rpc?: true
  readonly experimental?: true
}

export type PluginState =
  | {readonly status: 'active'}
  | {readonly status: 'failed'; readonly error: string; readonly ref?: string}

export interface PluginInfo {
  readonly id?: string
  readonly source: PluginSource
  readonly features: PluginFeatures
  readonly state: PluginState
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

export interface ModelListInput {
  readonly types?: ReadonlyArray<'chat' | 'decision' | 'image' | (string & {})> | undefined
}

export type SessionDeleted = Omit<PayloadBase, 'type' | 'data'> & {
  readonly type: 'session.deleted'
  readonly durable: DurableEnvelope
  readonly data: {readonly sessionId: SessionId}
}

type V2EventRpc = {
  id: string
  created: number
  metadata?: Record<string, unknown> | undefined
  type: `rpc.${string}`
  location: PublicRef
  data: Record<string, unknown>
}

export type EventSubscribeOutput = SessionDeleted | V2EventRpc
