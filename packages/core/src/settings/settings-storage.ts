import {join} from 'node:path'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {EventPublisher} from '@orpc/server'
import {Debouncer} from '@tanstack/pacer'
import {omit} from 'es-toolkit'
import {z} from 'zod'
import type {SettingsScope, SettingsSnapshot} from '@conciv/contract'
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
    global: createStorage({driver: fsDriver({base: join(folders.global, 'settings')})}),
    project: createStorage({driver: fsDriver({base: join(folders.project, 'settings')})}),
  }
}

export function createSettingsStorage(storages: SettingsStorages) {
  const files = new Map<string, ReturnType<typeof createSettingsFile>>()
  const file = (scope: SettingsScope, namespace: string) => {
    const key = `${scope}:${settingsKey(namespace)}`
    const opened = files.get(key) ?? createSettingsFile(storages[scope], settingsKey(namespace))
    files.set(key, opened)
    return opened
  }
  return {
    file,
    scope: <Namespace extends string>(namespace: Namespace): ExtensionScope<Namespace> => ({
      namespace,
      settings: {
        global: createSettingsStore<SettingsForNamespace<Namespace>>(async () => file('global', namespace)),
        project: createSettingsStore<SettingsForNamespace<Namespace>>(async () => file('project', namespace)),
      },
    }),
    flush: (): Promise<void> => Promise.all([...files.values()].map((opened) => opened.flush())).then(() => undefined),
  }
}

function settingsKey(namespace: string): string {
  if (/[/\\:\0]|\.\./.test(namespace))
    throw new Error(`conciv: the settings namespace "${namespace}" leaves the settings folder`)
  return `${namespace}.json`
}

function createSettingsFile(storage: Storage, key: string) {
  const current: {snapshot: SettingsSnapshot} = {snapshot: {version: Date.now(), value: {}}}
  const loaded = readSaved(storage, key).then((value) => {
    current.snapshot = {...current.snapshot, value}
  })
  const publisher = new EventPublisher<{changed: SettingsSnapshot}>()
  const writes: {pending: Promise<void>} = {pending: Promise.resolve()}
  const writer = new Debouncer(
    () => {
      writes.pending = writeSaved(storage, key, current.snapshot.value)
    },
    {wait: WRITE_DEBOUNCE_MS},
  )
  const commit = (value: Record<string, unknown>): SettingsSnapshot => {
    current.snapshot = {version: current.snapshot.version + 1, value}
    publisher.publish('changed', current.snapshot)
    writer.maybeExecute()
    return current.snapshot
  }
  const state: SettingsState = {
    read: async () => {
      await loaded
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
    flush: async (): Promise<void> => {
      writer.flush()
      await writes.pending
    },
  }
}

async function readSaved(storage: Storage, key: string): Promise<Record<string, unknown>> {
  try {
    const saved = SavedSettingsSchema.safeParse((await storage.getItem(key)) ?? {})
    if (saved.success) return saved.data
    console.warn(`conciv: the settings file ${key} is unreadable, starting empty until the next change`, saved.error)
  } catch (error) {
    console.warn(`conciv: the settings file ${key} is unreadable, starting empty until the next change`, error)
  }
  return {}
}

async function writeSaved(storage: Storage, key: string, value: Record<string, unknown>): Promise<void> {
  try {
    await storage.setItem(key, `${JSON.stringify(value, null, 2)}\n`)
  } catch (error) {
    console.error(`conciv: writing the settings file ${key} failed`, error)
  }
}
