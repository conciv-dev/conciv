import {err, type PageQuery, type PageQueryKind, type PageResult} from '@mandarax/protocol/page-types'
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

// The execution backend behind the page-bus. Owns the console buffer + ref registry and
// dispatches each query to a handler. Swap this whole object to change the backend; pass
// `handlers` overrides to swap a single verb.
export type PageDriver = {execute: (query: PageQuery) => Promise<PageResult>}

export function makeDomPageDriver(deps: {handlers?: Partial<Record<PageQueryKind, PageHandler>>} = {}): PageDriver {
  const refs: Refs = {map: new Map(), n: 0}
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
    if (needsEl && !el) {
      if (query.ref) return err(`stale ref ${query.ref} — re-run page snapshot`)
      if (query.name) return err(`no React component named "${query.name}" found`)
      if (query.selector) return err(`no element for selector ${query.selector}`)
      return err('no target — pass --ref, --selector, or --name')
    }
    // Mirror visual verbs on the real element before the handler runs (fire-and-forget, no latency).
    if (el && mirrorsKind(query.kind)) mirrorPageAction(el)
    try {
      return await handler({query, el, refs, consoleBuf})
    } catch (e) {
      return err(String(e))
    }
  }

  return {execute}
}
