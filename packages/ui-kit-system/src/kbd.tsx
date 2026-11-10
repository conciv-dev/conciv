import {splitProps, type JSX} from 'solid-js'

const KEYCAP =
  'inline-flex items-center h-[1.55em] px-[0.45em] rounded-[0.4em] text-[0.86em] font-medium tabular-nums tracking-[0.02em] [font-family:inherit] [color:color-mix(in_oklch,currentColor_72%,transparent)] [background:color-mix(in_oklch,currentColor_9%,transparent)] [box-shadow:inset_0_-1px_0_color-mix(in_oklch,currentColor_12%,transparent)]'

export function Kbd(props: JSX.HTMLAttributes<HTMLElement>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <kbd {...rest} class={`${KEYCAP}  ${local.class ?? ''}`} />
}
