import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivDb} from '@conciv/db'
import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page/page-bus.js'
import {makeBuiltinRegistry} from '../tool-registry.js'
import {makePageQueues} from '../page/page-queue.js'

export type SessionPrimitives = {
  stream: SessionBus
  page: PageEnv
  registry: ToolRegistry
}

export type SessionPrimitivesDeps = {
  db: ConcivDb
  root: string
  storeCapture: CaptureSink
  pageReplyTimeoutMs?: number
  queuedActionTimeoutMs?: number
}

export function makeSessionPrimitives(deps: SessionPrimitivesDeps): SessionPrimitives {
  const journal = makeJournal(deps.db)
  const bus = makePageBus(deps.pageReplyTimeoutMs, deps.queuedActionTimeoutMs)
  const page: PageEnv = {
    journal,
    root: deps.root,
    bus,
    storeCapture: deps.storeCapture,
    queues: makePageQueues({bus, journal}),
  }
  return {
    stream: createSessionBus(),
    page,
    registry: makeBuiltinRegistry({page}),
  }
}
