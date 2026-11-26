import {render} from '@solidjs/testing-library'
import {onTestFinished} from 'vitest'
import {createMemoryHistory} from '@tanstack/solid-router'
import {z} from 'zod'
import type {PluginOptions} from '@conciv/frontend-plugin-api'
import type {FakeBundle, FakeEngine, FakeEngineOptions} from '@conciv/client/testing'
import type {ConcivSettingsInit} from '@conciv/types/config-types'
import {
  ConcivApp,
  createBrowserEngine,
  createDraftStore,
  WIDGET_LAYER,
  type DraftStore,
  type Platform,
} from '@internal/frontend-defaults'
import {pluginIdAvailable} from '@internal/frontend-app-api/plugin/installed'
import {engineToken, testEntry, useFakeEngine, type RealEngine, type TestPlugin} from './frontend-test-utils.js'

const SHELL_TIMINGS: NonNullable<Platform['timings']> = {
  engine: {offlineGraceMs: 10},
  chatRunReconnect: {firstDelayMs: 10, maxDelayMs: 50},
  queryRetryDelayMs: 10,
  picker: {searchWaitMs: 0, previewWaitMs: 0},
}

function memoryDraftStore(): DraftStore {
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

export type RenderTestAppOptions = {
  readonly engine?: FakeEngine | RealEngine | 'none'
  readonly plugins?: readonly TestPlugin[]
  readonly initialEntries?: readonly string[]
  readonly settings?: ConcivSettingsInit
}

function isBuiltin(plugin: TestPlugin): boolean {
  return plugin.builtin === true || !pluginIdAvailable(plugin.id, [])
}

function shellEngine(engine: FakeEngine | RealEngine | undefined): Pick<Platform, 'engine' | 'connect'> {
  if (engine !== undefined && 'connection' in engine) {
    const bound: ReturnType<Platform['engine']> = {
      kind: 'bound',
      apiBase: engine.apiBase,
      connection: engine.connection,
    }
    return {engine: () => bound}
  }
  const browser = createBrowserEngine({
    apiBase: engine?.address.apiBase,
    tokenSource: engine === undefined ? undefined : engineToken(engine),
  })
  onTestFinished(browser.dispose)
  return {engine: browser.engine, connect: browser.connect}
}

export async function renderTestApp(options: RenderTestAppOptions = {}): Promise<void> {
  const engine = options.engine === 'none' ? undefined : (options.engine ?? useFakeEngine())
  const start = engine === undefined ? CONNECT_START : SHELL_START
  const interactive = Promise.withResolvers<void>()
  const plugins = options.plugins ?? []
  const builtins = plugins.filter(isBuiltin)
  const platform: Platform = {
    ...shellEngine(engine),
    navigation: {history: createMemoryHistory({initialEntries: [...(options.initialEntries ?? [start])]})},
    root: document,
    settings: options.settings,
    plugins: plugins
      .filter((plugin) => !isBuiltin(plugin))
      .map((plugin) => [testEntry(plugin), plugin.options ?? {}] as const),
    builtins: {
      entries: builtins.map(testEntry),
      engineHalf: builtins.flatMap((plugin) => (plugin.engineHalf === true ? [plugin.id] : [])),
      toolGroups: builtins.flatMap((plugin) => (plugin.toolGroup ? [{...plugin.toolGroup, plugin: plugin.id}] : [])),
    },
    timings: SHELL_TIMINGS,
    draftStore: memoryDraftStore,
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

const SHELL_START = '/panel/latest?open=true'

const CONNECT_START = '/panel/connect?open=true'

const ManifestSchema = z.record(
  z.string(),
  z.object({file: z.string(), isEntry: z.boolean().optional(), imports: z.array(z.string()).optional()}),
)

const OptionsSchema = z.record(z.string(), z.json())

type Manifest = z.infer<typeof ManifestSchema>

const MANIFEST_SUFFIX = '.manifest.json'

function chunkFiles(manifest: Manifest, keys: readonly string[] = []): string[] {
  return keys.flatMap((key) => {
    const record = manifest[key]
    return record === undefined || record.isEntry === true ? [] : [record.file]
  })
}

function chunkClosure(manifest: Manifest, roots: readonly string[]): readonly string[] {
  const records = Object.values(manifest)
  const visit = (order: readonly string[], file: string, trail: readonly string[]): readonly string[] => {
    if (order.includes(file) || trail.includes(file)) return order
    const imports = chunkFiles(manifest, records.find((record) => record.file === file)?.imports)
    return [...imports.reduce((done, dependency) => visit(done, dependency, [...trail, file]), order), file]
  }
  return roots.reduce((order: readonly string[], root) => visit(order, root, []), [])
}

function missingFile(id: string, file: string): never {
  throw new Error(`the build of the plugin ${id} has no file ${file}`)
}

export function servePluginBundle(
  plugin: {
    readonly id: string
    readonly dist: Readonly<Record<string, () => Promise<string>>>
    readonly options?: PluginOptions
  },
  options: FakeEngineOptions = {},
): FakeEngineOptions {
  const revision = `${plugin.id}-test`
  const files = Object.fromEntries(
    Object.entries(plugin.dist).map(([key, load]) => [key.slice(key.lastIndexOf('/') + 1), load] as const),
  )
  const manifestName = Object.keys(files).find((file) => file.endsWith(MANIFEST_SUFFIX))
  if (manifestName === undefined) throw new Error(`the build of the plugin ${plugin.id} has no chunk manifest`)
  const entry = manifestName.slice(0, -MANIFEST_SUFFIX.length)
  const text = (file: string) => (files[file] ?? missingFile(plugin.id, file))()
  const manifest = text(manifestName).then((json) => ManifestSchema.parse(JSON.parse(json)))
  const served = async (roots: readonly string[]) =>
    Promise.all(chunkClosure(await manifest, roots).map(async (file) => ({file, code: await text(file)})))
  const chunk = async (file: string) => {
    const listed = Object.values(await manifest).some((record) => record.isEntry !== true && record.file === file)
    return listed ? served([file]) : missingFile(plugin.id, file)
  }
  const bundle: FakeBundle = {
    info: {
      id: plugin.id,
      source: {type: 'package', target: plugin.id},
      features: {server: true, rpc: true, experimental: true},
      state: {status: 'active'},
      ...(plugin.options === undefined ? {} : {options: plugin.options}),
    },
    experimental: async () => {
      const parsed = await manifest
      const starts = Object.values(parsed).flatMap((record) =>
        record.isEntry === true ? chunkFiles(parsed, record.imports) : [],
      )
      return {
        file: entry,
        code: await text(entry),
        revision,
        options: OptionsSchema.parse(plugin.options ?? {}),
        chunks: await served(starts),
      }
    },
    chunk,
  }
  return {...options, bundles: [...(options.bundles ?? []), bundle]}
}
