import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {dirname, isAbsolute, join, relative, sep} from 'node:path'
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

export function createSettingsStorage(folders: Record<SettingsScope, string>) {
  const files = new Map<string, ReturnType<typeof createSettingsFile>>()
  const file = (scope: SettingsScope, namespace: string) => {
    const filepath = settingsPath(join(folders[scope], 'settings'), namespace)
    const opened = files.get(filepath) ?? createSettingsFile(filepath)
    files.set(filepath, opened)
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
    flush: (): void => files.forEach((opened) => opened.flush()),
  }
}

function settingsPath(folder: string, namespace: string): string {
  const filepath = join(folder, `${namespace}.json`)
  const inside = relative(folder, filepath)
  if (namespace.includes('\0') || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
    throw new Error(`conciv: the settings namespace "${namespace}" leaves the settings folder`)
  return filepath
}

function createSettingsFile(filepath: string) {
  const current: {snapshot: SettingsSnapshot} = {snapshot: {version: Date.now(), value: readSaved(filepath)}}
  const publisher = new EventPublisher<{changed: SettingsSnapshot}>()
  const writer = new Debouncer(() => writeSaved(filepath, current.snapshot.value), {wait: WRITE_DEBOUNCE_MS})
  const commit = (value: Record<string, unknown>): SettingsSnapshot => {
    current.snapshot = {version: current.snapshot.version + 1, value}
    publisher.publish('changed', current.snapshot)
    writer.maybeExecute()
    return current.snapshot
  }
  const state: SettingsState = {
    read: async () => current.snapshot,
    set: async (key, value) => {
      const saved = current.snapshot.value
      if (Object.hasOwn(saved, key) && Object.is(saved[key], value)) return current.snapshot
      return commit({...saved, [key]: value})
    },
    delete: async (key) => {
      if (!Object.hasOwn(current.snapshot.value, key)) return current.snapshot
      return commit(omit(current.snapshot.value, [key]))
    },
    subscribe: async (listener) => publisher.subscribe('changed', listener),
  }
  return {
    ...state,
    async *changes(signal: AbortSignal | undefined): AsyncGenerator<SettingsSnapshot, void, void> {
      const later = publisher.subscribe('changed', {signal})
      yield current.snapshot
      yield* later
    },
    flush: (): void => writer.flush(),
  }
}

function readSaved(filepath: string): Record<string, unknown> {
  if (!existsSync(filepath)) return {}
  try {
    return SavedSettingsSchema.parse(JSON.parse(readFileSync(filepath, 'utf8'), withoutPrototypeKeys))
  } catch (error) {
    console.warn(`conciv: the settings file ${filepath} is unreadable, starting empty until the next change`, error)
    return {}
  }
}

function withoutPrototypeKeys(key: string, value: unknown): unknown {
  if (key === '__proto__') return undefined
  if (key === 'constructor' && typeof value === 'object' && value !== null && 'prototype' in value) return undefined
  return value
}

function writeSaved(filepath: string, value: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(filepath), {recursive: true})
    const temporary = `${filepath}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
    renameSync(temporary, filepath)
  } catch (error) {
    console.error(`conciv: writing the settings file ${filepath} failed`, error)
  }
}
