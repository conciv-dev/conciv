import type {z} from 'zod'

export type PageVerbDef<Schema extends z.ZodType, Result> = {
  args: Schema
  handler: (args: z.output<Schema>) => Result | Promise<Result>
}

export type AnyPageVerbDef = {args: z.ZodType; handler: (args: never) => unknown}
export type PageVerbMap = Record<string, AnyPageVerbDef>

export function pageVerb<Schema extends z.ZodType, Result>(
  args: Schema,
  handler: (args: z.output<Schema>) => Result | Promise<Result>,
): PageVerbDef<Schema, Result> {
  return {args, handler}
}

export function definePageVerbs<M extends PageVerbMap>(verbs: M): M {
  return verbs
}

export type PageCaller<M extends PageVerbMap> = {
  call<K extends keyof M & string>(verb: K, args: z.input<M[K]['args']>): Promise<Awaited<ReturnType<M[K]['handler']>>>
}

export const PAGE_VERB_ERROR_CODES = ['no-widget', 'unknown-verb', 'invalid-args', 'handler-error', 'timeout'] as const

export type PageVerbErrorCode = (typeof PAGE_VERB_ERROR_CODES)[number]

export function isPageVerbErrorCode(code: string): code is PageVerbErrorCode {
  return PAGE_VERB_ERROR_CODES.some((known) => known === code)
}

export type PageVerbError = Error & {
  readonly isPageVerbError: true
  code: PageVerbErrorCode
  extension: string
  verb: string
}

export function pageVerbError(
  code: PageVerbErrorCode,
  extension: string,
  verb: string,
  message: string,
): PageVerbError {
  return Object.assign(new Error(message), {isPageVerbError: true as const, code, extension, verb})
}

export function isPageVerbError(value: unknown): value is PageVerbError {
  return value instanceof Error && 'isPageVerbError' in value && value.isPageVerbError === true
}

export function noWidgetPageCaller<M extends PageVerbMap = PageVerbMap>(extension: string): PageCaller<M> {
  return {
    call<K extends keyof M & string>(verb: K): Promise<Awaited<ReturnType<M[K]['handler']>>> {
      return Promise.reject(pageVerbError('no-widget', extension, verb, `${extension}.${verb}: no widget attached`))
    },
  }
}
