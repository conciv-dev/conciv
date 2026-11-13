import type {SessionId} from '@conciv/protocol/chat-types'
import type {PublicRef, Ref} from './location.js'

export type PayloadBase = {
  readonly id: string
  readonly type: string
  readonly created: number
  readonly data: unknown
  readonly location?: Ref
  readonly metadata?: Record<string, unknown>
}

export interface DurableEnvelope {
  readonly aggregateId: string
  /** @remarks Not implemented yet. Always undefined in this version. */
  readonly seq: number | undefined
  readonly version: number
}

export type SessionDeleted = Omit<PayloadBase, 'type' | 'data'> & {
  readonly type: 'session.deleted'
  readonly durable: DurableEnvelope
  readonly data: {readonly sessionId: SessionId}
}

type RpcEvent = {
  id: string
  created: number
  metadata?: Record<string, unknown> | undefined
  type: `rpc.${string}`
  location: PublicRef
  data: Record<string, unknown>
}

export type ConcivEvent = SessionDeleted | RpcEvent

export type SelectedEvent<A extends {readonly type: string}, Type extends string> = A extends unknown
  ? [Extract<Type, A['type']>] extends [never]
    ? never
    : A
  : never

export type SubscribeOptions<Type extends string = string> = {
  readonly types?: ReadonlyArray<Type>
  readonly signal?: AbortSignal
}

type EventType = ConcivEvent['type']

export interface EventDomain {
  readonly subscribe: <Type extends EventType = EventType>(
    options?: SubscribeOptions<Type>,
  ) => AsyncIterable<SelectedEvent<ConcivEvent, Type>>
}
