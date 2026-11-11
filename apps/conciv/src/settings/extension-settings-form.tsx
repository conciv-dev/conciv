import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {useMutation} from '@conciv/client'
import type {AnyFieldApi} from '@tanstack/solid-form'
import {isEqual} from 'es-toolkit'
import type {AnyExtension} from '@conciv/extension'
import {getHostApi} from '@conciv/extension/host'
import type {SettingsScope} from '@conciv/contract'
import {getRouteApi} from '@tanstack/solid-router'
import {useAnnounce, useAppData, useAppQueryClient, useConnected} from '../app/context.js'
import {useAppForm} from './app-form.js'
import {createSettingsLayers} from './create-settings-layers.js'
import {extensionSettingsPage, type ExtensionField} from './extension-fields.js'
import {Group, SettingsLoad} from './settings-ui.js'
import {SettingNote} from './setting-note.js'

const FORM = 'flex flex-col gap-3.5'
const EMPTY = 'm-0 py-2.5 px-3 text-[0.75rem] leading-[1.35] text-chat-text-2'

const route = getRouteApi('/panel/$sessionId_/settings/extensions/$name')

type SettingsLayers = ReturnType<typeof createSettingsLayers>

type ExtensionSettingsPage = ReturnType<typeof extensionSettingsPage>

export function ExtensionSettingsForm(): JSX.Element {
  const extension = route.useRouteContext()().settingsExtension
  const search = route.useSearch()
  const layers = createSettingsLayers({
    data: useAppData(),
    queryClient: useAppQueryClient(),
    connected: useConnected(),
    namespace: extension.name,
  })
  return (
    <SettingsLoad status={layers.status()} retry={layers.retry}>
      <Show when={search().scope} keyed>
        {(scope) => {
          const page = extensionSettingsPage(extension)
          const form = createExtensionForm({extension, layers, scope}, page.fields)
          return (
            <SettingNote.Provider value={(key) => layers.note(scope, key)}>
              {extensionFields(page, form)}
            </SettingNote.Provider>
          )
        }}
      </Show>
    </SettingsLoad>
  )
}

type ScopedForm = {extension: AnyExtension; layers: SettingsLayers; scope: SettingsScope}

type ExtensionForm = ReturnType<typeof createExtensionForm>

function extensionFields(page: ExtensionSettingsPage, form: ExtensionForm): JSX.Element {
  return (
    <form class={FORM} aria-label={page.title} onSubmit={(event) => event.preventDefault()}>
      <Group title={page.title}>
        <Show when={page.fields.length > 0} fallback={<p class={EMPTY}>None of these settings can be changed here.</p>}>
          <For each={page.fields}>
            {(item) => (
              <form.AppField name={item.key}>
                {(field) => (
                  <Switch>
                    <Match when={item.kind === 'switch'}>
                      <field.SwitchField label={item.label} hint={item.hint} />
                    </Match>
                    <Match when={item.kind === 'text'}>
                      <field.TextField label={item.label} hint={item.hint} />
                    </Match>
                    <Match when={item.kind === 'number' && item}>
                      {(number) => (
                        <field.NumberField
                          label={number().label}
                          hint={number().hint}
                          min={number().min}
                          max={number().max}
                          step={number().step}
                        />
                      )}
                    </Match>
                    <Match when={item.kind === 'segment' && item}>
                      {(choice) => (
                        <field.SegmentField label={choice().label} hint={choice().hint} options={choice().options} />
                      )}
                    </Match>
                    <Match when={item.kind === 'select' && item}>
                      {(choice) => (
                        <field.SelectField label={choice().label} hint={choice().hint} options={choice().options} />
                      )}
                    </Match>
                  </Switch>
                )}
              </form.AppField>
            )}
          </For>
        </Show>
      </Group>
    </form>
  )
}

function createExtensionForm(scoped: ScopedForm, fields: ExtensionField[]) {
  const announce = useAnnounce()
  const store = getHostApi().useScope<string>(scoped.extension.name).settings[scoped.scope]
  const save = useMutation(() => ({
    mutationFn: (change: {key: string; value: unknown}) => {
      const fallback = scoped.extension.parseSettings(scoped.layers.fallthrough(scoped.scope))[change.key]
      return isEqual(change.value, fallback) ? store.delete(change.key) : store.set(change.key, change.value)
    },
  }))
  const persist = (field: AnyFieldApi): void => {
    const schema = scoped.extension.settings?.shape[field.name]
    if (!schema) return
    const parsed = schema.safeParse(field.state.value)
    if (!parsed.success) {
      field.setErrorMap({onChange: invalidMessage(fields.find((entry) => entry.key === field.name))})
      return
    }
    save.mutateAsync({key: field.name, value: parsed.data}).then(
      () => field.setErrorMap({onChange: undefined}),
      () => {
        field.setErrorMap({onChange: 'Could not save this setting. Change it again to retry.'})
        announce('Could not save the setting', true)
      },
    )
  }
  return useAppForm(() => ({
    defaultValues: scoped.extension.parseSettings(scoped.layers.shown(scoped.scope)),
    listeners: {onChange: ({fieldApi}) => persist(fieldApi)},
  }))
}

function invalidMessage(field: ExtensionField | undefined): string {
  if (field?.kind !== 'number' || field.min === undefined || field.max === undefined)
    return 'This value is not allowed.'
  const format = new Intl.NumberFormat()
  return `Use a number from ${format.format(field.min)} to ${format.format(field.max)}.`
}
