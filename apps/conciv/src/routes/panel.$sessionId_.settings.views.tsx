import {createFileRoute} from '@tanstack/solid-router'
import {Show, createMemo, type JSX} from 'solid-js'
import {useInstances} from '../app/context.js'
import {collectViews} from '../extension/extension-views.js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {SettingsSection} from '../settings/settings-section.js'

const EMPTY = 'm-0 py-3 px-3.5 text-[0.8125rem] text-chat-text-2'

export const Route = createFileRoute('/panel/$sessionId_/settings/views')({component: ViewsSettings})

function ViewsSettings(): JSX.Element {
  const instances = useInstances()
  const views = createMemo(() => collectViews(instances).map((view) => ({id: view.id, label: view.label})))
  return (
    <PreferencesForm label="Views">
      {(form) => (
        <SettingsSection
          title="Status bar views"
          lead="The view tabs in the status bar beside Chat, and their order. Chat always stays."
        >
          <Show when={views().length > 0} fallback={<p class={EMPTY}>No extension adds a view yet.</p>}>
            <form.AppField name="docksHidden">
              {(field) => <field.VisibleViewsField label="Shown in the status bar" views={views()} />}
            </form.AppField>
            <form.AppField name="docksCustomOrder">
              {(field) => <field.ViewOrderField label="Order" views={views()} />}
            </form.AppField>
          </Show>
        </SettingsSection>
      )}
    </PreferencesForm>
  )
}
