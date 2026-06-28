import {splitProps, type ComponentProps} from 'solid-js'
import {Presence as Ark} from '@ark-ui/solid/presence'

// Mount/unmount animation primitive: keeps the node mounted through its exit keyframe (Ark waits for
// animationend), driven by data-state. Default scale+fade; pass unmountOnExit to drop it after exit.
const PRESENCE = 'data-[state=open]:anim-presence-in data-[state=closed]:anim-presence-out'

export function Presence(props: ComponentProps<typeof Ark>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark {...rest} class={`${PRESENCE}  ${local.class ?? ''}`} />
}
