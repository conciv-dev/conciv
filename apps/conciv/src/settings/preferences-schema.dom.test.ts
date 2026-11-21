import {describe, expect, it, test} from 'vitest'
import {DEFAULT_SKIN_NAME, SKIN_NAMES} from '@conciv/ui-kit-system'
import {PreferencesSchema} from './preferences-schema.js'

const DEFAULTS = {
  colorScheme: 'page',
  skin: DEFAULT_SKIN_NAME,
  launcher: 'mascot',
  openOnLoad: false,
  closeOnOutsideClick: false,
  commandShortcuts: {},
}

const CHOSEN = {
  colorScheme: 'dark',
  skin: 'terminal',
  launcher: 'hidden',
  openOnLoad: true,
  closeOnOutsideClick: true,
  commandShortcuts: {togglePanel: ['Mod+K']},
}

describe('the settings screen reads a stored preference', () => {
  test('a project with nothing stored shows every default', () => {
    expect(PreferencesSchema.parse({})).toEqual(DEFAULTS)
  })

  it.each<[string, unknown]>([
    ['colorScheme', 'light'],
    ['colorScheme', 'dark'],
    ...SKIN_NAMES.filter((skin) => skin !== DEFAULT_SKIN_NAME).map((skin): [string, unknown] => ['skin', skin]),
    ['launcher', 'native'],
    ['launcher', 'hidden'],
    ['openOnLoad', true],
    ['closeOnOutsideClick', true],
    ['commandShortcuts', {togglePanel: ['Mod+K'], quickTerminal: [], quickNewPane: ['Mod+D', 'Alt+D']}],
  ])('a stored %s of %j is kept', (key, value) => {
    expect(PreferencesSchema.parse({[key]: value})).toEqual({...DEFAULTS, [key]: value})
  })

  it.each([
    ['colorScheme', 'sepia', 'page'],
    ['colorScheme', null, 'page'],
    ['skin', 'neon', DEFAULT_SKIN_NAME],
    ['skin', 'toString', DEFAULT_SKIN_NAME],
    ['skin', 'constructor', DEFAULT_SKIN_NAME],
    ['skin', 7, DEFAULT_SKIN_NAME],
    ['launcher', 'floating', 'mascot'],
    ['launcher', false, 'mascot'],
    ['openOnLoad', 'yes', false],
    ['closeOnOutsideClick', 1, false],
    ['commandShortcuts', {togglePanel: 'Mod+K'}, {}],
    ['commandShortcuts', {openEverything: ['Mod+E']}, {}],
    ['commandShortcuts', ['Mod+K'], {}],
  ])('a broken stored %s of %j falls back to %j and keeps the other choices', (key, broken, fallback) => {
    expect(PreferencesSchema.parse({...CHOSEN, [key]: broken})).toEqual({...CHOSEN, [key]: fallback})
  })

  test('a preference the settings screen does not know is dropped and the known ones are kept', () => {
    expect(PreferencesSchema.parse({...CHOSEN, fontSize: 18, theme: 'retro'})).toEqual(CHOSEN)
  })
})
