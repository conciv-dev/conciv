export type ConcivError<Code extends string = string> = Error & {
  name: 'ConcivError'
  scope: string
  code: Code
  userCode: string
  userMessage: string
  httpStatus: number
  details: Record<string, unknown>
}

export type ClientErrorPayload = {
  message: string
  code: string
  internal?: {scope: string; code: string; message: string; details: Record<string, unknown>}
}

export function defineErrors<Code extends string>(opts: {
  scope: string
  userMessages: Record<Code, string>
  httpStatus?: Partial<Record<Code, number>>
}): {
  error: (code: Code, message: string, details?: Record<string, unknown>) => ConcivError<Code>
  is: (error: unknown) => error is ConcivError<Code>
} {
  return {
    error: (code, message, details = {}) =>
      Object.assign(new Error(message), {
        name: 'ConcivError' as const,
        scope: opts.scope,
        code,
        userCode: `${opts.scope}.${code}`,
        userMessage: opts.userMessages[code],
        httpStatus: opts.httpStatus?.[code] ?? 500,
        details,
      }),
    is: (error): error is ConcivError<Code> => isConcivError(error) && error.scope === opts.scope,
  }
}

export function isConcivError(error: unknown): error is ConcivError {
  return error instanceof Error && error.name === 'ConcivError' && 'scope' in error && 'code' in error
}

export function clientPayload(error: ConcivError, dev: boolean): ClientErrorPayload {
  const payload: ClientErrorPayload = {message: error.userMessage, code: error.userCode}
  return dev
    ? {...payload, internal: {scope: error.scope, code: error.code, message: error.message, details: error.details}}
    : payload
}
