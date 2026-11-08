import {z} from 'zod'
import type {SettingsState, SettingsStore} from './types.js'

export function createSettingsStore<T extends object>(store: () => Promise<SettingsState>): SettingsStore<T> {
  const settings = z.custom<T>((value) => typeof value === 'object' && value !== null)
  return {
    get: async (key) => settings.parse((await (await store()).read()).value)[key],
    set: async (key, value) => {
      await (await store()).set(String(key), value)
    },
    delete: async (key) => {
      await (await store()).delete(String(key))
    },
    all: async () => settings.parse((await (await store()).read()).value),
    onChange: async (fn) => (await store()).subscribe((snapshot) => fn(settings.parse(snapshot.value))),
  }
}
