import {splitProps, type ComponentProps} from 'solid-js'
import {Editable as Ark} from '@ark-ui/solid/editable'

const AREA = 'flex items-center min-w-0'
const INPUT =
  'min-w-0 w-full bg-chat-fill [border:none] p-0 [font:inherit] [letter-spacing:inherit] [color:inherit] [line-height:inherit] rounded-t-chat-surface-sm outline-none [box-shadow:inset_0_-0.125rem_0_var(--chat-line)] focus-visible:[box-shadow:inset_0_-0.125rem_0_var(--chat-accent)]'

function Area(props: ComponentProps<typeof Ark.Area>) {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Area {...rest} class={`${AREA}  ${local.class ?? ''}`} />
}

function Input(props: Omit<ComponentProps<typeof Ark.Input>, 'onKeyDown'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <Ark.Input
      {...rest}
      class={`${INPUT}  ${local.class ?? ''}`}
      onKeyDown={(event) => event.key === 'Escape' && event.stopPropagation()}
    />
  )
}

export const Editable = Object.assign({}, Ark, {Area, Input})
