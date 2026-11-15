import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {SKIN_NAMES} from '@conciv/ui-kit-system'
import {useHostTheme, usePreferences} from '../app/context.js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {Group} from '../settings/settings-ui.js'
import {writeLastTab} from '../settings/last-tab.js'
import {PluginSettingsSections} from '../runtime/plugin/settings-page-view.js'

const COLOR_MODES = [
  {value: 'page', label: 'Auto'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
]

const WEB_LAUNCHERS = [
  {value: 'mascot', label: 'Mascot'},
  {value: 'hidden', label: 'Hidden'},
]

export const Route = createFileRoute('/panel/$sessionId_/settings/general')({
  onEnter: () => writeLastTab('general'),
  component: GeneralSettings,
})

function GeneralSettings(): JSX.Element {
  const theme = useHostTheme()
  const preferences = usePreferences()
  const launchers = () =>
    preferences.launcher() === 'native' ? [{value: 'native', label: 'Native'}, ...WEB_LAUNCHERS] : WEB_LAUNCHERS
  return (
    <PreferencesForm label="General">
      {(form) => (
        <>
          <Group title="Appearance" description="How the panel looks in this browser">
            <form.AppField name="colorScheme">
              {(field) => (
                <field.SegmentField
                  label="Color mode"
                  hint="Auto follows the page, then your system."
                  options={COLOR_MODES}
                />
              )}
            </form.AppField>
            <form.AppField name="skin">
              {(field) => (
                <field.SkinField
                  label="Skin"
                  hint="Shapes, type and accent of the panel."
                  skins={SKIN_NAMES}
                  shown={theme().skinFromPage ? theme().skin : undefined}
                  lock={theme().skinFromPage ? 'Set by the page in --conciv-skin' : undefined}
                />
              )}
            </form.AppField>
          </Group>
          <Group title="Panel" description="How conciv opens on the page">
            <form.AppField name="launcher" defaultValue={preferences.launcher()}>
              {(field) => (
                <field.SelectField
                  label="Launcher"
                  hint="The button that opens conciv on the page."
                  options={launchers()}
                  lock={preferences.lock('launcher')}
                />
              )}
            </form.AppField>
            <form.AppField name="openOnLoad" defaultValue={preferences.openOnLoad()}>
              {(field) => <field.SwitchField label="Open on page load" lock={preferences.lock('openOnLoad')} />}
            </form.AppField>
            <form.AppField name="closeOnOutsideClick">
              {(field) => (
                <field.SwitchField label="Close on outside click" hint="Clicking the page closes the panel." />
              )}
            </form.AppField>
          </Group>
          <PluginSettingsSections page="general" section="general" />
          <PluginSettingsSections page="general" />
        </>
      )}
    </PreferencesForm>
  )
}
