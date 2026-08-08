import {statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import type {EngineStaleness} from '@conciv/contract'

export type TrackedModule = {label: string; path: string}

const TRACKED_PACKAGES = ['@conciv/harness', '@conciv/tools', '@conciv/db', '@conciv/extension']

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

function resolveEntry(specifier: string): string | null {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return null
  }
}

export function makeStalenessProbe(modules: TrackedModule[]): () => EngineStaleness {
  const loaded = modules.map((module) => ({...module, mtimeMs: mtimeOf(module.path)}))
  const tracked = loaded.map((entry) => entry.label)
  const bootedAt = Date.now()
  return () => {
    const changed = loaded.filter((entry) => mtimeOf(entry.path) !== entry.mtimeMs).map((entry) => entry.label)
    return {stale: changed.length > 0, changed, tracked, bootedAt}
  }
}

function loadedModules(): TrackedModule[] {
  const own: TrackedModule = {label: '@conciv/core', path: fileURLToPath(import.meta.url)}
  const siblings = TRACKED_PACKAGES.flatMap((label) => {
    const path = resolveEntry(label)
    return path === null ? [] : [{label, path}]
  })
  return [own, ...siblings]
}

const probe = makeStalenessProbe(loadedModules())

export function engineStaleness(): EngineStaleness {
  return probe()
}
