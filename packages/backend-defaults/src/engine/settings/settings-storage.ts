import {EventEmitter, on} from 'node:events'
import {mkdir, rename, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {createStorage, type Driver, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {debounce} from 'devframe/utils/debounce'
import {createSharedState} from 'devframe/utils/shared-state'
import {z} from 'zod'
import {Effect, Schema} from 'effect'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {statics} from '@conciv/protocol/schema/schema'
import {SettingsNamespaceSchema, type SettingsScope, type SettingsSnapshot} from '@conciv/protocol'
import type {SettingsState} from '@conciv/client'
import type {EngineRuntime} from '../lib/logging.js'

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

const SettingsGeneration = Schema.String.check(Schema.isStartingWith('gen_')).pipe(
  Schema.brand('Settings.Generation'),
  Schema.annotate({identifier: 'Settings.Generation'}),
  statics((schema) => ({create: (ids: Maker) => schema.make('gen_' + ids.ascending())})),
)

export function createSettingsStorage(storages: SettingsStorages, runtime: EngineRuntime, ids: Maker) {
  const generation = SettingsGeneration.create(ids)
  const files = new Map<string, Promise<SettingsFile>>()
  const file = (scope: SettingsScope, namespace: string): Promise<SettingsFile> => {
    const key = settingsKey(namespace)
    const opened = files.get(`${scope}:${key}`) ?? openSettingsFile(storages[scope], key, generation, runtime)
    files.set(`${scope}:${key}`, opened)
    return opened
  }
  return {
    file,
    close: async (): Promise<void> => {
      await Promise.all([...files.values()].map(async (opened) => (await opened).flush()))
    },
  }
}

function settingsKey(namespace: string): string {
  const parsed = SettingsNamespaceSchema.safeParse(namespace)
  if (!parsed.success)
    throw new Error(`conciv: the settings namespace "${namespace}" is refused: ${z.prettifyError(parsed.error)}`)
  return `${parsed.data}.json`
}

type SettingsFile = Awaited<ReturnType<typeof openSettingsFile>>

async function openSettingsFile(storage: Storage, key: string, generation: string, runtime: EngineRuntime) {
  const value = await readSaved(storage, key).catch((error: unknown) => {
    runtime.runFork(
      Effect.logWarning('[core] a settings file is unreadable, starting empty until the next change', {key, error}),
    )
    return {}
  })
  const state = createSharedState<SettingsSnapshot>({initialValue: {generation, version: 0, value}})
  const write = debounce(
    (snapshot: SettingsSnapshot) => writeSaved(storage, key, snapshot.value, runtime),
    WRITE_DEBOUNCE_MS,
  )
  state.on('updated', (snapshot) => write(snapshot))
  const settings: SettingsState = {
    read: async () => state.value(),
    set: async (name, next) => {
      state.mutate((draft) => {
        if (Object.hasOwn(draft.value, name) && Object.is(draft.value[name], next)) return
        draft.value[name] = next
        draft.version += 1
      })
      return state.value()
    },
    delete: async (name) => {
      state.mutate((draft) => {
        if (!Object.hasOwn(draft.value, name)) return
        Reflect.deleteProperty(draft.value, name)
        draft.version += 1
      })
      return state.value()
    },
    subscribe: async (listener) => state.on('updated', (snapshot) => listener(snapshot)),
  }
  return {
    ...settings,
    async *changes(signal: AbortSignal | undefined): AsyncGenerator<SettingsSnapshot, void, void> {
      const relay = new EventEmitter()
      const stop = state.on('updated', () => relay.emit('updated'))
      try {
        const later = on(relay, 'updated', {signal})
        yield state.value()
        for await (const _ of later) yield state.value()
      } finally {
        stop()
      }
    },
    flush: async (): Promise<void> => {
      await write.flush()
    },
  }
}

async function readSaved(storage: Storage, key: string): Promise<Record<string, unknown>> {
  return SavedSettingsSchema.parse((await storage.getItem(key)) ?? {})
}

async function writeSaved(
  storage: Storage,
  key: string,
  value: Record<string, unknown>,
  runtime: EngineRuntime,
): Promise<void> {
  try {
    await storage.setItem(key, `${JSON.stringify(value, null, 2)}\n`)
  } catch (error) {
    runtime.runFork(Effect.logError('[core] writing a settings file failed', {key, error}))
  }
}
