import {onTestFinished} from 'vitest'
import {createComponent} from 'solid-js'
import {cleanup, render, screen, waitFor} from '@solidjs/testing-library'
import {ConcivApp, createDraftStore, type DraftStore, type Platform} from '@conciv/app'
import type {Engine, EngineAddress} from './engine.js'

declare module 'vitest' {
  interface TestContext {
    pageErrors: () => Promise<string[]>
  }
}

export type MountOptions = {
  engine: Engine
  seed?: {storage?: Record<string, unknown>}
  route?: string
}

const ENGINE_TIMINGS: NonNullable<Platform['timings']>['engine'] = {
  reconnectMinDelayMs: 10,
  reconnectMaxDelayMs: 50,
  connectionLossRetryDelayMs: 10,
  offlineGraceMs: 10,
}

function memoryDraftStore(): DraftStore {
  const documents: Record<string, string> = {}
  const blobs: Record<string, Blob> = {}
  return createDraftStore({
    get: async (key) => documents[key] ?? null,
    set: async (key, value) => {
      documents[key] = value
      return []
    },
    remove: async (key) => {
      delete documents[key]
    },
    keys: async () => Object.keys(documents),
    clear: async () => {
      for (const key of Object.keys(documents)) delete documents[key]
      for (const key of Object.keys(blobs)) delete blobs[key]
    },
    putBlob: async (blob) => {
      const id = crypto.randomUUID()
      blobs[id] = blob
      return id
    },
    getBlob: async (id) => blobs[id] ?? null,
  })
}

function writeStorage(storage: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(storage))
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
}

export type Mount = (options: MountOptions) => Promise<void>

type Mounted = {unmount: () => void; draftStore: DraftStore}

function boundPlatform(address: EngineAddress, route: string | undefined, draftStore: DraftStore): Platform {
  return {
    engine: () => ({kind: 'bound', apiBase: address.apiBase, token: () => Promise.resolve(address.token)}),
    navigation: route === undefined ? 'engine' : {memory: route},
    root: document,
    timings: {engine: ENGINE_TIMINGS},
    draftStore,
  }
}

function assertAppShown(): void {
  if (screen.queryByRole('button', {name: 'Open conciv chat'})) return
  if (screen.queryByRole('dialog', {name: 'conciv chat agent'})) return
  throw new Error('the conciv app shows neither its launcher nor its chat')
}

type MountState = {mounted: Mounted | undefined}

function reloadOrStart(state: MountState): DraftStore {
  const earlier = state.mounted
  if (earlier) {
    earlier.unmount()
    return earlier.draftStore
  }
  onTestFinished(() => {
    state.mounted = undefined
    cleanup()
    localStorage.clear()
    sessionStorage.clear()
  })
  return memoryDraftStore()
}

export function makeMount(engineAddress: (engine: Engine) => EngineAddress): Mount {
  const state: MountState = {mounted: undefined}
  return async (options) => {
    const draftStore = reloadOrStart(state)
    writeStorage(options.seed?.storage ?? {})
    const platform = boundPlatform(engineAddress(options.engine), options.route, draftStore)
    const {unmount} = render(() => createComponent(ConcivApp, {platform}))
    state.mounted = {unmount, draftStore}
    await waitFor(assertAppShown)
  }
}
