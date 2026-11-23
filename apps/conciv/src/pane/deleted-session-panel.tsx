import {createResource, Show, type JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import {Button} from '@conciv/ui-kit-system'
import {useAnnounce, useAppData, useLiveSessions} from '../app/context.js'
import {carryMovedDraft, clearMovedDraft, movesNothing, readMovedDraft, type MovedDraft} from './draft-storage.js'
import {useStartSession} from '../app/start-session.js'
import {usePane} from '../app/pane-context.js'

const PANEL =
  'flex flex-1 flex-col items-center justify-center gap-3 p-6 min-h-0 text-center text-chat-text text-chat-sm'

export function DeletedSessionPanel(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const announce = useAnnounce()
  const startSession = useStartSession()
  const pane = usePane()
  const {keepDraft} = useLiveSessions()
  const [carried] = createResource(
    () => props.sessionId,
    (sessionId) =>
      readMovedDraft(appData, keepDraft, sessionId).catch((error: unknown): MovedDraft | undefined => {
        console.error('[conciv] could not read the deleted session draft', error)
        return undefined
      }),
  )

  const logMoveFailure = <T,>(work: Promise<T>): Promise<T> =>
    work.catch((error: unknown) => {
      console.error('[conciv] could not move to a new session', error)
      throw error
    })

  const move = useMutation(() => ({
    mutationFn: async () => {
      const moved = await logMoveFailure(readMovedDraft(appData, keepDraft, props.sessionId))
      const {sessionId} = await startSession()
      if (!movesNothing(moved)) await logMoveFailure(carryMovedDraft(appData, keepDraft, sessionId, moved))
      await clearMovedDraft(appData, keepDraft, props.sessionId)
      return sessionId
    },
    onSuccess: async (sessionId: string) => {
      await pane.replaceSession(sessionId)
      announce('Started a new session')
    },
  }))

  return (
    <section class={PANEL} aria-label="Deleted session">
      <p class="font-semibold" role="status">
        This session was deleted.
      </p>
      <Show when={carried.state === 'ready' && !movesNothing(carried())}>
        <p class="text-chat-text-2">Your draft moves to the new session.</p>
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
