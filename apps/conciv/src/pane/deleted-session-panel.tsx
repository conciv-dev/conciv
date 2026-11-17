import {Show, type JSX} from 'solid-js'
import {useMutation, useQuery} from '@conciv/client'
import {Button} from '@conciv/ui-kit-system'
import {useAnnounce, useAppData} from '../app/context.js'
import {prependDraft} from './draft-storage.js'
import {useStartSession} from '../app/start-session.js'
import {usePane} from '../app/pane-context.js'

const PANEL =
  'flex flex-1 flex-col items-center justify-center gap-3 p-6 min-h-0 text-center text-chat-text text-chat-sm'

export function DeletedSessionPanel(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const announce = useAnnounce()
  const startSession = useStartSession()
  const pane = usePane()
  const draft = useQuery(() => appData.utils.drafts.get.queryOptions({input: {sessionId: props.sessionId}}))
  const carried = () => (draft.isSuccess ? (draft.data?.text ?? '') : '')

  const clearDeletedDraft = () =>
    appData
      .saveDraft({sessionId: props.sessionId, text: '', selectionStart: 0, selectionEnd: 0, attachments: []})
      .catch(() => undefined)

  const logMoveFailure = <T,>(work: Promise<T>): Promise<T> =>
    work.catch((error: unknown) => {
      console.error('[conciv] could not move to a new session', error)
      throw error
    })

  const move = useMutation(() => ({
    mutationFn: async () => {
      const text = (await logMoveFailure(appData.readDraft(props.sessionId)))?.text ?? ''
      const {sessionId} = await startSession()
      if (text !== '') await logMoveFailure(prependDraft(appData, sessionId, text))
      await clearDeletedDraft()
      return sessionId
    },
    onSuccess: (sessionId: string) => {
      announce('Started a new session')
      pane.replaceSession(sessionId)
    },
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
