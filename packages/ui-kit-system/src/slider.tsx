import {splitProps, type ComponentProps} from 'solid-js'
import {Slider as Ark} from '@ark-ui/solid/slider'

const ROOT = 'flex flex-col gap-1.5 w-full data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const CONTROL = 'relative flex items-center h-4.5 cursor-pointer data-[disabled]:cursor-not-allowed'
const TRACK = 'relative flex-1 h-1 rounded-chat-pill bg-chat-fill-strong overflow-hidden'
const RANGE = 'absolute h-full bg-chat-accent'
const THUMB =
  'size-3.5 rounded-chat-pill bg-chat-text [border:1px_solid_var(--chat-line)] trans-btn data-[dragging]:bg-chat-accent data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem]'
const LABEL = 'text-[0.8125rem] font-chat text-chat-text-2'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Root {...rest} class={`${ROOT}  ${local.class ?? ''}`} />
}

function Control(props: ComponentProps<typeof Ark.Control>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Control {...rest} class={`${CONTROL}  ${local.class ?? ''}`} />
}

function Track(props: ComponentProps<typeof Ark.Track>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Track {...rest} class={`${TRACK}  ${local.class ?? ''}`} />
}

function Range(props: ComponentProps<typeof Ark.Range>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Range {...rest} class={`${RANGE}  ${local.class ?? ''}`} />
}

function Thumb(props: ComponentProps<typeof Ark.Thumb>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Thumb {...rest} class={`${THUMB}  ${local.class ?? ''}`} />
}

function Label(props: ComponentProps<typeof Ark.Label>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Label {...rest} class={`${LABEL}  ${local.class ?? ''}`} />
}

export const Slider = Object.assign({}, Ark, {Root, Control, Track, Range, Thumb, Label})
