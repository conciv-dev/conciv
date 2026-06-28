import {splitProps, type ComponentProps} from 'solid-js'
import {Avatar as Ark} from '@ark-ui/solid/avatar'

const ROOT =
  'inline-flex items-center justify-center size-7 rounded-pw-pill overflow-hidden bg-pw-fill-strong text-pw-text-2 text-[0.6875rem] font-pw select-none shrink-0'
const IMAGE = 'size-full object-cover'
const FALLBACK = 'inline-flex items-center justify-center size-full uppercase'

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Root {...rest} class={`${ROOT}  ${local.class ?? ''}`} />
}

function Image(props: ComponentProps<typeof Ark.Image>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Image {...rest} class={`${IMAGE}  ${local.class ?? ''}`} />
}

function Fallback(props: ComponentProps<typeof Ark.Fallback>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Fallback {...rest} class={`${FALLBACK}  ${local.class ?? ''}`} />
}

export const Avatar = Object.assign({}, Ark, {Root, Image, Fallback})
