import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import type {EngineStaleness} from '@conciv/contract'

export type TrackedModule = {label: string; path: string}

const TRACKED_PACKAGES = ['@conciv/harness', '@conciv/tools', '@conciv/db', '@conciv/extension']

const UNREADABLE = 'unreadable'

const FINGERPRINT_CHARS = 12

function digestOf(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return UNREADABLE
  }
}

function fingerprintOf(digests: string[]): string {
  return createHash('sha256').update(digests.join('\n')).digest('hex').slice(0, FINGERPRINT_CHARS)
}

export function makeStalenessProbe(modules: TrackedModule[]): () => EngineStaleness {
  const loaded = modules.map((module) => ({...module, digest: digestOf(module.path)}))
  const tracked = loaded.map((entry) => entry.label)
  const bootedAt = Date.now()
  return () => {
    const current = loaded.map((entry) => ({label: entry.label, was: entry.digest, now: digestOf(entry.path)}))
    const changed = current.filter((entry) => entry.now !== entry.was).map((entry) => entry.label)
    return {
      stale: changed.length > 0,
      changed,
      tracked,
      bootedAt,
      fingerprint: fingerprintOf(current.map((entry) => entry.now)),
    }
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

function resolveEntry(specifier: string): string | null {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return null
  }
}

const probe = makeStalenessProbe(loadedModules())

export function engineStaleness(): EngineStaleness {
  return probe()
}
