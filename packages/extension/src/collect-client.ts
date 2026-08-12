import type {ToolCaptureMode} from '@conciv/protocol/element-capture-types'
import type {AnyExtension} from './define-extension.js'
import type {ClientToolCtx, ToolMeta} from './define-tool.js'
import type {AttachmentCardEntry, ClientEffect, ToolRenderer} from './types.js'

export type ClientToolEntry = {
  name: string
  mirrors: boolean
  capture: ToolCaptureMode
  execute: (input: unknown, ctx: ClientToolCtx) => Promise<unknown>
}

export function captureModeOf(meta: ToolMeta | undefined): ToolCaptureMode {
  if (meta?.capture !== undefined) return meta.capture
  return meta?.mutating === true ? 'after' : 'none'
}

export function collectClientTools(builders: AnyExtension[]): ClientToolEntry[] {
  const seen = new Set<string>()
  const entries: ClientToolEntry[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      const execute = tool.__clientExecute
      if (!execute || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({
        name: tool.name,
        mirrors: tool.meta?.mirrors ?? false,
        capture: captureModeOf(tool.meta),
        execute,
      })
    }
  return entries
}

export function collectClientEffects(
  instances: readonly {name: string; effects?: readonly ClientEffect[]}[],
): ClientEffect[] {
  const owners = new Map<string, string>()
  const entries: ClientEffect[] = []
  for (const instance of instances)
    for (const effect of instance.effects ?? []) {
      const owner = owners.get(effect.name)
      if (owner) {
        console.warn(
          `[conciv] extension "${instance.name}" declares effect "${effect.name}" already registered by extension "${owner}"; keeping "${owner}"'s effect`,
        )
        continue
      }
      owners.set(effect.name, instance.name)
      entries.push(effect)
    }
  return entries
}

export function collectToolRenderers(
  builders: AnyExtension[],
): {names: string[]; render: ToolRenderer; streamTitle?: string; display?: 'standalone'}[] {
  const seen = new Set<string>()
  const entries: {names: string[]; render: ToolRenderer; streamTitle?: string; display?: 'standalone'}[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      if (!tool.__render || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({names: [tool.name], render: tool.__render, streamTitle: tool.streamTitle, display: tool.display})
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
