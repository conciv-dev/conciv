import {ErrorBoundary, Suspense, type JSX} from 'solid-js'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {AttachmentUI, type AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {NoteRow} from '@conciv/ui-kit-chat/tools'
import {ErrorScreen} from '../../shell/error-screen.js'

type PluginFallback = 'card' | 'chip'

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

function ChipFallback(props: {name: string; onRemove?: (id: string) => void}): JSX.Element {
  return (
    <div role="status">
      <AttachmentUI onRemove={props.onRemove} failure={`Failed to render ${props.name}`} />
    </div>
  )
}

export function createTabCrash(focusAfterRetry: () => HTMLElement | undefined) {
  const shown: {retry?: HTMLButtonElement} = {}
  const retry = (reset: () => void): void => {
    shown.retry = undefined
    reset()
    const target = shown.retry ?? focusAfterRetry()
    target?.focus()
  }

  return (message: string, reset: () => void): JSX.Element => (
    <ErrorScreen
      message={message}
      detail="Details are in the browser console."
      onRetry={() => retry(reset)}
      retryRef={(element) => {
        shown.retry = element
      }}
    />
  )
}

function PluginBoundary(props: {
  name: string
  fallback: PluginFallback
  onRemove?: (id: string) => void
  children: JSX.Element
}): JSX.Element {
  const fallback = (error: unknown): JSX.Element => {
    reportCrash(props.name, error)
    if (props.fallback === 'card') return <CardFallback name={props.name} />
    return <ChipFallback name={props.name} onRemove={props.onRemove} />
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
