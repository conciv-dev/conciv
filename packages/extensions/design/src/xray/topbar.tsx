import {For, Show, type JSX} from 'solid-js'
import {Button, RelativeTime, StatusDot, Tabs, Tooltip} from '@conciv/ui-kit-system'
import {diffCommand, type XrayData} from './data.js'
import {Kbd} from './kbd.js'
import {percent} from './rail.js'

type TopbarProps = {
  data: XrayData
  above: number
  running: boolean
  onTarget: (id: string) => void
  onAbove: () => void
  onAll: () => void
  onRun: () => void
}

export function RunButton(props: {data: XrayData; running: boolean; onRun: () => void; size?: 'sm' | 'md'}) {
  return (
    <Tooltip.Root positioning={{placement: 'bottom-end'}}>
      <Tooltip.Trigger
        asChild={(trigger) => (
          <Button
            {...trigger()}
            class="shrink-0"
            size={props.size ?? 'md'}
            disabled={props.running}
            onClick={() => props.onRun()}
          >
            {props.running ? 'Running…' : 'Run diff'} <Kbd>R</Kbd>
          </Button>
        )}
      />
      <Tooltip.Positioner>
        <Tooltip.Content class="font-chat-mono">{diffCommand(props.data.target)}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

export function Topbar(props: TopbarProps): JSX.Element {
  const ran = () => props.data.report !== null
  return (
    <header class="pe-4 ps-4 border-b border-chat-line bg-chat-panel flex gap-5 h-11.25 min-w-0 items-center lt-xl:gap-3">
      <div class="flex gap-2 min-w-0 items-baseline">
        <h1 class="text-[0.8125rem] text-chat-text-hi tracking-[-0.01em] font-chat-display font-semibold m-0">
          design
        </h1>
        <span class="text-[0.75rem] text-chat-text-2 font-chat-mono truncate">{props.data.target.route}</span>
      </div>
      <Tabs.Root
        class="shrink-0 self-stretch"
        value={props.data.target.id}
        onValueChange={(details) => props.onTarget(details.value)}
      >
        <Tabs.List aria-label="widths" class="border-b-transparent h-full -mb-px">
          <For each={props.data.widths}>
            {(width) => (
              <Tabs.Trigger value={width.target.id} class="h-full">
                <StatusDot tone={width.tone} />
                <span class="text-[0.75rem] font-chat-mono">{width.target.width}</span>
              </Tabs.Trigger>
            )}
          </For>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>
      <Show when={ran()}>
        <Button variant="accent-soft" size="sm" class="rounded-chat-pill" onClick={() => props.onAbove()}>
          {props.above} above tolerance
        </Button>
        <Button variant="outline" size="sm" class="rounded-chat-pill" onClick={() => props.onAll()}>
          {props.above === 0 ? 'done' : 'not done'}
        </Button>
      </Show>
      <div class="ms-auto flex shrink-0 gap-2 items-baseline">
        <span class="text-[0.6875rem] text-chat-text-3 tracking-wider uppercase">mismatch</span>
        <span
          class={`text-xl leading-none tracking-tight font-chat-display font-semibold tabular-nums ${props.above > 0 ? 'text-chat-danger' : 'text-chat-text-hi'}`}
        >
          {props.data.report === null ? '—' : percent(props.data.report.mismatch)}
        </span>
        <Show when={props.data.ranAt}>
          {(at) => (
            <RelativeTime
              value={new Date(at())}
              class="text-[0.6875rem] text-chat-text-2 px-2 py-0.5 border border-chat-line rounded-chat-pill bg-chat-fill"
            />
          )}
        </Show>
      </div>
      <RunButton data={props.data} running={props.running} onRun={props.onRun} />
    </header>
  )
}
