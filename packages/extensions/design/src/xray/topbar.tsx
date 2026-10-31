import {For, Show, type JSX} from 'solid-js'
import {Button, RelativeTime, Tabs, Tooltip, TooltipIconButton} from '@conciv/ui-kit-system'
import {diffCommand, type XrayData} from './data.js'
import {percent, SMALL_BUTTON} from './list.js'

export function RunButton(props: {data: XrayData; running: boolean; onRun: () => void; small?: boolean}) {
  return (
    <Tooltip.Root positioning={{placement: 'bottom-end'}}>
      <Tooltip.Trigger
        asChild={(trigger) => (
          <Button
            {...trigger()}
            class={`shrink-0 whitespace-nowrap ${props.small ? SMALL_BUTTON : ''}`}
            size={props.small ? 'none' : 'md'}
            disabled={props.running}
            onClick={() => props.onRun()}
          >
            {props.running ? 'Running…' : 'Run diff'}
          </Button>
        )}
      />
      <Tooltip.Positioner>
        <Tooltip.Content class="font-chat-mono">{diffCommand(props.data.target)}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

type TopbarProps = {
  data: XrayData
  off: number
  running: boolean
  onTarget: (id: string) => void
  onRun: () => void
  onHelp: () => void
}

function Summary(props: {data: XrayData; off: number}): JSX.Element {
  return (
    <Show when={props.data.report} fallback={<>no diff yet</>}>
      {(report) => (
        <>
          <span class={props.off > 0 ? 'text-chat-danger' : undefined}>{percent(report().mismatch)} mismatch</span>
          <Show when={props.off > 0}> · {props.off} off</Show>
          <Show when={props.data.ranAt}>
            {(at) => (
              <>
                {' · '}
                <RelativeTime value={new Date(at())} />
              </>
            )}
          </Show>
        </>
      )}
    </Show>
  )
}

export function Topbar(props: TopbarProps): JSX.Element {
  return (
    <header class="px-4 border-b border-chat-line bg-chat-panel flex gap-4 h-11 min-w-0 items-center">
      <div class="flex gap-2 min-w-0 items-baseline">
        <h1 class="text-[0.8125rem] text-chat-text-hi font-chat-display font-semibold m-0">design</h1>
        <span class="text-[0.8125rem] text-chat-text-2 truncate">{props.data.target.route}</span>
      </div>
      <Tabs.Root
        class="shrink-0 self-stretch"
        value={props.data.target.id}
        onValueChange={(details) => props.onTarget(details.value)}
      >
        <Tabs.List aria-label="Widths" class="border-b-transparent h-full -mb-px">
          <For each={props.data.widths}>
            {(width) => (
              <Tabs.Trigger value={width.target.id} class="h-full tabular-nums">
                {width.target.width}
                <Show when={(width.off ?? 0) > 0}>
                  <span class="text-chat-text-3">
                    {width.off}
                    <span class="sr-only"> off</span>
                  </span>
                </Show>
              </Tabs.Trigger>
            )}
          </For>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>
      <p class="text-[0.8125rem] text-chat-text-2 m-0 ms-auto whitespace-nowrap tabular-nums">
        <Summary data={props.data} off={props.off} />
      </p>
      <div class="flex shrink-0 gap-1 items-center">
        <RunButton data={props.data} running={props.running} onRun={props.onRun} />
        <TooltipIconButton
          tooltip="Shortcuts"
          side="bottom"
          class="text-[0.8125rem] size-8"
          onClick={() => props.onHelp()}
        >
          ?
        </TooltipIconButton>
      </div>
    </header>
  )
}
