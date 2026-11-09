import {createFileRoute} from '@tanstack/solid-router'
import {For, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useMutation} from '@tanstack/solid-query'
import RotateCcw from 'lucide-solid/icons/rotate-ccw'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {useAnnounce, usePreferences} from '../app/context.js'
import type {PreferenceKey} from '../settings/preferences-schema.js'
import {ActionRow, BUTTON_DANGER_ARMED, BUTTON_DANGER_FILL, BUTTON_WARN, Group} from '../settings/settings-ui.js'

const RESETS: {label: string; hint: string; action: string; keys: PreferenceKey[]}[] = [
  {
    label: 'Views',
    hint: 'Show every view again, in the default order.',
    action: 'Reset views',
    keys: ['docksHidden', 'docksPinned', 'docksCustomOrder'],
  },
  {label: 'Shortcuts', hint: 'Back to the default keys.', action: 'Reset shortcuts', keys: ['commandShortcuts']},
]

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced')({component: AdvancedSettings})

function AdvancedSettings(): JSX.Element {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const [state, setState] = createStore({armed: false})
  const reset = useMutation(() => ({
    mutationFn: (keys: PreferenceKey[] | 'all') => (keys === 'all' ? preferences.clear() : preferences.reset(keys)),
    onSuccess: () => announce('Settings reset'),
    onError: () => announce('Could not reset the settings', true),
  }))
  const resetAll = () => {
    if (!state.armed) return setState('armed', true)
    setState('armed', false)
    reset.mutate('all')
  }
  return (
    <div class="flex flex-col gap-3.5">
      <Group title="Reset" description="Put one part back to its defaults">
        <For each={RESETS}>
          {(entry) => (
            <ActionRow label={entry.label} hint={entry.hint}>
              <button
                type="button"
                class={BUTTON_WARN}
                disabled={reset.isPending}
                onClick={() => reset.mutate(entry.keys)}
              >
                <RotateCcw class="size-3.25" aria-hidden="true" />
                {entry.action}
              </button>
            </ActionRow>
          )}
        </For>
      </Group>
      <Group
        danger
        title={
          <>
            <TriangleAlert class="size-3.75" aria-hidden="true" />
            Danger zone
          </>
        }
        description="Cannot be undone"
      >
        <ActionRow label="Reset all settings" hint="Every setting for this project. Chats and history are kept.">
          <button
            type="button"
            class={state.armed ? BUTTON_DANGER_ARMED : BUTTON_DANGER_FILL}
            disabled={reset.isPending}
            onClick={resetAll}
            onBlur={() => setState('armed', false)}
          >
            {state.armed ? 'Click again' : 'Reset all'}
          </button>
        </ActionRow>
      </Group>
    </div>
  )
}
