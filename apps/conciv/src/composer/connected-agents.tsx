import {For, Show, type JSX} from 'solid-js'
import {difference} from 'es-toolkit'
import {Progress, TooltipIconButton} from '@conciv/ui-kit-system'
import Plug from 'lucide-solid/icons/plug'
import X from 'lucide-solid/icons/x'
import {Clawd} from './clawd/clawd.js'
import {useHubConnections} from './hub-connections.js'

const ROW = 'inline-flex flex-wrap items-center gap-1.5'
const CHIP_BASE = 'inline-flex items-center gap-1 min-h-6 ps-1.5 rounded-chat-pill bg-chat-fill text-chat-text-2'
const CHIP = `${CHIP_BASE} pe-0.5`
const PLAIN_CHIP = `${CHIP_BASE} pe-2`
const DISCONNECT =
  'size-5 rounded-chat-pill relative after:content-[""] after:absolute after:-inset-3 text-chat-text-3 hover:text-chat-text-hi'

export function ConnectedAgents(props: {sessionId: string; onDisconnected: () => void}): JSX.Element {
  const hub = useHubConnections(() => props.sessionId)
  const settled = () => difference(hub.connections(), hub.disconnecting())
  const visible = () => hub.connections().length + hub.connecting().length > 0
  return (
    <Show when={visible()}>
      <div class={ROW} role="group" aria-label="Connected agents">
        <For each={settled()}>
          {(connection) => (
            <span class={CHIP}>
              <AgentIcon harnessId={connection.harnessId} />
              <span>{connection.name}</span>
              <TooltipIconButton
                tooltip={`Disconnect ${connection.name}`}
                class={DISCONNECT}
                onClick={() => hub.disconnect(connection, props.onDisconnected)}
              >
                <X class="size-3 block" aria-hidden="true" />
              </TooltipIconButton>
            </span>
          )}
        </For>
        <For each={hub.disconnecting()}>{(agent) => <PendingChip label={`Disconnecting ${agent.name}…`} />}</For>
        <For each={hub.connecting()}>{(agent) => <PendingChip label={`Connecting ${agent.name}…`} />}</For>
      </div>
    </Show>
  )
}

function AgentIcon(props: {harnessId: string}): JSX.Element {
  return (
    <Show when={props.harnessId === 'claude'} fallback={<Plug class="size-3 block shrink-0" aria-hidden="true" />}>
      <Clawd class="h-3.5 w-auto block shrink-0" />
    </Show>
  )
}

function PendingChip(props: {label: string}): JSX.Element {
  return (
    <span class={PLAIN_CHIP} role="status" aria-live="polite">
      <Progress.Root value={25} class="block [--size:0.75rem] [--thickness:0.125rem]" aria-hidden="true">
        <Progress.Circle class="[transform-origin:center] anim-compact">
          <Progress.CircleTrack class="stroke-chat-line-2" />
          <Progress.CircleRange class="[stroke-linecap:round] stroke-chat-accent" />
        </Progress.Circle>
      </Progress.Root>
      {props.label}
    </span>
  )
}
