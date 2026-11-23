import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import type {EngineStaleness} from '@conciv/contract'

export type TrackedModule = {label: string; path: string}

const TRACKED_PACKAGES: Record<string, string[]> = {
  '@conciv/harness': ['@conciv/harness'],
  '@conciv/tools': ['@conciv/tools'],
  '@conciv/db': ['@conciv/db'],
  '@conciv/plugin-host': ['@conciv/plugin-host'],
  '@conciv/serve': ['@conciv/serve', '@conciv/serve/rpc'],
}

const CORE_LABEL = '@conciv/core'

const CORE_ENTRIES = ['@conciv/core', '@conciv/core/start', '@conciv/core/app', '@conciv/core/config']

const UNREADABLE = 'unreadable'

const FINGERPRINT_CHARS = 12

async function computeDigest(path: string): Promise<string> {
  try {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  } catch {
    return UNREADABLE
  }
}

function computeFingerprint(digests: string[]): string {
  return createHash('sha256').update(digests.join('\n')).digest('hex').slice(0, FINGERPRINT_CHARS)
}

export function makeStalenessProbe(modules: TrackedModule[]): () => Promise<EngineStaleness> {
  const loaded = Promise.all(modules.map(async (module) => ({...module, digest: await computeDigest(module.path)})))
  const tracked = modules.map((entry) => entry.label)
  const bootedAt = Date.now()
  return async () => {
    const current = await Promise.all(
      (await loaded).map(async (entry) => ({
        label: entry.label,
        was: entry.digest,
        now: await computeDigest(entry.path),
      })),
    )
    const changed = current
      .filter((entry) => entry.now !== entry.was)
      .map((entry) => entry.label)
      .filter((label, index, all) => all.indexOf(label) === index)
    return {
      stale: changed.length > 0,
      changed,
      tracked,
      bootedAt,
      fingerprint: computeFingerprint(current.map((entry) => entry.now)),
    }
  }
}

export function loadedModules(): TrackedModule[] {
  const own: TrackedModule = {label: CORE_LABEL, path: fileURLToPath(import.meta.url)}
  const coreEntries = CORE_ENTRIES.flatMap((specifier) => {
    const path = resolveEntry(specifier)
    return path === null ? [] : [{label: CORE_LABEL, path}]
  })
  const siblings = Object.entries(TRACKED_PACKAGES).flatMap(([label, specifiers]) =>
    specifiers.flatMap((specifier) => {
      const path = resolveEntry(specifier)
      return path === null ? [] : [{label, path}]
    }),
  )
  return [own, ...coreEntries, ...siblings].filter(
    (entry, index, all) => all.findIndex((other) => other.path === entry.path) === index,
  )
}

function resolveEntry(specifier: string): string | null {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return null
  }
}

const probe = makeStalenessProbe(loadedModules())

export function engineStaleness(): Promise<EngineStaleness> {
  return probe()
}
