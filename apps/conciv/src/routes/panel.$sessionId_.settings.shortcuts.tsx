import {createFileRoute} from '@tanstack/solid-router'
import {For, type JSX} from 'solid-js'
import {normalizeHotkey} from '@tanstack/solid-hotkeys'
import {usePreferences} from '../app/context.js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {SettingsSection} from '../settings/settings-section.js'
import type {ShortcutCommand} from '../settings/preferences-schema.js'

const COMMANDS: {command: ShortcutCommand; label: string; description: string}[] = [
  {
    command: 'quickTerminal',
    label: 'Open the quick terminal',
    description: 'Opens and closes it from anywhere on the page.',
  },
  {
    command: 'quickNewPane',
    label: 'Open a new quick terminal pane',
    description: 'Works while the quick terminal is open.',
  },
]

export const Route = createFileRoute('/panel/$sessionId_/settings/shortcuts')({component: ShortcutsSettings})

function ShortcutsSettings(): JSX.Element {
  const preferences = usePreferences()
  const conflict = (command: ShortcutCommand) => (hotkey: string) => {
    const wanted = normalizeHotkey(hotkey)
    const other = COMMANDS.find(
      (entry) =>
        entry.command !== command &&
        preferences.shortcut(entry.command).some((binding) => normalizeHotkey(binding) === wanted),
    )
    return other ? `Already used by ${other.label}` : undefined
  }
  return (
    <PreferencesForm label="Shortcuts">
      {(form) => (
        <SettingsSection title="Keyboard shortcuts" lead="Record a new shortcut, or clear one to turn it off.">
          <For each={COMMANDS}>
            {(entry) => (
              <form.AppField name="commandShortcuts">
                {(field) => (
                  <field.HotkeyField
                    label={entry.label}
                    description={entry.description}
                    command={entry.command}
                    lock={preferences.shortcutLock(entry.command)}
                    locked={preferences.shortcutLock(entry.command) ? preferences.shortcut(entry.command) : undefined}
                    conflict={conflict(entry.command)}
                  />
                )}
              </form.AppField>
            )}
          </For>
        </SettingsSection>
      )}
    </PreferencesForm>
  )
}
