import {inject, onTestFinished} from 'vitest'
import {createComponent} from 'solid-js'
import {cleanup, render} from '@solidjs/testing-library'
import {createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {ConcivApp, WIDGET_LAYER, createDraftStore, keepLastScreen, type DraftStore, type Platform} from '@conciv/app'
import type {ConcivConfig, ConcivSettingsInit} from '@conciv/protocol/config-types'
import {loaders} from 'virtual:conciv-test-plugins'
import type {Engine} from './engine.js'

declare module 'vitest' {
  interface TestContext {
    pageErrors: () => Promise<string[]>
  }
}

export type MountOptions = {
  engine?: Engine
  plugins?: ConcivConfig['plugins']
  seed?: {storage?: Record<string, unknown>}
  history?: RouterHistory | EngineRouterHistory
  host?: ConcivSettingsInit
  login?: 'none'
}

const TIMINGS: NonNullable<Platform['timings']> = {
  engine: {reconnectMinDelayMs: 10, reconnectMaxDelayMs: 50, connectionLossRetryDelayMs: 10, offlineGraceMs: 10},
  chatRunReconnect: {firstDelayMs: 10, maxDelayMs: 50},
  queryRetryDelayMs: 10,
  picker: {searchWaitMs: 0, previewWaitMs: 0},
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

type ComposedPlugin = NonNullable<Platform['plugins']>[number]

type PluginEntry = NonNullable<ConcivConfig['plugins']>[number]

async function composePlugin(entry: PluginEntry): Promise<ComposedPlugin> {
  const [name, options] = typeof entry === 'string' ? [entry, {}] : entry
  const testPlugins = inject('concivTestPlugins')
  const index = testPlugins.findIndex((plugin) => plugin.name === name)
  const plugin = testPlugins[index]
  if (plugin === undefined) {
    throw new Error(`the plugin ${name} is neither the package under test nor one of its conciv-plugin dependencies`)
  }
  const load = loaders[index]
  if (plugin.kind === 'engine' || load === undefined) {
    throw new Error(
      `the plugin ${name} runs in the engine: give it to createEngine({plugins}), and its page part reaches the page from the engine`,
    )
  }
  const {setup, ...declarations} = (await load()).default
  return [{...declarations, id: plugin.id, windowEntry: setup && (async () => ({default: setup}))}, options]
}

function mountedEngine(engine: Engine | undefined, login: MountOptions['login']): ReturnType<Platform['engine']> {
  if (engine === undefined) return {kind: 'servers'}
  const {address} = engine
  if (login === undefined) return {kind: 'bound', apiBase: address.apiBase, token: () => Promise.resolve(address.token)}
  return {kind: 'bound', apiBase: new URL(address.apiBase).origin}
}

function mountedPlugins(options: MountOptions): Promise<ComposedPlugin[]> {
  const entries = options.plugins ?? []
  if (options.engine === undefined && entries.length === 0) {
    throw new Error('mount needs an engine, or at least one plugin to find one: give it engine or plugins')
  }
  return Promise.all(entries.map(composePlugin))
}

export type EngineRouterHistory = {initialEntries: readonly string[]; initialIndex?: number}

export function createEngineRouterHistory(options: EngineRouterHistory): EngineRouterHistory {
  if (options.initialEntries.length === 0) throw new Error('createEngineRouterHistory needs at least one entry')
  return options
}

function mountedNavigation(options: MountOptions): Platform['navigation'] {
  const {history, engine} = options
  if (history !== undefined && 'initialEntries' in history) {
    const screen = history.initialEntries[history.initialIndex ?? history.initialEntries.length - 1]
    if (screen !== undefined) keepLastScreen(screen)
    return 'tab'
  }
  if (history !== undefined) return {history}
  return {history: createMemoryHistory({initialEntries: [engine === undefined ? '/panel/connect?open=true' : '/']})}
}

export type Mount = (options: MountOptions) => Promise<void>

async function mountApp(options: MountOptions): Promise<void> {
  const plugins = await mountedPlugins(options)
  onTestFinished(cleanup)
  writeStorage(options.seed?.storage ?? {})
  const interactive = Promise.withResolvers<void>()
  const platform: Platform = {
    engine: () => mountedEngine(options.engine, options.login),
    navigation: mountedNavigation(options),
    plugins,
    root: document,
    settings: options.host,
    timings: TIMINGS,
    draftStore: () => memoryDraftStore(),
    onInteractive: () => interactive.resolve(),
  }
  const host = document.createElement('div')
  host.setAttribute('data-conciv-root', '')
  host.style.pointerEvents = 'none'
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.zIndex = String(WIDGET_LAYER)
  document.body.appendChild(host)
  render(() => createComponent(ConcivApp, {platform}), {container: host})
  await interactive.promise
}

export function makeMount(): Mount {
  return mountApp
}
