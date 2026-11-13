import type {Ref} from './location.js'

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
