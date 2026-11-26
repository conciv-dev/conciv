import type {Effect} from 'effect'
import type * as Job from '@conciv/protocol/schema/job'
import type {SessionId} from '@conciv/protocol/schema/session-id'

export type JobInfo = {
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly status: Job.Status
  readonly started_at: number
  readonly completed_at?: number
  readonly output?: string
  readonly error?: string
  readonly metadata?: Record<string, unknown>
  readonly notificationID?: string
}

export type JobRecovery = {readonly kind: 'page-queue'; readonly sessionID: SessionId; readonly queueId: string}

export type JobWaitInput = {readonly id: string; readonly timeout?: number}

export type JobWaitResult = {readonly info?: JobInfo; readonly timedOut: boolean}

export type JobBlockInput = {readonly id: string; readonly sessionID: SessionId}

export type JobBlockResult = {readonly type: 'finished' | 'backgrounded'; readonly info: JobInfo}

export type JobStartInput = {
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly metadata?: Record<string, unknown>
  readonly recovery?: JobRecovery
  readonly background?: boolean
  readonly run: Effect.Effect<string, unknown>
  readonly cancel?: Effect.Effect<void>
}

export interface JobDomain {
  readonly start: (input: JobStartInput) => Effect.Effect<JobInfo>
  readonly get: (id: string) => Effect.Effect<JobInfo | undefined>
  readonly wait: (input: JobWaitInput) => Effect.Effect<JobWaitResult>
  readonly block: (input: JobBlockInput) => Effect.Effect<JobBlockResult | undefined>
  readonly background: (id: string) => Effect.Effect<JobInfo | undefined>
  readonly cancel: (id: string) => Effect.Effect<JobInfo | undefined>
  readonly completeBackground: (notificationID: string) => Effect.Effect<void>
}
