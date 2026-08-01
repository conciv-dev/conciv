import {Show, type JSX} from 'solid-js'
import {Tooltip} from '@conciv/ui-kit-system'

const TONE = {
  new: '[border-color:color-mix(in_srgb,var(--chat-accent)_45%,transparent)] [color:var(--chat-accent)]',
  bad: '[border-color:var(--chat-danger-line)] [color:var(--chat-danger)]',
}

const CHIP =
  'inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--chat-radius-pill)] px-2 py-0.5 text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)]'

export function ToolChip(props: {name: string; tone?: 'new' | 'bad'; tip?: JSX.Element}): JSX.Element {
  const chipClass = () => `${CHIP} ${props.tone ? TONE[props.tone] : ''}`
  return (
    <Show when={props.tip} fallback={<span class={chipClass()}>{props.name}</span>}>
      <Tooltip.Root>
        <Tooltip.Trigger type="button" class={chipClass()}>
          {props.name}
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>{props.tip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
    </Show>
  )
}
