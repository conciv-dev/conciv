import {ErrorBoundary, Suspense, type Component, type JSX} from 'solid-js'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {collectAttachmentCards, collectToolRenderers, type AnyExtension} from '@conciv/extension'
import type {ToolBodyPredicate, ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {NoteRow} from '@conciv/ui-kit-chat/tools'
import {ErrorScreen} from '../shell/error-screen.js'

export type ExtensionFallback = 'silent' | 'tab' | 'card' | 'chip'

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

function ChipFallback(props: {name: string; remove?: JSX.Element}): JSX.Element {
  return (
    <div
      role="status"
      class="inline-flex items-center gap-1 ps-2 pe-0.5 min-h-8 max-w-full rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] text-[0.75rem]"
    >
      <TriangleAlert size={12} class="shrink-0 [color:var(--chat-danger)]" aria-hidden="true" />
      <span class="[color:var(--chat-text-2)]">Failed to render</span>
      <span class="min-w-0 [color:var(--chat-text-3)] [font-family:var(--chat-mono)] [overflow-wrap:anywhere]">
        {props.name}
      </span>
      {props.remove}
    </div>
  )
}

export function ExtensionBoundary(props: {
  name: string
  fallback: ExtensionFallback
  remove?: JSX.Element
  focusAfterRetry?: () => HTMLElement | undefined
  children: JSX.Element
}): JSX.Element {
  let retryButton: HTMLButtonElement | undefined
  const retry = (reset: () => void): void => {
    retryButton = undefined
    reset()
    const target = retryButton ?? props.focusAfterRetry?.()
    target?.focus()
  }
  const fallback = (error: unknown, reset: () => void): JSX.Element => {
    reportCrash(props.name, error)
    if (props.fallback === 'tab')
      return (
        <ErrorScreen
          message={`The ${props.name} extension crashed`}
          detail="Details are in the browser console."
          onRetry={() => retry(reset)}
          retryRef={(element) => {
            retryButton = element
          }}
        />
      )
    if (props.fallback === 'card') return <CardFallback name={props.name} />
    if (props.fallback === 'chip') return <ChipFallback name={props.name} remove={props.remove} />
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
    const name = owner?.name ?? entry.mime
    return {
      ...entry,
      render: (props) => (
        <ExtensionBoundary name={name} fallback={fallback} remove={props.remove}>
          <entry.render {...props} />
        </ExtensionBoundary>
      ),
    }
  })
}
