import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ToolRegistry} from '@conciv/extension/registry'
import {createAskRegistry, type AskRegistry} from '../chat/ask.js'
import {createLiveRuns, type LiveRuns} from '../chat/live-runs.js'
import {createSessionStreams, type SessionStreams} from '../chat/subscribe.js'
import {makeJournal, makePageBus, type CaptureSink, type PageEnv} from '../page-bus.js'
import {makeBuiltinRegistry} from '../tool-registry.js'

export type SessionPrimitives = {
  asks: AskRegistry
  stream: SessionStreams
  liveRuns: LiveRuns
  page: PageEnv
  registry: ToolRegistry
}

export type SessionPrimitivesDeps = {
  root: string
  storeCapture: CaptureSink
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
}

export function makeSessionPrimitives(deps: SessionPrimitivesDeps): SessionPrimitives {
  const page: PageEnv = {
    journal: makeJournal(),
    root: deps.root,
    bus: makePageBus(),
    storeCapture: deps.storeCapture,
  }
  return {
    asks: createAskRegistry(),
    stream: createSessionStreams(),
    liveRuns: createLiveRuns(),
    page,
    registry: makeBuiltinRegistry({page, bundler: deps.bundler, openInEditor: deps.openInEditor}),
  }
}
