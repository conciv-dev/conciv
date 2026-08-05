import type {z} from 'zod'
import type {PageErrorCode} from '@conciv/protocol/page-types'

export type PageVerbDispatchResult = {ok: true; value: unknown} | {ok: false; message: string}

export type PageVerbDef<Schema extends z.ZodType, Result> = {
  args: Schema
  handler: (args: z.output<Schema>) => Result | Promise<Result>
  dispatch: (raw: unknown) => Promise<PageVerbDispatchResult>
}

export type AnyPageVerbDef = {
  args: z.ZodType
  handler: (args: never) => unknown
  dispatch: (raw: unknown) => Promise<PageVerbDispatchResult>
}
export type PageVerbMap = Record<string, AnyPageVerbDef>

export function pageVerb<Schema extends z.ZodType, Result>(
  args: Schema,
  handler: (args: z.output<Schema>) => Result | Promise<Result>,
): PageVerbDef<Schema, Result> {
  return {
    args,
    handler,
    dispatch: async (raw) => {
      const parsed = args.safeParse(raw)
      if (!parsed.success) return {ok: false, message: parsed.error.message}
      return {ok: true, value: await handler(parsed.data)}
    },
  }
}

export function definePageVerbs<M extends PageVerbMap>(verbs: M): M {
  return verbs
}

export type PageCaller<M extends PageVerbMap> = {
  call<K extends keyof M & string>(verb: K, args: z.input<M[K]['args']>): Promise<Awaited<ReturnType<M[K]['handler']>>>
}

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

export function noWidgetPageCaller<M extends PageVerbMap = PageVerbMap>(extension: string): PageCaller<M> {
  return {
    call<K extends keyof M & string>(verb: K): Promise<Awaited<ReturnType<M[K]['handler']>>> {
      return Promise.reject(pageVerbError('no-widget', extension, verb, `${extension}.${verb}: no widget attached`))
    },
  }
}
