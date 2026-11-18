import type {Component} from 'solid-js'
import {collectAttachmentCards, collectToolRenderers, type AnyExtension} from '@conciv/extension'
import type {ToolBodyPredicate, ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {
  PluginBoundary,
  guardPluginAttachmentCard,
  reportCrash,
  type PluginFallback,
} from '../runtime/plugin/plugin-boundary.js'

export function guardedComponent<Props extends object>(
  name: string,
  fallback: PluginFallback,
  Guarded: Component<Props>,
): Component<Props> {
  return (props) => (
    <PluginBoundary name={name} fallback={fallback}>
      <Guarded {...props} />
    </PluginBoundary>
  )
}

function crashKey(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return typeof error
}

function guardedBodyPredicate(name: string, predicate: ToolBodyPredicate): ToolBodyPredicate {
  const reported = new Set<string>()
  return (part, result, ctx) => {
    try {
      return predicate(part, result, ctx)
    } catch (error) {
      const key = crashKey(error)
      if (!reported.has(key)) reportCrash(name, error)
      reported.add(key)
      return true
    }
  }
}

export function guardedToolCards(extensions: AnyExtension[]): ToolCardEntry[] {
  return collectToolRenderers(extensions).map((entry) => {
    const owner = extensions.find((extension) =>
      extension.tools?.some((tool) => entry.names.includes(tool.name) && tool.__render?.render === entry.render),
    )
    const name = owner?.name ?? entry.names.join(', ')
    return {
      ...entry,
      render: guardedComponent(name, 'card', entry.render),
      hasEmbeddedBody: guardedBodyPredicate(name, entry.hasEmbeddedBody),
    }
  })
}

export function guardedAttachmentCards(extensions: AnyExtension[], fallback: 'card' | 'chip'): AttachmentCardSlot[] {
  return collectAttachmentCards(extensions).map((entry) => {
    const owner = extensions.find((extension) =>
      extension.attachments?.some((attachment) => attachment.mime === entry.mime && attachment.__card === entry.render),
    )
    const Card = entry.render
    return guardPluginAttachmentCard(owner?.name ?? entry.mime, fallback, {mime: entry.mime, render: () => <Card />})
  })
}
