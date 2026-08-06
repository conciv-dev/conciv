import type {ClientToolCtx, ClientToolEntry, ClientToolLocator} from '@conciv/extension'
import type {PageQuery, PageResult} from '@conciv/protocol/page-types'
import {addRef, type Refs} from './page-snapshot.js'
import type {ConsoleEntry} from './console-buffer.js'
import {elementByName} from './react-bridge.js'
import {mirrorPageAction} from './page-mirror.js'
import {badArgs, fail, unknownVerb} from './page-failure.js'
import {isJsonSerializable, rethrow} from './page-tool-outcome.js'

export type PageToolDispatch = (query: PageQuery) => Promise<PageResult>

function locatorTarget(locator: ClientToolLocator, refs: Refs): Element | null {
  if (locator.ref !== undefined) return refs.map.get(locator.ref)?.deref() ?? null
  if (locator.selector !== undefined) return document.querySelector(locator.selector)
  if (locator.name !== undefined) return elementByName(locator.name)
  return null
}

function missingTarget(locator: ClientToolLocator): never {
  if (locator.ref !== undefined) badArgs(`stale ref ${locator.ref}; re-run page snapshot`)
  if (locator.name !== undefined) badArgs(`no React component named "${locator.name}" found`)
  if (locator.selector !== undefined) badArgs(`no element for selector ${locator.selector}`)
  badArgs('no target: pass ref, selector, or name')
}

function callCtx(tool: ClientToolEntry, refs: Refs, consoleBuf: ConsoleEntry[]): ClientToolCtx {
  const resolve = (locator: ClientToolLocator): Element | null => locatorTarget(locator, refs)
  return {
    document,
    resolve,
    target: (locator) => {
      const el = resolve(locator)
      if (!el) missingTarget(locator)
      if (tool.mirrors) mirrorPageAction(el)
      return el
    },
    addRef: (el) => addRef(el, refs),
    resetRefs: () => {
      refs.map.clear()
      refs.n = 0
    },
    consoleEntries: (since) => consoleBuf.filter((entry) => entry.ts >= (since ?? 0)),
  }
}

function plainRecordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  return Object.fromEntries(Object.entries(value))
}

export function makePageToolDispatcher(
  tools: readonly ClientToolEntry[],
  refs: Refs,
  consoleBuf: ConsoleEntry[],
): PageToolDispatch {
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const))
  return async (query) => {
    const tool = byName.get(query.name)
    if (!tool) unknownVerb(`no mounted extension declares a client tool named "${query.name}"`)
    try {
      const result = await tool.execute(query.input, callCtx(tool, refs, consoleBuf))
      const record = plainRecordOf(result)
      if (!record || !isJsonSerializable(record)) fail(`${query.name} returned a non-serializable result`)
      return record
    } catch (error) {
      rethrow(error)
    }
  }
}
