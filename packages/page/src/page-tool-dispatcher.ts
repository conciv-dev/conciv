import type {ClientToolCtx, ClientToolEntry, ClientToolLocator} from '@conciv/extension'
import type {PageResult, PageToolQuery} from '@conciv/protocol/page-types'
import type {Refs} from './page-snapshot.js'
import {mirrorPageAction} from './page-mirror.js'
import {badArgs, fail, unknownVerb} from './page-failure.js'
import {isJsonSerializable, rethrow} from './page-tool-outcome.js'

export type PageToolDispatch = (query: PageToolQuery) => Promise<PageResult>

function locatorTarget(locator: ClientToolLocator, refs: Refs): Element | null {
  if (locator.ref !== undefined) return refs.map.get(locator.ref)?.deref() ?? null
  if (locator.selector !== undefined) return document.querySelector(locator.selector)
  return null
}

function missingTarget(locator: ClientToolLocator): never {
  if (locator.ref !== undefined) badArgs(`stale ref ${locator.ref}; re-run page snapshot`)
  if (locator.selector !== undefined) badArgs(`no element for selector ${locator.selector}`)
  badArgs('no target: pass ref or selector')
}

function callCtx(tool: ClientToolEntry, refs: Refs): ClientToolCtx {
  return {
    target: (locator) => {
      const el = locatorTarget(locator, refs)
      if (!el) missingTarget(locator)
      if (tool.mirrors) mirrorPageAction(el)
      return el
    },
  }
}

function plainRecordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  return Object.fromEntries(Object.entries(value))
}

export function makePageToolDispatcher(tools: readonly ClientToolEntry[], refs: Refs): PageToolDispatch {
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const))
  return async (query) => {
    const tool = byName.get(query.name)
    if (!tool) unknownVerb(`no mounted extension declares a client tool named "${query.name}"`)
    try {
      const result = await tool.execute(query.input, callCtx(tool, refs))
      const record = plainRecordOf(result)
      if (!record || !isJsonSerializable(record)) fail(`${query.name} returned a non-serializable result`)
      return record
    } catch (error) {
      rethrow(error)
    }
  }
}
