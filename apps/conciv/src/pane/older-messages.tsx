import {createEffect, Show, type JSX} from 'solid-js'
import {useMutation} from '@tanstack/solid-query'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Button} from '@conciv/ui-kit-system'
import type {ChatSession} from '@conciv/client'
import {ConversationSkeleton} from './indicators.js'

const OVERLAY = 'absolute inset-inline-0 top-0 z-1 flex flex-col gap-2 px-5 pt-3 pb-2 [background:var(--chat-bg)]'
const DEFERRED = 'anim-msg animate-delay-[200ms] animate-fill-mode-backwards'
const FAILED = 'flex items-center gap-2 text-chat-danger text-[0.75rem]'

export function OlderMessages(props: {chat: ChatSession; viewport: HTMLElement | undefined}): JSX.Element {
  const older = useMutation(() => ({mutationFn: () => props.chat.loadOlderMessages()}))
  const loadWhenNearTop = (viewport: HTMLElement): void => {
    if (viewport.scrollTop > viewport.clientHeight) return
    if (!props.chat.hasOlderMessages() || older.isPending || older.isError) return
    older.mutate()
  }
  createEffect(() => {
    const viewport = props.viewport
    if (viewport) makeEventListener(viewport, 'scroll', () => loadWhenNearTop(viewport), {passive: true})
  })
  return (
    <>
      <Show when={older.isPending}>
        <div class={`${OVERLAY} ${DEFERRED}`}>
          <ConversationSkeleton label="Loading earlier messages" />
        </div>
      </Show>
      <Show when={older.isError}>
        <div class={OVERLAY}>
          <div class={FAILED} role="alert">
            <span class="flex-1">Couldn’t load earlier messages.</span>
            <Button variant="outline-danger" onClick={() => older.mutate()}>
              Retry
            </Button>
          </div>
        </div>
      </Show>
    </>
  )
}
