import {describe, expect, it, test} from 'vitest'
import {DEFAULT_SKIN_NAME, SKIN_NAMES} from '@conciv/ui-kit-system'
import {PreferencesSchema} from './preferences-schema.js'

describe('the settings screen reads a stored skin and stored shortcuts', () => {
  const CHOSEN = {
    colorScheme: 'dark',
    skin: 'terminal',
    launcher: 'hidden',
    openOnLoad: true,
    closeOnOutsideClick: true,
    commandShortcuts: {togglePanel: ['Mod+K']},
  }

  it.each(SKIN_NAMES.filter((skin) => skin !== DEFAULT_SKIN_NAME))(
    'a stored skin %s that conciv ships is kept',
    (skin) => {
      expect(PreferencesSchema.parse({...CHOSEN, skin})).toEqual({...CHOSEN, skin})
    },
  )

  it.each(['neon', 'toString', 'constructor'])(
    'a stored skin %s that conciv does not ship falls back to the default skin and keeps the other choices',
    (skin) => {
      expect(PreferencesSchema.parse({...CHOSEN, skin})).toEqual({...CHOSEN, skin: DEFAULT_SKIN_NAME})
    },
  )

  test('stored shortcuts for the commands conciv has are kept', () => {
    const commandShortcuts = {togglePanel: ['Mod+K'], quickTerminal: [], quickNewPane: ['Mod+D', 'Alt+D']}
    expect(PreferencesSchema.parse({...CHOSEN, commandShortcuts})).toEqual({...CHOSEN, commandShortcuts})
  })

  it.each<unknown>([{togglePanel: 'Mod+K'}, {openEverything: ['Mod+E']}])(
    'stored shortcuts %j fall back to no custom shortcuts and keep the other choices',
    (commandShortcuts) => {
      expect(PreferencesSchema.parse({...CHOSEN, commandShortcuts})).toEqual({...CHOSEN, commandShortcuts: {}})
    },
  )
})
