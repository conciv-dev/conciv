import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {SKIN_NAMES, skinDefinition} from '@conciv/ui-kit-system'
import {useHostTheme} from '../app/context.js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {PREFERENCE_DEFAULTS} from '../settings/preferences-schema.js'
import {SettingsSection} from '../settings/settings-section.js'

const COLOR_SCHEMES = [
  {value: 'page', label: 'Follow page'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
]

export const Route = createFileRoute('/panel/$sessionId_/settings/appearance')({component: AppearanceSettings})

function AppearanceSettings(): JSX.Element {
  const theme = useHostTheme()
  const skins = SKIN_NAMES.map((name) => ({value: name, label: skinDefinition(name).label}))
  return (
    <PreferencesForm label="Appearance">
      {(form) => (
        <SettingsSection title="Appearance">
          <form.AppField name="colorScheme">
            {(field) => (
              <field.ChoiceField
                label="Color scheme"
                description="Follow page matches the page conciv runs on, then your system."
                options={COLOR_SCHEMES}
                fallback={PREFERENCE_DEFAULTS.colorScheme}
              />
            )}
          </form.AppField>
          <form.AppField name="skin">
            {(field) => (
              <field.ChoiceField
                label="Skin"
                description="Shapes, type and accent of the panel."
                options={skins}
                fallback={PREFERENCE_DEFAULTS.skin}
                lock={theme().skinFromPage ? 'Set by the page with the --conciv-skin CSS property.' : undefined}
              />
            )}
          </form.AppField>
        </SettingsSection>
      )}
    </PreferencesForm>
  )
}
