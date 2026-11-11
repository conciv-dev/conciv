import {createComputed, on, type Accessor, type JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import type {AnyFieldApi} from '@tanstack/solid-form'
import {getRouteApi} from '@tanstack/solid-router'
import type {SettingsScope} from '@conciv/contract'
import {useAnnounce, usePreferences} from '../app/context.js'
import {useAppForm} from './app-form.js'
import {SettingsLoad} from './settings-ui.js'
import {SettingNote} from './setting-note.js'
import {PreferenceKeySchema, type Preferences} from './preferences-schema.js'

const FORM = 'flex flex-col gap-3.5'

const settingsRoute = getRouteApi('/panel/$sessionId_/settings')

type PreferencesFormProps = {
  label: string
  children: (form: PreferencesFormApi) => JSX.Element
}

export function PreferencesForm(props: PreferencesFormProps): JSX.Element {
  const preferences = usePreferences()
  return (
    <SettingsLoad status={preferences.status()} retry={preferences.retry}>
      <ScopedPreferencesForm label={props.label}>{props.children}</ScopedPreferencesForm>
    </SettingsLoad>
  )
}

function ScopedPreferencesForm(props: PreferencesFormProps): JSX.Element {
  const preferences = usePreferences()
  const search = settingsRoute.useSearch()
  const scope = () => search().scope
  const form = createPreferencesForm(scope)
  return (
    <SettingNote.Provider value={(key) => preferences.note(scope(), key)}>
      <form class={FORM} aria-label={props.label} onSubmit={(event) => event.preventDefault()}>
        {props.children(form)}
      </form>
    </SettingNote.Provider>
  )
}

type PreferencesFormApi = ReturnType<typeof createPreferencesForm>

function createPreferencesForm(scope: Accessor<SettingsScope>) {
  const preferences = usePreferences()
  const announce = useAnnounce()
  const save = useMutation(() => ({
    mutationFn: (change: {scope: SettingsScope; key: keyof Preferences; value: unknown}) =>
      preferences.write(change.scope, change.key, change.value),
  }))
  const persist = (field: AnyFieldApi): void => {
    const key = PreferenceKeySchema.safeParse(field.name)
    if (!key.success) return
    save.mutateAsync({scope: scope(), key: key.data, value: field.state.value}).then(
      () => field.setErrorMap({onChange: undefined}),
      () => {
        field.setErrorMap({onChange: 'Could not save this setting. Change it again to retry.'})
        announce('Could not save the setting', true)
      },
    )
  }
  const form = useAppForm(() => ({
    defaultValues: preferences.shown(scope()),
    listeners: {onChange: ({fieldApi}) => persist(fieldApi)},
  }))
  createComputed(on(scope, (current) => form.reset(preferences.shown(current)), {defer: true}))
  return form
}
