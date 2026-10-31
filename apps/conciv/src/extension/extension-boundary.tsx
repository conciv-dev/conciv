import {ErrorBoundary, Suspense, type Component, type JSX} from 'solid-js'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {collectAttachmentCards, collectToolRenderers, type AnyExtension} from '@conciv/extension'
import type {ToolBodyPredicate, ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {NoteRow} from '@conciv/ui-kit-chat/tools'
import {ErrorScreen} from '../shell/error-screen.js'

export type ExtensionFallback = 'silent' | 'tab' | 'card'

function reportCrash(name: string, error: unknown): void {
  console.error(`[conciv] extension "${name}" crashed`, error)
}

function CardFallback(props: {name: string}): JSX.Element {
  return (
    <NoteRow icon={<TriangleAlert size={12} aria-hidden="true" />} tone="accent">
      <span class="[color:var(--chat-text-2)]">This card failed to render</span>{' '}
      <span class="[color:var(--chat-text-3)] [font-family:var(--chat-mono)] [overflow-wrap:anywhere]">
        {props.name}
      </span>
    </NoteRow>
  )
}

export function ExtensionBoundary(props: {
  name: string
  fallback: ExtensionFallback
  children: JSX.Element
}): JSX.Element {
  const fallback = (error: unknown, reset: () => void): JSX.Element => {
    reportCrash(props.name, error)
    if (props.fallback === 'tab')
      return (
        <ErrorScreen
          message={`The ${props.name} extension crashed`}
          detail="Details are in the browser console."
          onRetry={reset}
        />
      )
    if (props.fallback === 'card') return <CardFallback name={props.name} />
    return null
  }
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense>{props.children}</Suspense>
    </ErrorBoundary>
  )
}

export function guardedComponent<Props extends object>(
  name: string,
  fallback: ExtensionFallback,
  Guarded: Component<Props>,
): Component<Props> {
  return (props) => (
    <ExtensionBoundary name={name} fallback={fallback}>
      <Guarded {...props} />
    </ExtensionBoundary>
  )
}

function guardedBodyPredicate(name: string, predicate: ToolBodyPredicate): ToolBodyPredicate {
  return (part, result, ctx) => {
    try {
      return predicate(part, result, ctx)
    } catch (error) {
      reportCrash(name, error)
      return true
    }
  }
}

export function guardedToolCards(extensions: AnyExtension[]): ToolCardEntry[] {
  return collectToolRenderers(extensions).map((entry) => {
    const owner = extensions.find((extension) => extension.tools?.some((tool) => entry.names.includes(tool.name)))
    const name = owner?.name ?? entry.names.join(', ')
    return {
      ...entry,
      render: guardedComponent(name, 'card', entry.render),
      hasEmbeddedBody: guardedBodyPredicate(name, entry.hasEmbeddedBody),
    }
  })
}

export function guardedAttachmentCards(extensions: AnyExtension[], fallback: ExtensionFallback): AttachmentCardSlot[] {
  return collectAttachmentCards(extensions).map((entry) => {
    const owner = extensions.find((extension) =>
      extension.attachments?.some((attachment) => attachment.mime === entry.mime),
    )
    return {...entry, render: guardedComponent(owner?.name ?? entry.mime, fallback, entry.render)}
  })
}
