import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivDb} from '@conciv/db'
import type {TabsListing} from '@conciv/protocol/chat-types'
import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page/page-bus.js'
import {makeBuiltinRegistry} from '../tool-registry.js'
import {makePageQueues} from '../page/page-queue.js'
import {makeHubCalls, type HubCalls} from '../api/call-trace.js'

export type SessionPrimitives = {
  stream: SessionBus
  page: PageEnv
  registry: ToolRegistry
  hubCalls: HubCalls
}

export type SessionPrimitivesDeps = {
  db: ConcivDb
  root: string
  storeCapture: CaptureSink
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
  listTabs: () => Promise<TabsListing>
}

export function makeSessionPrimitives(deps: SessionPrimitivesDeps): SessionPrimitives {
  const journal = makeJournal(deps.db)
  const bus = makePageBus()
  const hubCalls = makeHubCalls()
  const page: PageEnv = {
    journal,
    root: deps.root,
    bus,
    storeCapture: deps.storeCapture,
    queues: makePageQueues({bus, journal, hubCalls}),
  }
  return {
    stream: createSessionBus(),
    hubCalls,
    page,
    registry: makeBuiltinRegistry({
      page,
      bundler: deps.bundler,
      openInEditor: deps.openInEditor,
      listTabs: deps.listTabs,
    }),
  }
}
