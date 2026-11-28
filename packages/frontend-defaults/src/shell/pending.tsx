import {Show, type JSX} from 'solid-js'
import {useRouteContext} from '@tanstack/solid-router'
import {Loader} from '@conciv/ui-kit-system'

const SKEL = 'skel-bg [background-size:200%_100%] anim-skel'

const PENDING_PANE_LABEL = 'Loading conciv'

export function PendingPane(): JSX.Element {
  const connected = useRouteContext({strict: false, select: (context) => context.connected})
  return (
    <Loader.Root class="h-full w-full text-chat-text" translations={{value: () => PENDING_PANE_LABEL}}>
      <Loader.Indicator />
      <Loader.Text>
        <Loader.Label>{`${PENDING_PANE_LABEL}…`}</Loader.Label>
        <Show when={connected()?.() !== true}>
          <Loader.Description>Reconnecting to your workspace.</Loader.Description>
        </Show>
      </Loader.Text>
    </Loader.Root>
  )
}

export function SessionPillPending(): JSX.Element {
  return (
    <div class="inline-flex min-w-0 items-center" role="status">
      <div class={`${SKEL} h-7 w-24 rounded-chat-surface-sm`} aria-hidden="true" />
      <span class="sr-only">Loading sessions…</span>
    </div>
  )
}

export function UsagePending(): JSX.Element {
  return (
    <div class="inline-flex items-center px-1.5 py-0.5" role="status">
      <div class={`${SKEL} h-4 w-10 rounded-chat-surface-sm`} aria-hidden="true" />
      <span class="sr-only">Loading context usage…</span>
    </div>
  )
}

export function ComposerActionsPending(): JSX.Element {
  return (
    <div class="flex gap-1 items-center" role="status">
      <div class={`${SKEL} size-8.5 rounded-chat-pill`} aria-hidden="true" />
      <div class={`${SKEL} size-8.5 rounded-chat-pill`} aria-hidden="true" />
      <div class={`${SKEL} size-8.5 rounded-chat-pill`} aria-hidden="true" />
      <span class="sr-only">Loading composer actions…</span>
    </div>
  )
}
