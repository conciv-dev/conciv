import type {AnyExtension} from '@conciv/extension'
import {isExtension} from './extension-guard.js'

export type ExtensionEntry = {extension: unknown; source: string}
export type DedupeResult = {extensions: AnyExtension[]; dropped: Array<{source: string; reason: string}>}

export const EXTENSION_GLOB = '/conciv/extensions/*.{ts,tsx,js,jsx}'

export function dedupeExtensions(entries: readonly ExtensionEntry[]): DedupeResult {
  const seen = new Set<string>()
  const extensions: AnyExtension[] = []
  const dropped: Array<{source: string; reason: string}> = []
  for (const {extension, source} of entries) {
    if (!isExtension(extension)) {
      dropped.push({source, reason: 'invalid-extension'})
      continue
    }
    if (seen.has(extension.name)) {
      dropped.push({source, reason: `duplicate-name:${extension.name}`})
      continue
    }
    seen.add(extension.name)
    extensions.push(extension)
  }
  return {extensions, dropped}
}

export function toSortedEntries(mods: Record<string, unknown>): ExtensionEntry[] {
  return Object.entries(mods)
    .filter(([key]) => !key.endsWith('.d.ts'))
    .toSorted(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
    .map(([source, mod]) => ({
      extension: mod && typeof mod === 'object' && 'default' in mod ? mod.default : undefined,
      source,
    }))
}
