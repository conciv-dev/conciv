import {pageFailure} from '@conciv/protocol/page-types'

export function fail(message: string): never {
  throw pageFailure('handler-error', message)
}

export function badArgs(message: string): never {
  throw pageFailure('invalid-args', message)
}
