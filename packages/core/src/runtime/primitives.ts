import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivDb} from '@conciv/db'
import type {TabsListing} from '@conciv/protocol/chat-types'
import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page-bus.js'
import {makeBuiltinRegistry} from '../tool-registry.js'
import {makePageQueues} from '../page-queue.js'

export type SessionPrimitives = {
  stream: SessionBus
  page: PageEnv
  registry: ToolRegistry
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
    registry: makeBuiltinRegistry({
      page,
      bundler: deps.bundler,
      openInEditor: deps.openInEditor,
      listTabs: deps.listTabs,
    }),
  }
}
