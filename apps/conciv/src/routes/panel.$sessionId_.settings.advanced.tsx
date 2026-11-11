import {Link, Outlet, createFileRoute} from '@tanstack/solid-router'
import {For, Show, type JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import RotateCcw from 'lucide-solid/icons/rotate-ccw'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import type {AnyExtension} from '@conciv/extension'
import type {RpcClient, SettingsScope} from '@conciv/contract'
import {useAnnounce, usePreferences, useRpc} from '../app/context.js'
import type {PreferenceKey} from '../settings/preferences-schema.js'
import {ActionRow, BUTTON_DANGER_FILL, BUTTON_WARN, Group} from '../settings/settings-ui.js'
import {writeLastTab} from '../settings/last-tab.js'

const RESETS: {label: string; hint: string; action: string; keys: PreferenceKey[]}[] = [
  {
    label: 'Views',
    hint: 'Show every view again, in the default order.',
    action: 'Reset views',
    keys: ['docksHidden', 'docksPinned', 'docksCustomOrder'],
  },
  {label: 'Shortcuts', hint: 'Back to the default keys.', action: 'Reset shortcuts', keys: ['commandShortcuts']},
]

const SCOPE_NAMES: Record<SettingsScope, string> = {project: 'for this project', global: 'for all projects'}

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced')({
  onEnter: () => writeLastTab('advanced'),
  component: AdvancedSettings,
})

function AdvancedSettings(): JSX.Element {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const rpc = useRpc()
  const search = Route.useSearch()
  const configurable = Route.useRouteContext()().extensions.filter((extension) => extension.settings)
  const reset = useMutation(() => ({
    mutationFn: (target: PreferenceKey[] | 'extensions') =>
      target === 'extensions'
        ? clearExtensionSettings(rpc, search().scope, configurable)
        : preferences.reset(search().scope, target),
    onSuccess: () => announce('Settings reset'),
    onError: () => announce('Could not reset the settings', true),
  }))
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
        <Show when={configurable.length > 0}>
          <ActionRow label="Extensions" hint="Every extension's settings back to its defaults.">
            <button
              type="button"
              class={BUTTON_WARN}
              disabled={reset.isPending}
              onClick={() => reset.mutate('extensions')}
            >
              <RotateCcw class="size-3.25" aria-hidden="true" />
              Reset extension settings
            </button>
          </ActionRow>
        </Show>
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
        <ActionRow
          label="Reset all settings"
          hint={`Every setting ${SCOPE_NAMES[search().scope]}. Chats and history are kept.`}
        >
          <Link from={Route.fullPath} to="./reset" class={BUTTON_DANGER_FILL}>
            Reset all
          </Link>
        </ActionRow>
      </Group>
      <Outlet />
    </div>
  )
}

async function clearExtensionSettings(
  rpc: RpcClient,
  scope: SettingsScope,
  extensions: readonly AnyExtension[],
): Promise<void> {
  await Promise.all(
    extensions.map(async (extension) => {
      const target = {scope, namespace: extension.name}
      const stored = await rpc.settings.all(target)
      await Promise.all(Object.keys(stored.value).map((key) => rpc.settings.delete({...target, key})))
    }),
  )
}
