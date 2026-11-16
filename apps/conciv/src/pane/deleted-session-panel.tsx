import {Show, type JSX} from 'solid-js'
import {useMutation, useQuery} from '@conciv/client'
import {useRouter} from '@tanstack/solid-router'
import {Button} from '@conciv/ui-kit-system'
import {useAnnounce, useAppData} from '../app/context.js'
import {prependDraft} from './draft-storage.js'

const PANEL =
  'flex flex-1 flex-col items-center justify-center gap-3 p-6 min-h-0 text-center text-chat-text text-chat-sm'

export function DeletedSessionPanel(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const router = useRouter()
  const announce = useAnnounce()
  const draft = useQuery(() => appData.utils.drafts.get.queryOptions({input: {sessionId: props.sessionId}}))
  const carried = () => (draft.isSuccess ? (draft.data?.text ?? '') : '')

  const clearDeletedDraft = () =>
    appData
      .saveDraft({sessionId: props.sessionId, text: '', selectionStart: 0, selectionEnd: 0, attachments: []})
      .catch(() => undefined)

  const move = useMutation(() => ({
    mutationFn: async () => {
      const text = (await appData.readDraft(props.sessionId))?.text ?? ''
      const {sessionId} = await appData.createSession()
      if (text !== '') await prependDraft(appData, sessionId, text)
      await clearDeletedDraft()
      return sessionId
    },
    onSuccess: (sessionId: string) => {
      announce('Started a new session')
      void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    },
    onError: (error: unknown) => console.error('[conciv] could not move to a new session', error),
  }))

  return (
    <section class={PANEL} aria-label="Deleted session">
      <p class="font-semibold" role="status">
        This session was deleted.
      </p>
      <Show when={carried() !== ''}>
        <p class="text-chat-text-2">Your text moves to the new session.</p>
      </Show>
      <Button
        variant="outline"
        class="min-h-11"
        disabled={move.isPending}
        aria-busy={move.isPending}
        onClick={() => move.mutate()}
      >
        New session
      </Button>
    </section>
  )
}
