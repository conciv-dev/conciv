import {pageFailure, type PageRaisedError} from '@conciv/protocol/page-types'

export function fail(message: string): never {
  throw pageFailure('handler-error', message)
}

export function badArgs(message: string): never {
  throw pageFailure('invalid-args', message)
}

export function unknownVerb(message: string): never {
  throw pageFailure('unknown-verb', message)
}

export function failRaised(raised: PageRaisedError): never {
  throw pageFailure('handler-error', raised.message, raised)
}
