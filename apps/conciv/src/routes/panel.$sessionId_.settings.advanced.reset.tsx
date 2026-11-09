import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useMutation} from '@tanstack/solid-query'
import {ConfirmDialog} from '@conciv/ui-kit-system'
import {useAnnounce, usePreferences} from '../app/context.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced/reset')({component: ResetAllDialog})

function ResetAllDialog(): JSX.Element {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const navigate = Route.useNavigate()
  const reset = useMutation(() => ({
    mutationFn: () => preferences.clear(),
    onSuccess: () => announce('Settings reset'),
    onError: () => announce('Could not reset the settings', true),
  }))
  const leave = (open: boolean) => {
    if (open) return
    void navigate({to: '..', replace: true})
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={leave}
      title="Reset all settings?"
      description="Every conciv setting for this project goes back to its default. Chats and history are kept."
      confirmLabel="Reset everything"
      onConfirm={() => reset.mutate()}
    />
  )
}
