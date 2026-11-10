import {For, splitProps, type JSX} from 'solid-js'
import {Checkbox as Ark} from '@ark-ui/solid/checkbox'
import {Checkbox} from './checkbox.js'

const ROOT = 'flex flex-wrap gap-x-6 gap-y-0.5 min-w-0'

type CheckboxGroupProps = {
  options: {value: string; label: string; disabled?: boolean}[]
  value: string[]
  onValueChange?: (value: string[]) => void
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  class?: string
}

export function CheckboxGroup(props: CheckboxGroupProps): JSX.Element {
  const [local] = splitProps(props, ['options', 'value', 'onValueChange', 'disabled', 'readOnly', 'invalid', 'class'])
  return (
    <Ark.Group
      class={`${ROOT}  ${local.class ?? ''}`}
      value={() => local.value}
      onValueChange={(value) => local.onValueChange?.(value)}
      disabled={local.disabled}
      readOnly={local.readOnly}
      invalid={local.invalid}
    >
      <For each={local.options}>
        {(option) => <Checkbox label={option.label} value={option.value} disabled={option.disabled} />}
      </For>
    </Ark.Group>
  )
}
