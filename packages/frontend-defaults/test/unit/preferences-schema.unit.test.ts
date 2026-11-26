// @vitest-environment happy-dom
import {describe, expect, it} from 'vitest'
import {DEFAULT_SKIN_NAME, SKIN_NAMES} from '@conciv/ui-kit-system'
import {PreferencesSchema} from '../../src/settings/preferences-schema.js'

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
})
