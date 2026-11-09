import {splitProps, type JSX} from 'solid-js'
import {omit} from 'es-toolkit'
import {HotkeyRecorder} from '@conciv/ui-kit-system'
import {useFieldContext} from './form-context.js'
import {SHORTCUT_DEFAULTS, type Preferences, type ShortcutCommand} from './preferences-schema.js'
import {SettingField} from './setting-field.js'

type HotkeyFieldProps = {
  label: string
  description?: string
  command: ShortcutCommand
  lock?: string
  locked?: string[]
  conflict: (hotkey: string) => string | undefined
}

export function HotkeyField(props: HotkeyFieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'description', 'command', 'lock', 'locked', 'conflict'])
  const field = useFieldContext<Preferences['commandShortcuts']>()
  const overrides = () => field().state.value
  const bindings = () => local.locked ?? overrides()[local.command] ?? SHORTCUT_DEFAULTS[local.command]
  return (
    <SettingField
      label={local.label}
      description={local.description}
      lock={local.lock}
      layout="row"
      changed={Object.hasOwn(overrides(), local.command)}
      onReset={() => field().handleChange(omit(overrides(), [local.command]))}
    >
      <HotkeyRecorder
        value={bindings().at(0) ?? null}
        readOnly={Boolean(local.lock)}
        conflict={local.conflict}
        onValueChange={(hotkey) =>
          field().handleChange({...overrides(), [local.command]: hotkey === null ? [] : [hotkey]})
        }
      />
    </SettingField>
  )
}
