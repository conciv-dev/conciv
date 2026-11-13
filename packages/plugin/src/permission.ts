import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import type {RequestOptions} from './promise/harness.js'
import type {Hooks} from './promise/registration.js'

const Source = z.union([
  z.object({
    type: z.literal('tool'),
    messageId: z.union([z.string(), z.undefined()]),
    id: z.string(),
  }),
])

export type Source = z.infer<typeof Source>

export type Effect = 'allow' | 'deny' | 'ask'

export interface Rule {
  readonly action: string
  readonly resource: string
  readonly effect: Effect
}

export type Ruleset = ReadonlyArray<Rule>

const AssertInput = z.object({
  sessionId: SessionId,
  agent: z.string().optional(),
  action: z.string(),
  resources: z.array(z.string()),
  save: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: Source.optional(),
})

export type AssertInput = z.input<typeof AssertInput>

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
