import {type JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import {useRouter} from '@tanstack/solid-router'
import {Button} from '@conciv/ui-kit-system'
import {useAnnounce, useAppData} from '../app/context.js'

const PANEL =
  'flex flex-1 flex-col items-center justify-center gap-3 p-6 min-h-0 text-center text-chat-text text-chat-sm'

export function DeletedSessionPanel(): JSX.Element {
  const appData = useAppData()
  const router = useRouter()
  const announce = useAnnounce()

  const move = useMutation(() => ({
    mutationFn: () => appData.createSession(),
    onSuccess: ({sessionId}: {sessionId: string}) => {
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
