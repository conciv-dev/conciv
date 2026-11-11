import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import {ConfirmDialog} from '@conciv/ui-kit-system'
import type {SettingsScope} from '@conciv/contract'
import {useAnnounce, usePreferences} from '../app/context.js'

const SCOPE_NAMES: Record<SettingsScope, string> = {project: 'for this project', global: 'for all projects'}

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced/reset')({component: ResetAllDialog})

function ResetAllDialog(): JSX.Element {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const reset = useMutation(() => ({
    mutationFn: () => preferences.clear(search().scope),
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
      description={`Every conciv setting ${SCOPE_NAMES[search().scope]} goes back to its default. Chats and history are kept.`}
      confirmLabel="Reset everything"
      onConfirm={() => reset.mutate()}
    />
  )
}
