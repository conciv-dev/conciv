import {randomUUID} from 'node:crypto'
import {EventEmitter, on} from 'node:events'
import {mkdir, rename, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {createStorage, type Driver, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {debounce} from 'devframe/utils/debounce'
import {createSharedState} from 'devframe/utils/shared-state'
import {isEqual} from 'es-toolkit'
import {z} from 'zod'
import {SettingsNamespaceSchema, type SettingsScope, type SettingsSnapshot} from '@conciv/contract'
import {
  createSettingsStore,
  type ExtensionScope,
  type SettingsForNamespace,
  type SettingsState,
} from '@conciv/extension'

const WRITE_DEBOUNCE_MS = 100

const FROM_DISK = 'conciv-settings-disk:'

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
  const files = new Map<string, Promise<SettingsFile>>()
  const file = (scope: SettingsScope, namespace: string): Promise<SettingsFile> => {
    const key = settingsKey(namespace)
    const opened = files.get(`${scope}:${key}`) ?? openSettingsFile(storages[scope], key, generation)
    files.set(`${scope}:${key}`, opened)
    return opened
  }
  const watching = storages.global
    .watch((_event, key) => {
      files
        .get(`global:${key}`)
        ?.then((opened) => opened.takeSaved())
        .catch((error: unknown) =>
          console.warn(`conciv: the global settings file ${key} is unreadable, keeping the settings in memory`, error),
        )
    })
    .catch((error: unknown) => {
      console.error('conciv: watching the global settings folder failed', error)
      return async () => {}
    })
  const flush = async (): Promise<void> => {
    await Promise.all([...files.values()].map(async (opened) => (await opened).flush()))
  }
  return {
    file,
    scope: <Namespace extends string>(namespace: Namespace): ExtensionScope<Namespace> => ({
      namespace,
      settings: {
        global: createSettingsStore<SettingsForNamespace<Namespace>>(() => file('global', namespace)),
        project: createSettingsStore<SettingsForNamespace<Namespace>>(() => file('project', namespace)),
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

type SettingsFile = Awaited<ReturnType<typeof openSettingsFile>>

async function openSettingsFile(storage: Storage, key: string, generation: string) {
  const value = await readSaved(storage, key).catch((error: unknown) => {
    console.warn(`conciv: the settings file ${key} is unreadable, starting empty until the next change`, error)
    return {}
  })
  const state = createSharedState<SettingsSnapshot>({initialValue: {generation, version: 0, value}})
  const write = debounce((snapshot: SettingsSnapshot) => writeSaved(storage, key, snapshot.value), WRITE_DEBOUNCE_MS)
  state.on('updated', (snapshot, _patches, syncId) => {
    if (!syncId.startsWith(FROM_DISK)) write(snapshot).catch(() => undefined)
  })
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
        while (!(await later.next()).done) yield state.value()
      } finally {
        stop()
      }
    },
    takeSaved: async (): Promise<void> => {
      const saved = await readSaved(storage, key)
      if (isEqual(saved, state.value().value)) return
      state.mutate((draft) => {
        draft.value = saved
        draft.version += 1
      }, `${FROM_DISK}${randomUUID()}`)
    },
    flush: async (): Promise<void> => {
      await write.flush()
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
