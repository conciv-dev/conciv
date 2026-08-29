import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivDb} from '@conciv/db'
import {createAskRegistry, type AskRegistry} from '../chat/ask.js'
import {createCommandMemory, type CommandMemory} from '../chat/command-memory.js'
import {createSessionStreams, type SessionStreams} from '../chat/subscribe.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page-bus.js'
import {makeBuiltinRegistry} from '../tool-registry.js'

export type SessionPrimitives = {
  asks: AskRegistry
  commandMemory: CommandMemory
  stream: SessionStreams
  page: PageEnv
  registry: ToolRegistry
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
    asks: createAskRegistry(),
    commandMemory: createCommandMemory(),
    stream: createSessionStreams(),
    page,
    registry: makeBuiltinRegistry({page, bundler: deps.bundler, openInEditor: deps.openInEditor}),
  }
}
