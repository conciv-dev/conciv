import {splitProps, type ComponentProps} from 'solid-js'
import {Collapsible as Ark} from '@ark-ui/solid/collapsible'

const CONTENT =
  'grid grid-rows-[1fr] data-[state=open]:anim-collapse-open data-[state=closed]:anim-collapse-closed data-[state=closed]:invisible data-[state=closed]:[transition:visibility_0s_linear_200ms]'

function Root(props: ComponentProps<typeof Ark.Root>) {
  return <Ark.Root lazyMount {...props} />
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <Ark.Content {...rest} class={`${CONTENT}  ${local.class ?? ''}`}>
      <div class="min-h-0 overflow-hidden">{local.children}</div>
    </Ark.Content>
  )
}

export const Collapsible = Object.assign({}, Ark, {Root, Content})
