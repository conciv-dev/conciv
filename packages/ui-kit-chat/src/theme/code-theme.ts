import {registerCustomTheme} from '@conciv/solid-diffs'
import {CODE_THEME_NAME, concivCodeTheme} from './code-theme-tokens.js'

export {CODE_THEME_NAME, concivCodeTheme}

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
