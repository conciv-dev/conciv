import {splitProps, type ComponentProps} from 'solid-js'
import {Presence as Ark} from '@ark-ui/solid/presence'

const PRESENCE = 'data-[state=open]:anim-presence-in data-[state=closed]:anim-presence-out'

export function Presence(props: ComponentProps<typeof Ark>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark {...rest} class={`${PRESENCE}  ${local.class ?? ''}`} />
}
