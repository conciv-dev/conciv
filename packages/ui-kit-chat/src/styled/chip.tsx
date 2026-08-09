import type {JSX} from 'solid-js'

export const CHIP =
  'inline-flex items-center gap-1.25 max-w-full min-w-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-accent-link)] [background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] rounded-[var(--chat-radius-pill)] py-0.5 px-2.25'
export const CHIP_KEY = 'text-[color:var(--chat-text-3)] m-0'
export const CHIP_VALUE = 'whitespace-nowrap text-ellipsis overflow-hidden [color:var(--chat-text)] m-0'

export function Chip(props: {name: string; value: string}): JSX.Element {
  return (
    <div class={CHIP}>
      <dt class={CHIP_KEY}>{props.name}</dt>
      <dd class={CHIP_VALUE}>{props.value}</dd>
    </div>
  )
}
