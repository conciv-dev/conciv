import {err, type PageQuery, type PageQueryKind, type PageResult} from '@conciv/protocol/page-types'
import {
  DOM_HANDLERS,
  ELEMENT_KINDS,
  resolveTarget,
  startConsoleBuffer,
  type ConsoleEntry,
  type PageHandler,
} from './page-handlers.js'
import type {Refs} from './page-snapshot.js'
import {mirrorPageAction, mirrorsKind} from './page-mirror.js'

export type PageDriver = {execute: (query: PageQuery) => Promise<PageResult>; refs: Refs}

function missingTargetError(query: PageQuery): PageResult {
  if (query.ref) return err(`stale ref ${query.ref} — re-run page snapshot`)
  if (query.name) return err(`no React component named "${query.name}" found`)
  if (query.selector) return err(`no element for selector ${query.selector}`)
  return err('no target — pass --ref, --selector, or --name')
}

export function makeDomPageDriver(
  deps: {handlers?: Partial<Record<PageQueryKind, PageHandler>>; refs?: Refs} = {},
): PageDriver {
  const refs: Refs = deps.refs ?? {map: new Map(), n: 0}
  const consoleBuf: ConsoleEntry[] = startConsoleBuffer()
  const handlers: Record<PageQueryKind, PageHandler> = {
    ...DOM_HANDLERS,
    ...deps.handlers,
  }

  async function execute(query: PageQuery): Promise<PageResult> {
    const handler = handlers[query.kind]
    if (!handler) return err(`unknown page action ${query.kind}`)
    const needsEl = ELEMENT_KINDS.has(query.kind)
    const el = needsEl ? resolveTarget(query, refs) : null
    if (needsEl && !el) return missingTargetError(query)
    if (el && mirrorsKind(query.kind)) mirrorPageAction(el)
    try {
      return await handler({query, el, refs, consoleBuf})
    } catch (e) {
      return err(String(e))
    }
  }

  return {execute, refs}
}
