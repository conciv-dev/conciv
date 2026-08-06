import type {PageVerbMap} from '@conciv/extension'
import {badArgs, fail, unknownVerb} from './page-failure.js'
import {isJsonSerializable, rethrow} from './page-tool-outcome.js'

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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
