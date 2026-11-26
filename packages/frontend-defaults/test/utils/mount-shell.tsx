import {render} from '@solidjs/testing-library'
import {createStore} from 'solid-js/store'
import {onTestFinished} from 'vitest'
import {createMemoryHistory, type RouterHistory} from '@tanstack/solid-router'
import {createFakeEngine, type FakeEngine} from '@conciv/client/testing'
import type {ConcivSettingsInit} from '@conciv/types/config-types'
import type {Plugin, PluginOptions} from '@conciv/frontend-plugin-api'
import type {Entry} from '@conciv/frontend-plugin-api/host'
import {
  ConcivApp,
  createDraftStore,
  WIDGET_LAYER,
  type DraftStore,
  type Platform,
  type PlatformEngine,
} from '../../src/frontend-defaults.js'

const TIMINGS: NonNullable<Platform['timings']> = {
  engine: {offlineGraceMs: 10},
  chatRunReconnect: {firstDelayMs: 10, maxDelayMs: 50},
  queryRetryDelayMs: 10,
  picker: {searchWaitMs: 0, previewWaitMs: 0},
}

export function shellEngine(engine: FakeEngine = createFakeEngine()): FakeEngine {
  onTestFinished(() => {
    engine.dispose()
    const unanswered = engine.unanswered()
    if (unanswered.length > 0)
      throw new Error(`the fake engine was asked for what no test gave it: ${unanswered.join(', ')}`)
  })
  return engine
}

function memoryDrafts(): DraftStore {
  const documents = new Map<string, string>()
  const blobs = new Map<string, Blob>()
  return createDraftStore({
    get: async (key) => documents.get(key) ?? null,
    set: async (key, value) => {
      documents.set(key, value)
      return []
    },
    remove: async (key) => {
      documents.delete(key)
    },
    keys: async () => [...documents.keys()],
    clear: async () => {
      documents.clear()
      blobs.clear()
    },
    putBlob: async (blob) => {
      const id = crypto.randomUUID()
      blobs.set(id, blob)
      return id
    },
    getBlob: async (id) => blobs.get(id) ?? null,
  })
}

export type ShellPlugin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly options?: PluginOptions
  readonly builtin?: boolean
  readonly engineHalf?: boolean
}

export type MountShellOptions = {
  readonly engine: FakeEngine
  readonly plugins?: readonly ShellPlugin[]
  readonly initialEntries?: readonly string[]
  readonly settings?: ConcivSettingsInit
  readonly history?: RouterHistory
  readonly rebinds?: readonly FakeEngine[]
  readonly engineToken?: () => Promise<string>
}

function noEngineAt(apiBase: string): never {
  throw new Error(`no fake engine answers at ${apiBase}`)
}

function shellBinding(options: MountShellOptions) {
  const current: {engine: PlatformEngine} = {
    engine: {kind: 'bound', apiBase: options.engine.apiBase, connection: options.engine.connection},
  }
  const [changes, setChanges] = createStore({count: 0})
  const connect = (apiBase: string, token: string | undefined): void => {
    const engine = options.rebinds?.find((candidate) => candidate.apiBase === apiBase) ?? noEngineAt(apiBase)
    const tokenSource = token === undefined ? options.engineToken : undefined
    current.engine = {kind: 'bound', apiBase, connection: engine.connect({token, tokenSource})}
    setChanges('count', (count) => count + 1)
  }
  const engine = (): PlatformEngine => {
    void changes.count
    return current.engine
  }
  return {engine, connect}
}

function shellEntry(plugin: ShellPlugin): Entry {
  const {setup, ...declarations} = plugin.plugin
  return {...declarations, id: plugin.id, windowEntry: setup && (async () => ({default: setup}))}
}

export async function mountShell(options: MountShellOptions): Promise<void> {
  const interactive = Promise.withResolvers<void>()
  const plugins = options.plugins ?? []
  const builtins = plugins.filter((plugin) => plugin.builtin === true)
  const binding = shellBinding(options)
  const platform: Platform = {
    engine: binding.engine,
    connect: binding.connect,
    navigation: {
      history:
        options.history ??
        createMemoryHistory({initialEntries: [...(options.initialEntries ?? ['/panel/latest?open=true'])]}),
    },
    root: document,
    settings: options.settings,
    plugins: plugins
      .filter((plugin) => plugin.builtin !== true)
      .map((plugin) => [shellEntry(plugin), plugin.options ?? {}] as const),
    builtins: {
      entries: builtins.map(shellEntry),
      engineHalf: builtins.flatMap((plugin) => (plugin.engineHalf === true ? [plugin.id] : [])),
    },
    timings: TIMINGS,
    draftStore: memoryDrafts,
    onInteractive: interactive.resolve,
  }
  const container = document.createElement('div')
  container.setAttribute('data-conciv-root', '')
  container.style.position = 'fixed'
  container.style.inset = '0'
  container.style.pointerEvents = 'none'
  container.style.zIndex = String(WIDGET_LAYER)
  document.body.append(container)
  onTestFinished(() => container.remove())
  render(() => <ConcivApp platform={platform} />, {container})
  await interactive.promise
}
