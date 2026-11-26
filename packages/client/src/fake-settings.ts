import type {SettingsSnapshot} from '@conciv/protocol'
import {channel} from './fake-channel.js'
import type {Call, FakeEngineOptions} from './fake-types.js'

export function createSettings(initial: FakeEngineOptions['settings']) {
  const snapshots = new Map<string, SettingsSnapshot>()
  const changes = channel<{key: string; snapshot: SettingsSnapshot}>()
  const settingsKey = (input: {scope: string; namespace: string}): string => `${input.scope}:${input.namespace}`
  const read = (input: {scope: string; namespace: string}): SettingsSnapshot => {
    const key = settingsKey(input)
    const found = snapshots.get(key) ?? {generation: 'fake', version: 0, value: {...initial?.[key]}}
    snapshots.set(key, found)
    return found
  }
  const write = (input: {scope: string; namespace: string}, value: Record<string, unknown>): SettingsSnapshot => {
    const snapshot = {generation: 'fake', version: read(input).version + 1, value}
    snapshots.set(settingsKey(input), snapshot)
    changes.push({key: settingsKey(input), snapshot})
    return snapshot
  }
  return {
    all: (input: {scope: 'global' | 'project'; namespace: string}) => read(input),
    set: (input: {scope: 'global' | 'project'; namespace: string; key: string; value: unknown}) =>
      write(input, {...read(input).value, [input.key]: input.value}),
    delete: (input: {scope: 'global' | 'project'; namespace: string; key: string}) => {
      const {[input.key]: _removed, ...kept} = read(input).value
      return write(input, kept)
    },
    changes: async function* (input: {scope: 'global' | 'project'; namespace: string}, call: Call) {
      yield read(input)
      for await (const change of changes.read(call.signal)) if (change.key === settingsKey(input)) yield change.snapshot
    },
  }
}
