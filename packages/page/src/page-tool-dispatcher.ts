import type {ClientEffect, ClientToolCtx, ClientToolEntry, ClientToolLocator} from '@conciv/extension'
import type {PageQuery, PageResult} from '@conciv/protocol/page-types'
import type {ElementCapture, ElementCaptureKind, PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {addRef, type Refs} from './page-snapshot.js'
import type {ConsoleEntry} from './console-buffer.js'
import {elementByName} from './react-bridge.js'
import {mirrorPageAction} from './page-mirror.js'
import {badArgs, fail, unknownVerb} from './page-failure.js'
import {isJsonSerializable, rethrow} from './page-tool-outcome.js'
import {makeCssBundleDeduper, type CssBundleDeduper, type PendingCssText} from './css-bundle.js'
import {takeElementCapture} from './element-capture.js'

export type PageToolAnswer = {result: PageResult; capture?: PageCaptureBundle}

export type PageToolDispatch = (query: PageQuery) => Promise<PageToolAnswer>

function locatorTarget(locator: ClientToolLocator, refs: Refs): Element | null {
  if (locator.ref !== undefined) {
    const el = refs.map.get(locator.ref)?.deref()
    return el?.isConnected ? el : null
  }
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

type TargetSlot = {el: Element | null}

function callCtx(
  tool: ClientToolEntry,
  refs: Refs,
  consoleBuf: ConsoleEntry[],
  effects: readonly ClientEffect[],
  slot: TargetSlot,
): ClientToolCtx {
  const remember = (el: Element | null): Element | null => {
    if (el !== null) slot.el = el
    return el
  }
  const resolve = (locator: ClientToolLocator): Element | null => remember(locatorTarget(locator, refs))
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
    effects,
  }
}

function plainRecordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  return Object.fromEntries(Object.entries(value))
}

type PendingBundleEntry = {kind: ElementCaptureKind; capture: ElementCapture; pendingCss: PendingCssText | null}

type CaptureCollector = {
  take: (kind: ElementCaptureKind, el: Element | null) => void
  entries: () => readonly PendingBundleEntry[]
}

function makeCaptureCollector(): CaptureCollector {
  const entries: PendingBundleEntry[] = []
  const seen = new Set<ElementCaptureKind>()
  return {
    take: (kind, el) => {
      if (el === null || seen.has(kind)) return
      try {
        const taken = takeElementCapture(el, kind, {document})
        if (taken === null) return
        seen.add(kind)
        entries.push({kind, capture: taken.capture, pendingCss: taken.pendingCss})
      } catch {
        return
      }
    },
    entries: () => entries,
  }
}

async function buildCaptureBundle(
  entries: readonly PendingBundleEntry[],
  shipCss: CssBundleDeduper,
): Promise<PageCaptureBundle | undefined> {
  if (entries.length === 0) return undefined
  const bundle: PageCaptureBundle = {}
  for (const entry of entries) {
    if (entry.pendingCss === null) {
      bundle[entry.kind] = entry.capture
      continue
    }
    const shipped = await shipCss(entry.pendingCss)
    bundle[entry.kind] = {...entry.capture, cssBundleId: shipped.hash}
    if (shipped.bundle !== undefined) bundle.cssBundle = shipped.bundle
  }
  return bundle
}

export function makePageToolDispatcher(
  tools: readonly ClientToolEntry[],
  refs: Refs,
  consoleBuf: ConsoleEntry[],
  effects: readonly ClientEffect[],
): PageToolDispatch {
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const))
  const shipCss = makeCssBundleDeduper()
  return async (query) => {
    const tool = byName.get(query.name)
    if (!tool) unknownVerb(`no mounted extension declares a client tool named "${query.name}"`)
    const slot: TargetSlot = {el: null}
    const captures = makeCaptureCollector()
    const ctx = callCtx(tool, refs, consoleBuf, effects, slot)
    try {
      const result = await tool.execute(query.input, capturingCtx(ctx, tool.capture, captures))
      const record = plainRecordOf(result)
      if (!record || !isJsonSerializable(record)) fail(`${query.name} returned a non-serializable result`)
      if (tool.capture !== 'none') captures.take('after', slot.el)
      const bundle = await buildCaptureBundle(captures.entries(), shipCss)
      return bundle === undefined ? {result: record} : {result: record, capture: bundle}
    } catch (error) {
      rethrow(error)
    }
  }
}

function capturingCtx(ctx: ClientToolCtx, mode: ClientToolEntry['capture'], captures: CaptureCollector): ClientToolCtx {
  if (mode !== 'before-after') return ctx
  return {
    ...ctx,
    resolve: (locator) => {
      const el = ctx.resolve(locator)
      captures.take('before', el)
      return el
    },
    target: (locator) => {
      const el = ctx.target(locator)
      captures.take('before', el)
      return el
    },
  }
}
