import type {PageVerbMap} from '@conciv/extension'

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
    dispose?.()
    if (verbs) unregisterExtensionPageVerbs(extension)
  }
}

type DispatchVerbDef = {args: PageVerbMap[string]['args']; handler: (args: unknown) => unknown}
type Dispatch = {result: unknown} | {error: {code: string; message: string}}

export async function dispatchExtVerb(
  extension: string,
  verb: string,
  argsJson: string | undefined,
): Promise<Dispatch> {
  const def = registry.get(extension)?.[verb] as DispatchVerbDef | undefined
  if (!def) return {error: {code: 'unknown-verb', message: `${extension}.${verb} is not registered`}}
  const raw = argsJson ? safeJson(argsJson) : {}
  const parsed = def.args.safeParse(raw)
  if (!parsed.success) return {error: {code: 'invalid-args', message: parsed.error.message}}
  try {
    return {result: (await def.handler(parsed.data)) ?? null}
  } catch (error) {
    return {error: {code: 'handler-error', message: error instanceof Error ? error.message : String(error)}}
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
