import {onTestFinished} from 'vitest'
import {createComponent} from 'solid-js'
import {cleanup, render} from '@solidjs/testing-library'
import {ConcivApp, createDraftStore, type DraftStore, type Platform} from '@conciv/app'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'
import type {Engine} from './engine.js'

declare module 'vitest' {
  interface TestContext {
    pageErrors: () => Promise<string[]>
  }
}

export type MountOptions = {
  engine: Engine
  seed?: {storage?: Record<string, unknown>}
  route?: string
  host?: ConcivSettingsInit
  login?: 'none' | 'stale'
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

const REFUSED_TOKEN = 'conciv-kit-refused-token'

function boundEngine(address: Engine['address'], login: MountOptions['login']): ReturnType<Platform['engine']> {
  if (login === undefined) return {kind: 'bound', apiBase: address.apiBase, token: () => Promise.resolve(address.token)}
  const origin = new URL(address.apiBase).origin
  if (login === 'none') return {kind: 'bound', apiBase: origin}
  return {kind: 'bound', apiBase: origin, token: () => Promise.resolve(REFUSED_TOKEN)}
}

export type Mount = (options: MountOptions) => Promise<void>

export function makeMount(): Mount {
  return async (options) => {
    const {address} = options.engine
    onTestFinished(() => {
      cleanup()
      localStorage.clear()
      sessionStorage.clear()
    })
    writeStorage(options.seed?.storage ?? {})
    const interactive = Promise.withResolvers<void>()
    const platform: Platform = {
      engine: () => boundEngine(address, options.login),
      navigation: {memory: options.route ?? '/'},
      root: document,
      settings: options.host,
      timings: {engine: ENGINE_TIMINGS},
      draftStore: memoryDraftStore(),
      onInteractive: () => interactive.resolve(),
    }
    render(() => createComponent(ConcivApp, {platform}))
    await interactive.promise
  }
}
