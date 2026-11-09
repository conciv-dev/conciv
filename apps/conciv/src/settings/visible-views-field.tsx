import {splitProps, type JSX} from 'solid-js'
import {difference} from 'es-toolkit'
import {CheckboxGroup} from '@conciv/ui-kit-system'
import {useFieldContext} from './form-context.js'
import {SettingField} from './setting-field.js'

type VisibleViewsFieldProps = {
  label: string
  description?: string
  views: readonly {id: string; label: string}[]
}

export function VisibleViewsField(props: VisibleViewsFieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'description', 'views'])
  const field = useFieldContext<string[]>()
  const ids = () => local.views.map((view) => view.id)
  const unknownHidden = () => difference(field().state.value, ids())
  return (
    <SettingField
      label={local.label}
      description={local.description}
      group
      changed={field().state.value.length > 0}
      onReset={() => field().handleChange([])}
    >
      <div onFocusOut={() => field().handleBlur()}>
        <CheckboxGroup
          class="flex-col"
          options={local.views.map((view) => ({value: view.id, label: view.label}))}
          value={difference(ids(), field().state.value)}
          onValueChange={(shown) => field().handleChange([...unknownHidden(), ...difference(ids(), shown)])}
        />
      </div>
    </SettingField>
  )
}
