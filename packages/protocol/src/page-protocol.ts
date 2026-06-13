// The single source of truth for the page-bus contract, shared by the vite-plugin (server)
// and the widget (browser). The kind union is derived from a runtime array so a contract
// test can assert the verb table + handler registry never drift from it.
export const PAGE_QUERY_KINDS = [
  'route',
  'dom',
  'query',
  'console',
  'text',
  'value',
  'attr',
  'exists',
  'snapshot',
  'wait',
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
  'setattr',
  'removeattr',
  'addclass',
  'removeclass',
  'setstyle',
  'settext',
  'sethtml',
  'remove',
  'insert',
  'css',
  'eval',
] as const

export type PageQueryKind = (typeof PAGE_QUERY_KINDS)[number]

export const MUTATING_KINDS = [
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
  'setattr',
  'removeattr',
  'addclass',
  'removeclass',
  'setstyle',
  'settext',
  'sethtml',
  'remove',
  'insert',
  'css',
  'eval',
] as const satisfies readonly PageQueryKind[]

export type PagePosition = 'before' | 'after' | 'prepend' | 'append'
export type PageWaitState = 'visible' | 'hidden'

export type PageQuery = {
  requestId: string
  kind: PageQueryKind
  selector?: string
  ref?: string
  since?: number
  value?: string
  name?: string
  class?: string
  prop?: string
  text?: string
  html?: string
  key?: string
  position?: PagePosition
  state?: PageWaitState
  timeout?: number
  code?: string
}

// A reply is always a plain JSON object: either an error or some data (often {ok:true}).
export type PageResult = Record<string, unknown>

export function ok(data: Record<string, unknown> = {}): PageResult {
  return {ok: true, ...data}
}
export function err(message: string): PageResult {
  return {error: message}
}
export function isError(result: PageResult): boolean {
  return typeof result.error === 'string'
}

const MUTATING = new Set<string>(MUTATING_KINDS)
export function isMutating(kind: string): boolean {
  return MUTATING.has(kind)
}
