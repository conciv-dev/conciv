import {createFileRoute} from '@tanstack/solid-router'
import {onCleanup, type JSX} from 'solid-js'
import {useMutation} from '@tanstack/solid-query'
import {ConfirmDialog} from '@conciv/ui-kit-system'
import {useAnnounce, useLayers, usePreferences} from '../app/context.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced/reset')({component: ResetSettings})

function ResetSettings(): JSX.Element {
  const navigate = Route.useNavigate()
  const preferences = usePreferences()
  const announce = useAnnounce()
  onCleanup(useLayers().register(() => true, false))
  const reset = useMutation(() => ({
    mutationFn: preferences.clear,
    onSuccess: () => announce('conciv settings reset'),
    onError: () => announce('The settings could not be reset', true),
  }))
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) void navigate({to: '..', replace: true})
      }}
      title="Reset all conciv settings?"
      description="Appearance, views and shortcuts go back to their defaults for this project. Settings the project sets in conciv({...}) stay as they are."
      confirmLabel="Reset all"
      onConfirm={() => reset.mutate()}
    />
  )
}
