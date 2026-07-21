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

export type PageVerbErrorCode = 'no-widget' | 'unknown-verb' | 'invalid-args' | 'handler-error' | 'timeout'

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
