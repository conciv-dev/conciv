import {Context, type Effect, Schema} from 'effect'
import * as SessionMessage from '@conciv/protocol/schema/session-message'
import type {SessionId} from '@conciv/protocol/schema/session-id'
import type * as JobList from './job/list.js'
import {type Recovery, RecoverySchema} from './job/recovery.js'

export type {Recovery}

export const BlockingParent = Context.Reference<string | undefined>('@conciv/Job/BlockingParent', {
  defaultValue: () => undefined,
})

const Background = Schema.Struct({
  id: Schema.String,
  notificationID: SessionMessage.Id,
  recovery: RecoverySchema,
  status: Schema.Literals(['running', 'completed', 'error', 'cancelled']),
  output: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
})

export type Background = typeof Background.Type
export type Status = Background['status']

export type SubagentReportState =
  | {
      readonly mode: 'background'
      readonly notificationID: SessionMessage.Id
      readonly recovery: Extract<Recovery, {kind: 'subagent'}>
      readonly startedAt: number
    }
  | {readonly mode: 'none'}

export type SubagentOutboxReport = {
  readonly notificationID: SessionMessage.Id
  readonly recovery: Extract<Recovery, {kind: 'subagent'}>
  readonly status: Exclude<Status, 'running'>
  readonly output?: string
  readonly error?: string
  readonly startedAt?: number
}

export const decodeBackground = Schema.decodeUnknownResult(Background)

export type Info = {
  id: string
  type: string
  title?: string
  status: Status
  started_at: number
  completed_at?: number
  output?: string
  error?: string
  metadata?: Record<string, unknown>
  notificationID?: SessionMessage.Id
}

export type StartInput = {
  id: string
  type: string
  title?: string
  metadata?: Record<string, unknown>
  recovery?: Recovery
  notificationID?: SessionMessage.Id
  background?: boolean
  run: Effect.Effect<string, unknown>
  cancel?: Effect.Effect<void>
}

export type WaitInput = {
  id: string
  timeout?: number
}

export type WaitResult = {
  info?: Info
  timedOut: boolean
}

export type BlockInput = {
  id: string
  sessionID: SessionId
}

export type BlockResult = {type: 'finished'; info: Info} | {type: 'backgrounded'; info: Info}

export type BackgroundAllInput = {
  sessionID: SessionId
  type?: string
}

export interface Interface {
  readonly get: (id: string) => Effect.Effect<Info | undefined>
  readonly start: (input: StartInput) => Effect.Effect<Info>
  readonly wait: (input: WaitInput) => Effect.Effect<WaitResult>
  readonly block: (input: BlockInput) => Effect.Effect<BlockResult | undefined>
  readonly background: (id: string) => Effect.Effect<Info | undefined>
  readonly backgroundAll: (input: BackgroundAllInput) => Effect.Effect<Info[]>
  readonly cancel: (id: string) => Effect.Effect<Info | undefined>
  readonly cancelSession: (sessionID: SessionId) => Effect.Effect<Info[]>
  readonly pendingBackground: Effect.Effect<readonly Background[]>
  readonly runningBackground: Effect.Effect<readonly Recovery[]>
  readonly backgroundJobs: Effect.Effect<readonly JobList.Item[]>
  readonly completeBackground: (notificationID: SessionMessage.Id) => Effect.Effect<void>
  readonly isCancelled: (id: string) => Effect.Effect<boolean>
  readonly currentGeneration: (
    id: string,
  ) => Effect.Effect<{readonly generation: number; readonly running: boolean} | undefined>
  readonly prepareSubagentReport: (id: string, boundGeneration?: number) => Effect.Effect<SubagentReportState>
  readonly recordSubagentReport: (report: SubagentOutboxReport) => Effect.Effect<void>
  readonly deleteBackgroundRow: (notificationID: SessionMessage.Id) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@conciv/Job')
