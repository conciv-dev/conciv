import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {PageAskRequest} from '@conciv/extension'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivDb} from '@conciv/db'
import {createSessionBus, type SessionBus} from '../sessions/session-bus.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page-bus.js'
import {askPage, makeBuiltinRegistry} from '../tool-registry.js'

export type SessionPrimitives = {
  stream: SessionBus
  page: PageEnv
  registry: ToolRegistry
  askPage: (request: PageAskRequest) => Promise<unknown>
}

export type SessionPrimitivesDeps = {
  db: ConcivDb
  root: string
  storeCapture: CaptureSink
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
}

export function makeSessionPrimitives(deps: SessionPrimitivesDeps): SessionPrimitives {
  const page: PageEnv = {
    journal: makeJournal(deps.db),
    root: deps.root,
    bus: makePageBus(),
    storeCapture: deps.storeCapture,
  }
  return {
    stream: createSessionBus(),
    page,
    registry: makeBuiltinRegistry({page, bundler: deps.bundler, openInEditor: deps.openInEditor}),
    askPage: (request) => askPage({...request, page}),
  }
}
