import type {AnyExtension} from './define-extension.js'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {AttachmentCardEntry} from './types.js'

export function collectToolRenderers(builders: AnyExtension[]): ToolCardEntry[] {
  const seen = new Set<string>()
  const entries: ToolCardEntry[] = []
  for (const builder of builders)
    for (const tool of builder.tools ?? []) {
      const card = tool.__render
      if (!card || seen.has(tool.name)) continue
      seen.add(tool.name)
      entries.push({
        names: [tool.name],
        render: card.render,
        hasEmbeddedBody: card.hasEmbeddedBody,
        display: tool.display,
      })
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
