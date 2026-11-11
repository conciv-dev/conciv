import {randomUUID} from 'node:crypto'
import {mkdir, rename, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {createStorage, type Driver, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {EventPublisher} from '@orpc/server'
import {Debouncer} from '@tanstack/pacer'
import {isEqual, omit} from 'es-toolkit'
import {z} from 'zod'
import {SettingsNamespaceSchema, type SettingsScope, type SettingsSnapshot} from '@conciv/contract'
import {
  createSettingsStore,
  type ExtensionScope,
  type SettingsForNamespace,
  type SettingsState,
} from '@conciv/extension'

const WRITE_DEBOUNCE_MS = 100

const SavedSettingsSchema = z.record(z.string(), z.unknown())

export type SettingsStorages = Record<SettingsScope, Storage>

export function settingsOnDisk(folders: Record<SettingsScope, string>): SettingsStorages {
  return {
    global: createStorage({driver: atomicFsDriver(join(folders.global, 'settings'))}),
    project: createStorage({driver: atomicFsDriver(join(folders.project, 'settings'))}),
  }
}

function atomicFsDriver(base: string): Driver {
  const files = fsDriver({base})
  return {
    ...files,
    name: 'conciv-atomic-fs',
    async watch(callback) {
      await mkdir(base, {recursive: true})
      return files.watch ? files.watch(callback) : async () => {}
    },
    async setItem(key, value) {
      const path = join(base, ...key.split(':'))
      const temporary = `${path}.${process.pid}.tmp`
      await mkdir(dirname(path), {recursive: true})
      try {
        await writeFile(temporary, value, 'utf8')
        await rename(temporary, path)
      } catch (error) {
        await rm(temporary, {force: true})
        throw error
      }
    },
  }
}

export function createSettingsStorage(storages: SettingsStorages) {
  const generation = randomUUID()
  const files = new Map<string, ReturnType<typeof createSettingsFile>>()
  const file = (scope: SettingsScope, namespace: string) => {
    const key = `${scope}:${settingsKey(namespace)}`
    const opened = files.get(key) ?? createSettingsFile(storages[scope], settingsKey(namespace), generation)
    files.set(key, opened)
    return opened
  }
  const watching = storages.global
    .watch((_event, key) => {
      files
        .get(`global:${key}`)
        ?.reload()
        .catch((error: unknown) => console.error(`conciv: reloading the global settings file ${key} failed`, error))
    })
    .catch((error: unknown) => {
      console.error('conciv: watching the global settings folder failed', error)
      return async () => {}
    })
  const flush = (): Promise<void> =>
    Promise.all([...files.values()].map((opened) => opened.flush())).then(() => undefined)
  return {
    file,
    scope: <Namespace extends string>(namespace: Namespace): ExtensionScope<Namespace> => ({
      namespace,
      settings: {
        global: createSettingsStore<SettingsForNamespace<Namespace>>(async () => file('global', namespace)),
        project: createSettingsStore<SettingsForNamespace<Namespace>>(async () => file('project', namespace)),
      },
    }),
    flush,
    ready: watching.then(() => undefined),
    close: async (): Promise<void> => {
      await (
        await watching
      )()
      await flush()
    },
  }
}

function settingsKey(namespace: string): string {
  const parsed = SettingsNamespaceSchema.safeParse(namespace)
  if (!parsed.success)
    throw new Error(`conciv: the settings namespace "${namespace}" is refused: ${z.prettifyError(parsed.error)}`)
  return `${parsed.data}.json`
}

function createSettingsFile(storage: Storage, key: string, generation: string) {
  const current: {snapshot: SettingsSnapshot} = {snapshot: {generation, version: 0, value: {}}}
  const loaded = readSaved(storage, key).then(
    (value) => {
      current.snapshot = {...current.snapshot, value}
    },
    (error: unknown) => {
      console.warn(`conciv: the settings file ${key} is unreadable, starting empty until the next change`, error)
    },
  )
  const publisher = new EventPublisher<{changed: SettingsSnapshot}>()
  const writes: {pending: Promise<void>} = {pending: Promise.resolve()}
  const writer = new Debouncer(
    () => {
      const value = current.snapshot.value
      writes.pending = writes.pending.then(() => writeSaved(storage, key, value))
    },
    {wait: WRITE_DEBOUNCE_MS},
  )
  const advance = (value: Record<string, unknown>): SettingsSnapshot => {
    current.snapshot = {generation, version: current.snapshot.version + 1, value}
    publisher.publish('changed', current.snapshot)
    return current.snapshot
  }
  const commit = (value: Record<string, unknown>): SettingsSnapshot => {
    advance(value)
    writer.maybeExecute()
    return current.snapshot
  }
  const reload = async (): Promise<void> => {
    await loaded
    if (writer.store.state.isPending) return
    await writes.pending
    const version = current.snapshot.version
    const value = await readSaved(storage, key).catch((error: unknown) => {
      console.warn(`conciv: the settings file ${key} is unreadable, keeping the settings in memory`, error)
      return current.snapshot.value
    })
    if (writer.store.state.isPending || current.snapshot.version !== version) return
    if (isEqual(value, current.snapshot.value)) return
    advance(value)
  }
  const state: SettingsState = {
    read: async () => {
      await reload()
      return current.snapshot
    },
    set: async (name, value) => {
      await loaded
      const saved = current.snapshot.value
      if (Object.hasOwn(saved, name) && Object.is(saved[name], value)) return current.snapshot
      return commit({...saved, [name]: value})
    },
    delete: async (name) => {
      await loaded
      if (!Object.hasOwn(current.snapshot.value, name)) return current.snapshot
      return commit(omit(current.snapshot.value, [name]))
    },
    subscribe: async (listener) => publisher.subscribe('changed', listener),
  }
  return {
    ...state,
    async *changes(signal: AbortSignal | undefined): AsyncGenerator<SettingsSnapshot, void, void> {
      await loaded
      const later = publisher.subscribe('changed', {signal})
      yield current.snapshot
      yield* later
    },
    reload,
    flush: async (): Promise<void> => {
      writer.flush()
      await writes.pending
    },
  }
}

async function readSaved(storage: Storage, key: string): Promise<Record<string, unknown>> {
  return SavedSettingsSchema.parse((await storage.getItem(key)) ?? {})
}

async function writeSaved(storage: Storage, key: string, value: Record<string, unknown>): Promise<void> {
  try {
    await storage.setItem(key, `${JSON.stringify(value, null, 2)}\n`)
  } catch (error) {
    console.error(`conciv: writing the settings file ${key} failed`, error)
  }
}
