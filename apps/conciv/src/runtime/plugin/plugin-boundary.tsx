import {ErrorBoundary, Suspense, type JSX} from 'solid-js'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {AttachmentUI, type AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {NoteRow} from '@conciv/ui-kit-chat/tools'
import {ErrorScreen} from '../../shell/error-screen.js'

export type PluginFallback = 'silent' | 'tab' | 'card' | 'chip'

export function reportCrash(name: string, error: unknown): void {
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

function ChipFallback(props: {name: string; onRemove?: (id: string) => void}): JSX.Element {
  return (
    <div role="status">
      <AttachmentUI onRemove={props.onRemove} failure={`Failed to render ${props.name}`} />
    </div>
  )
}

export function PluginBoundary(props: {
  name: string
  fallback: PluginFallback
  onRemove?: (id: string) => void
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
    if (props.fallback === 'chip') return <ChipFallback name={props.name} onRemove={props.onRemove} />
    return null
  }
  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense>{props.children}</Suspense>
    </ErrorBoundary>
  )
}

export function guardPluginAttachmentCard(
  name: string,
  fallback: 'card' | 'chip',
  entry: AttachmentCardSlot,
): AttachmentCardSlot {
  return {
    ...entry,
    render: (props) => (
      <PluginBoundary name={name} fallback={fallback} onRemove={props.onRemove}>
        <entry.render {...props} />
      </PluginBoundary>
    ),
  }
}
