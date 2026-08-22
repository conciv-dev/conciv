import type {ConcivDb} from '@conciv/db'
import {appendSettingsLog, newestSettingsLogRow, settingsLogHistory, type SettingsLogRow} from '@conciv/db'
import {
  SettingsSchemas,
  SETTINGS_KEYS,
  isSettingsKey,
  settingsDefault,
  type ResolvedSetting,
  type SettingsActor,
  type SettingsKey,
  type SettingsLogEntry,
  type SettingsScope,
} from '@conciv/protocol/settings-types'

export type SettingsDeps = {
  projectDb: ConcivDb
  globalDb: ConcivDb
  notify?: (key: SettingsKey, scope: SettingsScope) => void
}

function dbFor(deps: SettingsDeps, scope: SettingsScope): ConcivDb {
  return scope === 'project' ? deps.projectDb : deps.globalDb
}

type LayerValue = {ok: true; value: unknown} | {ok: false}

function parseLayerValue(key: SettingsKey, raw: string | null): LayerValue {
  if (raw === null) return {ok: false}
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = SettingsSchemas[key].safeParse(parsed)
    return result.success ? {ok: true, value: result.data} : {ok: false}
  } catch {
    return {ok: false}
  }
}

export function resolveSetting(deps: SettingsDeps, key: SettingsKey): ResolvedSetting {
  const fromProject = parseLayerValue(key, newestSettingsLogRow(deps.projectDb, key)?.value ?? null)
  if (fromProject.ok) return {key, value: fromProject.value, source: 'project'}
  const fromGlobal = parseLayerValue(key, newestSettingsLogRow(deps.globalDb, key)?.value ?? null)
  if (fromGlobal.ok) return {key, value: fromGlobal.value, source: 'global'}
  return {key, value: settingsDefault(key), source: 'default'}
}

export function resolveAllSettings(deps: SettingsDeps): ResolvedSetting[] {
  return SETTINGS_KEYS.map((key) => resolveSetting(deps, key))
}

export type SettingsWriteError = 'unknown-key' | 'invalid-value'
export type SettingsWriteResult = {ok: true} | {ok: false; error: SettingsWriteError}

export function setSetting(
  deps: SettingsDeps,
  input: {key: string; value: unknown; scope: SettingsScope; actor: SettingsActor},
): SettingsWriteResult {
  if (!isSettingsKey(input.key)) return {ok: false, error: 'unknown-key'}
  const result = SettingsSchemas[input.key].safeParse(input.value)
  if (!result.success) return {ok: false, error: 'invalid-value'}
  appendSettingsLog(dbFor(deps, input.scope), {key: input.key, value: JSON.stringify(result.data), actor: input.actor})
  deps.notify?.(input.key, input.scope)
  return {ok: true}
}

export function clearSetting(
  deps: SettingsDeps,
  input: {key: string; scope: SettingsScope; actor: SettingsActor},
): SettingsWriteResult {
  if (!isSettingsKey(input.key)) return {ok: false, error: 'unknown-key'}
  appendSettingsLog(dbFor(deps, input.scope), {key: input.key, value: null, actor: input.actor})
  deps.notify?.(input.key, input.scope)
  return {ok: true}
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function toEntry(scope: SettingsScope, row: SettingsLogRow): SettingsLogEntry {
  return {
    scope,
    id: row.id,
    key: row.key,
    value: row.value === null ? null : safeJsonParse(row.value),
    actor: row.actor,
    createdAt: row.createdAt,
  }
}

export function settingsHistory(deps: SettingsDeps, key: string): SettingsLogEntry[] {
  const projectEntries = settingsLogHistory(deps.projectDb, key).map((row) => toEntry('project', row))
  const globalEntries = settingsLogHistory(deps.globalDb, key).map((row) => toEntry('global', row))
  return [...projectEntries, ...globalEntries].toSorted((a, b) => b.createdAt - a.createdAt || b.id - a.id)
}
