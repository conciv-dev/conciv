import {createCssVariablesTheme} from 'shiki/core'
import {registerCustomTheme} from '@conciv/solid-diffs'

export const CODE_THEME_NAME = 'conciv-code'

const VARIABLE_PREFIX = '--shiki-'

const VARIABLE_DEFAULTS: Record<string, string> = {
  foreground: '#b9b2b0',
  background: '#121115',
  'ansi-black': '#4a4548',
  'ansi-green': '#6fbf8b',
  'ansi-red': '#d98070',
  'ansi-blue': '#c9a86a',
  'ansi-yellow': '#c9a86a',
  'ansi-magenta': '#c9857f',
  'ansi-cyan': '#8fb4b0',
  'ansi-white': '#ded8d4',
  'ansi-bright-black': '#6b666b',
  'ansi-bright-green': '#8fd6a6',
  'ansi-bright-red': '#e59a8c',
  'ansi-bright-blue': '#d8bd8a',
  'ansi-bright-yellow': '#d8bd8a',
  'ansi-bright-magenta': '#d89d97',
  'ansi-bright-cyan': '#a8ccc8',
  'ansi-bright-white': '#f0ebe8',
}

export function concivCodeTheme(): ReturnType<typeof createCssVariablesTheme> {
  return createCssVariablesTheme({
    name: CODE_THEME_NAME,
    variablePrefix: VARIABLE_PREFIX,
    variableDefaults: VARIABLE_DEFAULTS,
    fontStyle: true,
  })
}

const registration = {done: false}

function ensureRegistered(): void {
  if (registration.done) return
  registration.done = true
  registerCustomTheme(CODE_THEME_NAME, () => Promise.resolve(concivCodeTheme()))
}

export function codeTheme(): {light: string; dark: string} {
  ensureRegistered()
  return {light: CODE_THEME_NAME, dark: CODE_THEME_NAME}
}
