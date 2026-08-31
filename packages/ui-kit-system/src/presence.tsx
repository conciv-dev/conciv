import {splitProps, type ComponentProps} from 'solid-js'
import {Presence as Ark} from '@ark-ui/solid/presence'

const PRESENCE = 'data-[state=open]:anim-presence-in data-[state=closed]:anim-presence-out'

export function Presence(props: ComponentProps<typeof Ark> & {motion?: string}) {
  const [local, rest] = splitProps(props, ['class', 'motion'])
  return <Ark {...rest} class={`${local.motion ?? PRESENCE}  ${local.class ?? ''}`} />
}
