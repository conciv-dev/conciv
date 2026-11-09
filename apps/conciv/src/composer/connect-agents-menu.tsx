import {For, Show, type JSX} from 'solid-js'
import {useMutation, useQueryClient} from '@tanstack/solid-query'
import {Menu, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ComposerActions as Action} from '@conciv/ui-kit-chat'
import Plug from 'lucide-solid/icons/plug'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {useAppData, useRpc} from '../app/context.js'
import {useSessionModels} from '../data/harness-meta.js'
import {useNotices} from '../shell/notice-context.js'

const MENU_LABEL = 'Connect agents'

type HubInstall = {harnessId: InitHarnessId; name: string}

export function ConnectAgentsMenu(props: {sessionId: string; class: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const queryClient = useQueryClient()
  const notices = useNotices()
  const models = useSessionModels(() => props.sessionId)
  const installs = (): HubInstall[] => (models.isSuccess ? models.data.hubInstalls : [])
  const connect = useMutation(() => ({
    mutationFn: async (install: HubInstall) => ({
      install,
      outcome: await rpc.meta.connectHub({harness: install.harnessId}),
    }),
    onSuccess: async ({install, outcome}) => {
      if (!outcome.ok) {
        notices.notify(outcome.message, {tone: 'warn'})
        return
      }
      notices.notify(`${install.name} connected. Ask any ${install.name} session for your conciv tab.`)
      await queryClient.invalidateQueries({queryKey: appData.utils.meta.models.key()})
    },
    onError: (_error: unknown, install: HubInstall) =>
      notices.notify(`Couldn’t connect ${install.name}. Try again.`, {tone: 'warn'}),
  }))
  return (
    <Show when={installs().length > 0}>
      <Action.Action priority={10} disabled={() => connect.isPending}>
        <Action.Inline>
          <Menu.Root>
            <TooltipIconButtonSlot tooltip={MENU_LABEL} class={props.class}>
              {(buttonProps) => (
                <Menu.Trigger
                  asChild={(triggerProps) => (
                    <button
                      {...buttonProps()}
                      {...triggerProps()}
                      disabled={connect.isPending}
                      aria-busy={connect.isPending}
                    >
                      <Plug class="size-5 block" aria-hidden="true" />
                    </button>
                  )}
                />
              )}
            </TooltipIconButtonSlot>
            <Menu.Positioner>
              <Menu.Content aria-label={MENU_LABEL}>
                <For each={installs()}>
                  {(install) => (
                    <Menu.Item value={install.harnessId} onSelect={() => connect.mutate(install)}>
                      <Plug class="size-4 block" aria-hidden="true" />
                      Connect {install.name}
                    </Menu.Item>
                  )}
                </For>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </Action.Inline>
        <For each={installs()}>
          {(install) => (
            <Action.ActionMenuItem label={`Connect ${install.name}`} onSelect={() => connect.mutate(install)}>
              <Plug class="size-4 block" aria-hidden="true" />
            </Action.ActionMenuItem>
          )}
        </For>
      </Action.Action>
    </Show>
  )
}
