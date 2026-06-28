import {splitProps, type ComponentProps} from 'solid-js'
import {Switch as Ark} from '@ark-ui/solid/switch'

const ROOT =
  'inline-flex items-center gap-2 cursor-pointer select-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const CONTROL =
  'relative inline-flex items-center w-8 h-4.5 rounded-pw-pill bg-pw-fill-strong [border:1px_solid_var(--pw-line)] trans-btn data-[state=checked]:bg-pw-accent data-[state=checked]:[border-color:var(--pw-accent)] focus-within:[outline:0.125rem_solid_var(--pw-accent)] focus-within:[outline-offset:0.125rem]'
const THUMB =
  'size-3.5 rounded-pw-pill bg-pw-text translate-x-0.5 trans-btn data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-pw-on-accent'
const LABEL = 'text-[0.8125rem] font-pw text-pw-text-2'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Root {...rest} class={`${ROOT}  ${local.class ?? ''}`} />
}

function Control(props: ComponentProps<typeof Ark.Control>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Control {...rest} class={`${CONTROL}  ${local.class ?? ''}`} />
}

function Thumb(props: ComponentProps<typeof Ark.Thumb>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Thumb {...rest} class={`${THUMB}  ${local.class ?? ''}`} />
}

function Label(props: ComponentProps<typeof Ark.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

export const Switch = Object.assign({}, Ark, {Root, Control, Thumb, Label})
