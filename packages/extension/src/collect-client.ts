import type {AnyExtension} from './define-extension.js'
import type {ClientToolCtx} from './define-tool.js'
import type {AttachmentCardEntry, ClientEffect, ToolRenderer} from './types.js'

export type ClientToolEntry = {
  name: string
  mirrors: boolean
  execute: (input: unknown, ctx: ClientToolCtx) => Promise<unknown>
}

export function collectClientTools(builders: AnyExtension[]): ClientToolEntry[] {
  const seen = new Set<string>()
  const entries: ClientToolEntry[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      const execute = tool.__clientExecute
      if (!execute || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({name: tool.name, mirrors: tool.meta?.mirrors ?? false, execute})
    }
  return entries
}

export function collectClientEffects(instances: readonly {effects?: readonly ClientEffect[]}[]): ClientEffect[] {
  const seen = new Set<string>()
  const entries: ClientEffect[] = []
  for (const instance of instances)
    for (const effect of instance.effects ?? []) {
      if (seen.has(effect.name)) continue
      seen.add(effect.name)
      entries.push(effect)
    }
  return entries
}

export function collectToolRenderers(
  builders: AnyExtension[],
): {names: string[]; render: ToolRenderer; streamTitle?: string}[] {
  const seen = new Set<string>()
  const entries: {names: string[]; render: ToolRenderer; streamTitle?: string}[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      if (!tool.__render || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({names: [tool.name], render: tool.__render, streamTitle: tool.streamTitle})
    }
  return entries
}

export function collectAttachmentCards(builders: AnyExtension[]): AttachmentCardEntry[] {
  const seen = new Set<string>()
  const entries: AttachmentCardEntry[] = []
  for (const builder of builders)
    for (const attachment of builder.attachments ?? []) {
      if (!attachment.__card || seen.has(attachment.mime)) continue
      seen.add(attachment.mime)
      entries.push({mime: attachment.mime, render: attachment.__card})
    }
  return entries
}
