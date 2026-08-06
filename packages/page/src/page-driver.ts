import {
  isPageFailure,
  PageErrorSchema,
  type PageError,
  type PageOutcome,
  type PageQuery,
  type PageQueryKind,
  type PageResult,
  type PageWireQuery,
} from '@conciv/protocol/page-types'
import type {ClientToolEntry} from '@conciv/extension'
import {DOM_HANDLERS, ELEMENT_KINDS, resolveTarget, startConsoleBuffer, type PageHandler} from './page-handlers.js'
import type {Refs} from './page-snapshot.js'
import {mirrorPageAction, mirrorsKind} from './page-mirror.js'
import {makePageToolDispatcher} from './page-tool-dispatcher.js'
import {badArgs, unknownVerb} from './page-failure.js'

export type PageDriver = {execute: (query: PageWireQuery) => Promise<PageOutcome>; refs: Refs; dispose: () => void}

function missingTarget(query: PageQuery): never {
  if (query.ref) badArgs(`stale ref ${query.ref}; re-run page snapshot`)
  if (query.name) badArgs(`no React component named "${query.name}" found`)
  if (query.selector) badArgs(`no element for selector ${query.selector}`)
  badArgs('no target: pass --ref, --selector, or --name')
}

function pageErrorOf(error: unknown): PageError {
  if (!isPageFailure(error)) {
    return {code: 'handler-error', message: error instanceof Error ? error.message : String(error)}
  }
  const reported = PageErrorSchema.safeParse(error.error)
  if (reported.success) return reported.data
  return {code: 'handler-error', message: error.error.message}
}

export function makeDomPageDriver(
  deps: {handlers?: Partial<Record<PageQueryKind, PageHandler>>; refs?: Refs; tools?: readonly ClientToolEntry[]} = {},
): PageDriver {
  const refs: Refs = deps.refs ?? {map: new Map(), n: 0}
  const {buf: consoleBuf, dispose} = startConsoleBuffer()
  const dispatchTool = makePageToolDispatcher(deps.tools ?? [], refs)
  const handlers: Record<PageQueryKind, PageHandler> = {
    ...DOM_HANDLERS,
    ...deps.handlers,
  }

  async function run(query: PageWireQuery): Promise<PageResult> {
    if (query.kind === 'tool') return dispatchTool(query)
    const handler = handlers[query.kind]
    if (!handler) unknownVerb(`unknown page action ${query.kind}`)
    const needsEl = ELEMENT_KINDS.has(query.kind)
    const el = needsEl ? resolveTarget(query, refs) : null
    if (needsEl && !el) missingTarget(query)
    if (el && mirrorsKind(query.kind)) mirrorPageAction(el)
    return handler({query, el, refs, consoleBuf})
  }

  async function execute(query: PageWireQuery): Promise<PageOutcome> {
    try {
      return {ok: true, result: await run(query)}
    } catch (error) {
      return {ok: false, error: pageErrorOf(error)}
    }
  }

  return {execute, refs, dispose}
}
