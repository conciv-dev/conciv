import {For, splitProps, type JSX} from 'solid-js'
import {SegmentGroup} from '@conciv/ui-kit-system'
import {useFieldContext} from './form-context.js'
import {SettingField} from './setting-field.js'

type ChoiceFieldProps = {
  label: string
  description?: string
  options: readonly {value: string; label: string}[]
  fallback: string
  lock?: string
}

export function ChoiceField(props: ChoiceFieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'description', 'options', 'fallback', 'lock'])
  const field = useFieldContext<string>()
  return (
    <SettingField
      label={local.label}
      description={local.description}
      lock={local.lock}
      group
      changed={field().state.value !== local.fallback}
      onReset={() => field().handleChange(local.fallback)}
    >
      <SegmentGroup.Root
        name={field().name}
        value={field().state.value}
        disabled={Boolean(local.lock)}
        onValueChange={(details) => {
          if (details.value) field().handleChange(details.value)
        }}
        onFocusOut={() => field().handleBlur()}
      >
        <SegmentGroup.Indicator />
        <For each={local.options}>
          {(option) => (
            <SegmentGroup.Item value={option.value}>
              <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          )}
        </For>
      </SegmentGroup.Root>
    </SettingField>
  )
}
