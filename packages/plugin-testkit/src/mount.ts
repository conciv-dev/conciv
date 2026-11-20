import {onTestFinished} from 'vitest'
import {createComponent} from 'solid-js'
import {cleanup, render, screen} from '@solidjs/testing-library'
import {ConcivApp, createDraftStore, type DraftStore, type Platform} from '@conciv/app'
import type {Engine, EngineAddress} from './engine.js'

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

export function makeMount(engineAddress: (engine: Engine) => EngineAddress): (options: MountOptions) => Promise<void> {
  return async (options) => {
    const address = engineAddress(options.engine)
    onTestFinished(() => {
      cleanup()
      localStorage.clear()
      sessionStorage.clear()
    })
    writeStorage(options.seed?.storage ?? {})
    const platform: Platform = {
      engine: () => ({kind: 'bound', apiBase: address.apiBase, token: () => Promise.resolve(address.token)}),
      navigation: {memory: options.route ?? '/'},
      root: document,
      timings: {engine: ENGINE_TIMINGS},
      draftStore: memoryDraftStore(),
    }
    render(() => createComponent(ConcivApp, {platform}))
    await screen.findByRole('button', {name: 'Open conciv chat'})
  }
}
