import type {BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import type {AppError} from '@conciv/protocol/framework-types'

export type DiagnosticsRing = {
  push: (error: AppError) => void
  list: () => AppError[]
}

type BuildErrorDiagnostic = Extract<BundlerDiagnostic, {kind: 'build-error'}>

const DEFAULT_CAPACITY = 50

export function buildErrorToAppError(diagnostic: BuildErrorDiagnostic): AppError {
  const line = diagnostic.loc?.line ?? 0
  const column = diagnostic.loc?.column ?? 0
  const source = diagnostic.file ? {file: diagnostic.file, line, column} : null
  return {
    id: `build:${diagnostic.file ?? 'unknown'}:${line}:${column}:${diagnostic.timestamp}`,
    kind: 'build',
    message: diagnostic.message,
    stack: null,
    source,
    digest: null,
    at: diagnostic.timestamp,
  }
}

export function makeDiagnosticsRing(capacity = DEFAULT_CAPACITY): DiagnosticsRing {
  let stored: AppError[] = []
  return {
    push(error) {
      stored = [...stored, error].slice(-capacity)
    },
    list: () => [...stored],
  }
}
