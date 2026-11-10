import type {JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import type {AnyFieldApi} from '@tanstack/solid-form'
import {useAnnounce, usePreferences} from '../app/context.js'
import {useAppForm} from './app-form.js'
import {SettingsLoad} from './settings-ui.js'
import {PreferenceKeySchema, type Preferences} from './preferences-schema.js'

const FORM = 'flex flex-col gap-3.5'

type PreferencesFormProps = {
  label: string
  children: (form: PreferencesFormApi) => JSX.Element
}

export function PreferencesForm(props: PreferencesFormProps): JSX.Element {
  const preferences = usePreferences()
  return (
    <SettingsLoad status={preferences.status()} retry={preferences.retry}>
      <LoadedForm label={props.label}>{props.children}</LoadedForm>
    </SettingsLoad>
  )
}

type PreferencesFormApi = ReturnType<typeof createPreferencesForm>

function LoadedForm(props: PreferencesFormProps): JSX.Element {
  const form = createPreferencesForm()
  return (
    <form class={FORM} aria-label={props.label} onSubmit={(event) => event.preventDefault()}>
      {props.children(form)}
    </form>
  )
}

function createPreferencesForm() {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const save = useMutation(() => ({
    mutationFn: (change: {key: keyof Preferences; value: unknown}) => preferences.write(change.key, change.value),
  }))
  const persist = (field: AnyFieldApi): void => {
    const key = PreferenceKeySchema.safeParse(field.name)
    if (!key.success) return
    save.mutateAsync({key: key.data, value: field.state.value}).then(
      () => field.setErrorMap({onChange: undefined}),
      () => {
        field.setErrorMap({onChange: 'Could not save this setting. Change it again to retry.'})
        announce('Could not save the setting', true)
      },
    )
  }
  return useAppForm(() => ({
    defaultValues: preferences.stored(),
    listeners: {onChange: ({fieldApi}) => persist(fieldApi)},
  }))
}
