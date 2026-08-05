import {isToolError, type PageVerbMap} from '@conciv/extension'
import {isPageFailure} from '@conciv/protocol/page-types'
import {badArgs, fail, failRaised, unknownVerb} from './page-failure.js'

const registry = new Map<string, PageVerbMap>()

export function registerExtensionPageVerbs(extension: string, verbs: PageVerbMap): void {
  registry.set(extension, verbs)
}

export function unregisterExtensionPageVerbs(extension: string): void {
  registry.delete(extension)
}

export function clearExtensionPageVerbs(): void {
  registry.clear()
}

export function bindExtensionPageVerbs(
  extension: string,
  verbs: PageVerbMap | undefined,
  dispose?: () => void,
): () => void {
  if (verbs) registerExtensionPageVerbs(extension, verbs)
  return () => {
    try {
      dispose?.()
    } finally {
      if (verbs) unregisterExtensionPageVerbs(extension)
    }
  }
}

function rethrow(error: unknown): never {
  if (isPageFailure(error)) throw error
  if (!isToolError(error)) fail(error instanceof Error ? error.message : String(error))
  failRaised({
    code: error.code,
    message: error.message,
    ...(isJsonSerializable(error.data) ? {data: error.data} : {}),
  })
}

export async function dispatchExtVerb(
  extension: string,
  verb: string,
  argsJson: string | undefined,
): Promise<{result: unknown}> {
  const def = registry.get(extension)?.[verb]
  if (!def) unknownVerb(`${extension}.${verb} is not registered`)
  const raw = argsJson ? safeJson(argsJson) : {}
  try {
    const outcome = await def.dispatch(raw)
    if (!outcome.ok) badArgs(outcome.message)
    const result = outcome.value ?? null
    if (!isJsonSerializable(result)) fail(`${extension}.${verb} returned a non-serializable result`)
    return {result}
  } catch (error) {
    rethrow(error)
  }
}

function isJsonSerializable(value: unknown): boolean {
  return isStructurallySerializable(value, new Set<object>())
}

function isStructurallySerializable(value: unknown, seen: Set<object>): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  const ok = children.every((child) => isStructurallySerializable(child, seen))
  seen.delete(value)
  return ok
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
