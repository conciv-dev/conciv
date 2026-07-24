import type {AppError} from '@conciv/protocol/framework-types'

const CAPACITY = 50

let stored: AppError[] = []

function toAppError(message: string, stack: string | null): AppError {
  return {kind: 'runtime', id: crypto.randomUUID(), message, stack, source: null, digest: null, at: Date.now()}
}

function push(error: AppError): void {
  stored = [...stored, error].slice(-CAPACITY)
}

export function readRuntimeErrors(): AppError[] {
  return [...stored]
}

function messageOf(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  return fallback
}

function stackOf(value: unknown): string | null {
  if (value instanceof Error && typeof value.stack === 'string') return value.stack
  return null
}

export function installRuntimeErrorListeners(): () => void {
  const onError = (event: ErrorEvent) => push(toAppError(event.message, stackOf(event.error)))
  const onRejection = (event: PromiseRejectionEvent) =>
    push(toAppError(messageOf(event.reason, 'Unhandled promise rejection'), stackOf(event.reason)))
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
