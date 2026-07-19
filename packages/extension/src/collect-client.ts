import type {AnyExtension} from './define-extension.js'
import type {AttachmentCardEntry, ToolRenderer} from './types.js'

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
