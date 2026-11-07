import {createMemo, Show, type JSX} from 'solid-js'
import {useIsFetching, useQuery} from '@tanstack/solid-query'
import {Button} from '@conciv/ui-kit-system'
import {useThreadViewport} from '@conciv/ui-kit-chat'
import type {ChatSession} from '@conciv/client'
import {ConversationSkeleton} from './indicators.js'

const OVERLAY = 'absolute inset-inline-0 top-0 z-1 flex flex-col gap-2 px-5 pt-3 pb-2 [background:var(--chat-bg)]'
const DEFERRED = 'anim-msg animate-delay-[200ms] animate-fill-mode-backwards'
const FAILED = 'flex items-center gap-2 text-chat-danger text-[0.75rem]'

export function OlderMessages(props: {sessionId: string; chat: ChatSession}): JSX.Element {
  const viewport = useThreadViewport()
  const pagesKey = () => ['older-messages', props.sessionId]
  const loading = useIsFetching(() => ({queryKey: pagesKey()}))
  const wanted = () => viewport.isNearTop() && props.chat.hasOlderMessages() && loading() === 0
  const oldestId = createMemo(() => props.chat.messages()[0]?.id ?? null)
  const older = useQuery(() => ({
    queryKey: [...pagesKey(), oldestId()],
    queryFn: () => props.chat.loadOlderMessages().then(() => true),
    enabled: wanted() ? (query) => query.state.status !== 'error' : false,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  }))
  return (
    <>
      <Show when={loading() > 0}>
        <div class={`${OVERLAY} ${DEFERRED}`}>
          <ConversationSkeleton label="Loading earlier messages" />
        </div>
      </Show>
      <Show when={older.isError}>
        <div class={OVERLAY}>
          <div class={FAILED} role="alert">
            <span class="flex-1">Couldn’t load earlier messages.</span>
            <Button variant="outline-danger" onClick={() => void older.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </Show>
    </>
  )
}
