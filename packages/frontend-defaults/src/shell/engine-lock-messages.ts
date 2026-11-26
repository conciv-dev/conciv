import type {EngineLock} from '../app/engine-login.js'

const ENGINE_REVOKED_MESSAGE = 'This browser is no longer authorized to use conciv.'
const ENGINE_LOGGED_OUT_MESSAGE = 'Log in to use conciv on this page.'

export function lockedMessage(locked: EngineLock): string | null {
  if (locked === 'revoked') return ENGINE_REVOKED_MESSAGE
  if (locked === 'logged-out') return ENGINE_LOGGED_OUT_MESSAGE
  return null
}
