import {splitProps, type JSX} from 'solid-js'
import {Checkbox as Ark} from '@ark-ui/solid/checkbox'
import Check from 'lucide-solid/icons/check'
import {nativeFocusPart} from './native-focus.js'

const ROOT =
  'inline-flex items-center gap-2 min-h-8 cursor-pointer select-none font-chat data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[readonly]:cursor-default'
const CONTROL =
  'grid place-items-center shrink-0 size-4 rounded-[0.25rem] [border:1px_solid_var(--chat-line-2)] text-chat-on-accent trans-cbb data-[state=checked]:bg-chat-accent data-[state=checked]:border-chat-accent data-[invalid]:border-chat-danger data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem]'
const INDICATOR = 'size-3 data-[state=checked]:anim-presence-in'
const LABEL = 'text-[0.8125rem] text-chat-text'

const HiddenInput = nativeFocusPart(Ark.HiddenInput, 'input')

type CheckboxProps = {
  label: string
  value?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  class?: string
}

export function Checkbox(props: CheckboxProps): JSX.Element {
  const [local, rest] = splitProps(props, ['label', 'onCheckedChange', 'class'])
  return (
    <Ark.Root
      {...rest}
      class={`${ROOT}  ${local.class ?? ''}`}
      onCheckedChange={(details) => local.onCheckedChange?.(details.checked === true)}
    >
      <Ark.Control class={CONTROL}>
        <Ark.Indicator class={INDICATOR}>
          <Check class="size-3" stroke-width={3} aria-hidden="true" />
        </Ark.Indicator>
      </Ark.Control>
      <Ark.Label class={LABEL}>{local.label}</Ark.Label>
      <HiddenInput />
    </Ark.Root>
  )
}

export const CheckboxPrimitive = Object.assign({}, Ark, {HiddenInput})
