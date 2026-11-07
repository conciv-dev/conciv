import {onMount} from 'solid-js'
import {defineExtension, getExtensionApi, type AnyExtension} from '@conciv/extension'
import {isExtension} from './extension-guard.js'

export type ExtensionEntry = {extension: unknown; source: string}
export type ExtensionLoader = {source: string; load: () => Promise<unknown>}
type ExtensionLoadFailure = {source: string; error: unknown}
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

export function toSortedLoaders(glob: Record<string, () => Promise<unknown>>): ExtensionLoader[] {
  return Object.entries(glob)
    .filter(([key]) => !key.endsWith('.d.ts'))
    .toSorted(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
    .map(([source, load]) => ({source, load}))
}

const LOAD_FAILURES_EXTENSION = 'conciv-load-failures'

const MODULE_LOAD_FAILURE = /dynamically imported module|Importing a module script failed/

export function extensionLabel(source: string): string {
  const packagePath = source.replace(/\/(?:dist|src)\/[^/]*$/, '')
  const lastSegment = packagePath.split('/').at(-1) ?? packagePath
  return lastSegment.replace(/^extension-/, '').replace(/\.[cm]?[jt]sx?$/, '')
}

function isModuleLoadFailure(error: unknown): boolean {
  return error instanceof TypeError && MODULE_LOAD_FAILURE.test(error.message)
}

function loadFailureMessage(failure: ExtensionLoadFailure): string {
  const failed = `The conciv extension "${extensionLabel(failure.source)}" failed to load.`
  if (isModuleLoadFailure(failure.error)) {
    return `${failed} A content blocker such as uBlock Origin may be blocking it: allow this dev server and reload.`
  }
  return `${failed} See the browser console for the error.`
}

function loadFailuresExtension(failures: readonly ExtensionLoadFailure[]): AnyExtension {
  const message = failures.map(loadFailureMessage).join(' ')
  function LoadFailureToast(): null {
    const toast = getExtensionApi(LOAD_FAILURES_EXTENSION).useToast()
    onMount(() => toast(message, 'error'))
    return null
  }
  return defineExtension({name: LOAD_FAILURES_EXTENSION, Surface: LoadFailureToast})
}

function moduleDefault(mod: unknown): unknown {
  return mod && typeof mod === 'object' && 'default' in mod ? mod.default : undefined
}

export async function loadExtensions(loaders: readonly ExtensionLoader[]): Promise<DedupeResult> {
  const outcomes = await Promise.all(
    loaders.map((loader) =>
      loader.load().then(
        (mod): ExtensionEntry => ({source: loader.source, extension: moduleDefault(mod)}),
        (error: unknown): ExtensionLoadFailure => ({source: loader.source, error}),
      ),
    ),
  )
  const failures = outcomes.filter((outcome): outcome is ExtensionLoadFailure => 'error' in outcome)
  const entries = outcomes.filter((outcome): outcome is ExtensionEntry => !('error' in outcome))
  for (const failure of failures) {
    console.error(`[conciv] extension "${extensionLabel(failure.source)}" failed to load`, failure.error)
  }
  const picked = dedupeExtensions(entries)
  if (failures.length === 0) return picked
  return {...picked, extensions: [...picked.extensions, loadFailuresExtension(failures)]}
}
