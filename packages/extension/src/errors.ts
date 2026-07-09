import {isConcivError, makeError, type ConcivError, type UserDetails} from '@conciv/errors'

export type ExtensionErrorCode = 'missing-host'

export type ExtensionError = ConcivError

export function extensionError(code: ExtensionErrorCode, message: string, details: UserDetails = {}): ExtensionError {
  return makeError({message, code, userCode: `extension.${code}`, details})
}

export function isExtensionError(error: unknown): error is ExtensionError {
  return isConcivError(error) && error.userCode.startsWith('extension.')
}
