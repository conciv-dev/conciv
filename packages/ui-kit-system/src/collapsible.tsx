import {splitProps, type ComponentProps} from 'solid-js'
import {Collapsible as Ark} from '@ark-ui/solid/collapsible'

const CONTENT = 'overflow-hidden data-[state=open]:anim-collapse-open data-[state=closed]:anim-collapse-closed'

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`} />
}

export const Collapsible = Object.assign({}, Ark, {Content})
