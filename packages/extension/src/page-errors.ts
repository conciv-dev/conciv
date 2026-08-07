import type {PageErrorCode} from '@conciv/protocol/page-types'

export type PageVerbError = Error & {
  readonly isPageVerbError: true
  code: PageErrorCode
  extension: string
  verb: string
}

export function pageVerbError(code: PageErrorCode, extension: string, verb: string, message: string): PageVerbError {
  return Object.assign(new Error(message), {isPageVerbError: true as const, code, extension, verb})
}

export function isPageVerbError(value: unknown): value is PageVerbError {
  return value instanceof Error && 'isPageVerbError' in value && value.isPageVerbError === true
}
