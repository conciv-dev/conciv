import {Match, Switch, type JSX} from 'solid-js'
import {useMutation} from '@tanstack/solid-query'
import {createFormHook, type AnyFieldApi} from '@tanstack/solid-form'
import {Button, Loader} from '@conciv/ui-kit-system'
import {useAnnounce, usePreferences} from '../app/context.js'
import {fieldContext, formContext} from './form-context.js'
import {SegmentField, SelectField, SkinField, SwitchField} from './setting-fields.js'
import {PreferenceKeySchema, type Preferences} from './preferences-schema.js'

const FORM = 'flex flex-col gap-3.5'
const FAILED = 'flex flex-col items-start gap-2 text-[0.8125rem] text-chat-text-2'

const {useAppForm} = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {SegmentField, SelectField, SkinField, SwitchField},
  formComponents: {},
})

type PreferencesFormProps = {
  label: string
  children: (form: PreferencesFormApi) => JSX.Element
}

export function PreferencesForm(props: PreferencesFormProps): JSX.Element {
  const preferences = usePreferences()
  return (
    <Switch>
      <Match when={preferences.status() === 'success'}>
        <LoadedForm label={props.label}>{props.children}</LoadedForm>
      </Match>
      <Match when={preferences.status() === 'error'}>
        <div class={FAILED} role="alert">
          <p class="m-0">Your conciv settings could not be loaded.</p>
          <Button variant="outline" size="sm" class="min-h-7" onClick={preferences.retry}>
            Retry
          </Button>
        </div>
      </Match>
      <Match when={preferences.status() === 'pending'}>
        <Loader.Root class="py-6 text-chat-text-2" translations={{value: () => 'Loading settings'}}>
          <Loader.Indicator />
          <Loader.Text>
            <Loader.Label>Loading settings…</Loader.Label>
          </Loader.Text>
        </Loader.Root>
      </Match>
    </Switch>
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
