import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {Group} from '../settings/settings-ui.js'
import {ShortcutsList, type ShortcutEntry} from '../settings/shortcuts-list.js'

const COMMANDS: ShortcutEntry[] = [
  {command: 'togglePanel', label: 'Open or close conciv'},
  {command: 'quickTerminal', label: 'Quick terminal'},
  {command: 'quickNewPane', label: 'New quick terminal pane'},
]

export const Route = createFileRoute('/panel/$sessionId_/settings/shortcuts')({component: ShortcutsSettings})

function ShortcutsSettings(): JSX.Element {
  return (
    <PreferencesForm label="Shortcuts">
      {(form) => (
        <Group title="Keyboard shortcuts" description="Click a command to record new keys">
          <form.AppField name="commandShortcuts">
            {(field) => <ShortcutsList entries={COMMANDS} all={COMMANDS} field={field()} />}
          </form.AppField>
        </Group>
      )}
    </PreferencesForm>
  )
}
