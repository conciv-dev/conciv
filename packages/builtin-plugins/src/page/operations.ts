import {z} from 'zod'
import {
  isPageFailure,
  ok,
  pageFailure,
  PageErrorSchema,
  type PageError,
  type PageResult,
} from '@conciv/protocol/page-types'
import type {
  CssBundle,
  ElementCapture,
  ElementCaptureKind,
  PageCaptureBundle,
  ToolCaptureMode,
} from '@conciv/protocol/element-capture-types'
import {toolError} from '@conciv/extension'
import type {BaseContext} from '@conciv/plugin/experimental'
import {PageEffect} from '@conciv/plugin/experimental/page'
import {
  addRef,
  buildSnapshot,
  dehydrate,
  describeElement,
  DOM_CAP,
  isOurs,
  isSensitiveField,
  loadedSnapshotLibrary,
  loadSnapshotLibrary,
  MASKED_VALUE,
  navigatePath,
  reactBridge,
  selectDeep,
  startTracking,
  stopTracking,
  takeElementCapture,
  toCssBundle,
  trackReport,
  type PendingCssText,
  type Refs,
} from '@conciv/page'
import {startConsoleBuffer, type ConsoleEntry} from './console-buffer.js'
import {badArgs, fail} from './page-failure.js'
import {isJsonSerializable, rethrow} from './page-tool-outcome.js'
import {actionable, fill, focusedElement, hover, isDisabled, isHtml, press, select, setChecked} from './page-act.js'
import {Operations, type Action, type Command, type File, type Outcome} from './rpc.js'
import {screenshot} from './screenshot.js'
import {watchHotUpdates} from './hmr.js'
import {pointAt, simulateClick, startTask, touchTask} from './simulator.js'

type Locator = {ref?: string; selector?: string; name?: string}

type Call = {
  agentId: string
  document: Document
  target: (locator: Locator) => Element
  resolve: (locator: Locator) => Element | null
  addRef: (el: Element) => string
  resetRefs: () => void
  consoleEntries: (since?: number) => ConsoleEntry[]
}

type Answer = {value: unknown; files: File[]}

export type PageOperations = {
  execute: (command: Command, signal?: AbortSignal) => Promise<Outcome>
  dispose: () => void
}

function serialize(value: unknown): unknown {
  if (value instanceof Element) return describeElement(value)
  return dehydrate(value)
}

function waitFor(selector: string, state: 'visible' | 'hidden', timeout: number): Promise<PageResult> {
  const deadline = Date.now() + timeout
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const el = selectDeep(selector)[0]
      const visible = el instanceof HTMLElement && el.offsetParent !== null
      if (state === 'visible' ? visible : !visible) return resolve(ok({state}))
      if (Date.now() > deadline) {
        return reject(pageFailure('handler-error', `wait timed out for ${selector} (${state})`))
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

function isField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

function result(value: unknown, attached: File[] = []): Answer {
  return {value, files: attached}
}

function touching(value: () => unknown): Answer {
  touchTask()
  return result(value())
}

async function touchingAsync(value: () => Promise<unknown>): Promise<Answer> {
  touchTask()
  return result(await value())
}

async function acting(call: Call, value: () => unknown): Promise<Answer> {
  startTask(call.agentId)
  touchTask()
  return result(await value())
}

function actionableTarget(call: Call, input: Locator): Element {
  const element = actionable(call.target(input))
  if (typeof element === 'string') badArgs(element)
  return element
}

function buildOutcome<Result extends Record<string, unknown>>(outcome: Result | string): PageResult {
  if (typeof outcome === 'string') badArgs(outcome)
  return ok(outcome)
}

async function setCheckedOn(input: Locator, call: Call, checked: boolean): Promise<PageResult> {
  const element = call.target(input)
  if (isDisabled(element)) badArgs('That element is disabled.')
  return buildOutcome(await setChecked({element, checked, agent: call.agentId}))
}

const INSERT_POS: Record<string, InsertPosition> = {
  before: 'beforebegin',
  after: 'afterend',
  prepend: 'afterbegin',
  append: 'beforeend',
}

function resolveRoot(call: Call, selector: string | undefined): Element | null {
  return selector ? (selectDeep(selector)[0] ?? null) : call.document.body
}

function hasLocator(input: Locator): boolean {
  return input.ref !== undefined || input.selector !== undefined || input.name !== undefined
}

const waitForHotUpdate = watchHotUpdates(import.meta.hot)

function listEffects(effects: readonly PageEffect[], requestedEffect: string | undefined) {
  if (requestedEffect !== undefined) badArgs('action list does not take an effect name; it reports every effect')
  return {
    effects: effects.map((effect) => ({name: effect.name, description: effect.description, enabled: effect.enabled()})),
  }
}

function requireEffect(effects: readonly PageEffect[], name: string | undefined, action: string): PageEffect {
  if (name === undefined) badArgs(`action ${action} needs an effect name; action list shows what exists`)
  const effect = effects.find((candidate) => candidate.name === name)
  if (effect) return effect
  const registered = effects.map((candidate) => candidate.name).join(', ')
  throw toolError('UNKNOWN_EFFECT', {
    message: `no effect named "${name}"; registered: ${registered === '' ? 'none' : registered}`,
  })
}

function driveEffect(effect: PageEffect, action: string): void {
  if (action === 'report') return
  effect.set(action === 'toggle' ? !effect.enabled() : action === 'enable' || action === 'start')
}

function afterResultFlush(action: () => void): void {
  setTimeout(action, 0)
}

function evaluate(code: string): unknown {
  try {
    return new Function(`return (async () => (${code}\n))()`)()
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return new Function(`return (async () => { ${code}\n})()`)()
  }
}

async function shot(input: {exclude?: string[]}): Promise<Answer> {
  touchTask()
  const {data, ...value} = await screenshot(input)
  const file: File = {id: `file_${crypto.randomUUID()}`, name: 'screenshot.webp', mime: 'image/webp', data}
  return result(value, [file])
}

function perform(action: Action, call: Call, effects: () => readonly PageEffect[]): Answer | Promise<Answer> {
  switch (action.type) {
    case 'route':
      return touching(() => ({
        pathname: location.pathname,
        search: location.search,
        href: location.href,
        title: document.title,
        state: document.visibilityState === 'visible' ? 'visible' : 'hidden',
      }))
    case 'console':
      return touching(() => ({entries: call.consoleEntries(action.since)}))
    case 'dom':
      return touching(() => {
        const root = hasLocator(action) ? call.target(action) : call.document.body
        return {html: root.outerHTML.slice(0, DOM_CAP)}
      })
    case 'query':
      return touching(() => {
        const matches = action.selector ? selectDeep(action.selector) : []
        return {count: matches.length, elements: matches.slice(0, 20).map(describeElement)}
      })
    case 'exists':
      return touching(() => {
        const matches = action.selector ? selectDeep(action.selector) : []
        return {exists: matches.length > 0, count: matches.length}
      })
    case 'snapshot':
      return touching(() => {
        const root = resolveRoot(call, action.selector)
        if (!root) return {nodes: []}
        call.resetRefs()
        return {nodes: buildSnapshot(root, call.addRef)}
      })
    case 'screenshot':
      return shot(action)
    case 'hmr':
      return touchingAsync(() => waitForHotUpdate(action.timeout))
    case 'locate':
      return touchingAsync(async () => {
        const located = await reactBridge.locate(call.target(action), call.addRef)
        return located ?? fail('no React fiber: element may be outside a React tree or not hydrated yet')
      })
    case 'inspect':
      return touchingAsync(async () => {
        const inspected = await reactBridge.inspect(call.target(action))
        if (!inspected) fail('no React fiber for element')
        const root = {props: inspected.props, state: inspected.state, hooks: inspected.hooks}
        if (action.path) {
          const hit = navigatePath(root, action.path)
          if (!hit.found) badArgs(`path not found: ${action.path}`)
          return {component: inspected.component, path: action.path, value: dehydrate(hit.value)}
        }
        return {
          component: inspected.component,
          props: dehydrate(inspected.props),
          state: dehydrate(inspected.state),
          hooks: dehydrate(inspected.hooks),
          rect: inspected.rect,
        }
      })
    case 'override':
      return touchingAsync(async () => {
        const el = call.target(action)
        let value: unknown
        try {
          value = action.json === undefined ? undefined : JSON.parse(action.json)
        } catch {
          badArgs(`--json is not valid JSON: ${action.json}`)
        }
        const path = action.path ? action.path.split('.') : []
        const overridden = await reactBridge.override(el, action.target, path, value, action.hookId)
        if ('error' in overridden) fail(overridden.error)
        return ok({target: action.target, path: action.path ?? '', ...(value === undefined ? {} : {value})})
      })
    case 'tree':
      return touchingAsync(async () => {
        const root = resolveRoot(call, action.selector)
        return root ? await reactBridge.tree(root, call.addRef) : badArgs('no root element')
      })
    case 'find':
      return touchingAsync(async () => reactBridge.find(action.name, call.addRef))
    case 'track':
      return touching(() => {
        const tracked = action.action ?? 'report'
        if (tracked === 'start') {
          startTracking()
          return ok({tracking: true})
        }
        if (tracked === 'stop') return stopTracking()
        return trackReport({name: action.name})
      })
    case 'effect':
      return touching(() => {
        const driven = action.action ?? 'list'
        if (driven === 'list') return listEffects(effects(), action.effect)
        const effect = requireEffect(effects(), action.effect, driven)
        driveEffect(effect, driven)
        return {effect: effect.name, enabled: effect.enabled()}
      })
    case 'wait':
      return touchingAsync(() =>
        action.selector
          ? waitFor(action.selector, action.state ?? 'visible', action.timeout ?? 5000)
          : badArgs('wait requires a selector'),
      )
    case 'reload':
      return touching(() => {
        afterResultFlush(() => call.document.location.reload())
        return ok({initiated: true})
      })
    case 'text':
      return touching(() => ({text: (call.target(action).textContent ?? '').slice(0, DOM_CAP)}))
    case 'value':
      return touching(() => {
        const el = call.target(action)
        if (!isField(el)) return {value: null}
        return {value: isSensitiveField(el) ? MASKED_VALUE : el.value}
      })
    case 'attr':
      return touching(() => ({value: call.target(action).getAttribute(action.attribute)}))
    case 'click':
      return acting(call, () => {
        simulateClick({element: actionableTarget(call, action), agent: call.agentId})
        return ok()
      })
    case 'hover':
      return acting(call, () => {
        const element = actionableTarget(call, action)
        pointAt({element, agent: call.agentId})
        hover(element)
        return ok()
      })
    case 'scroll':
      return acting(call, () => {
        pointAt({element: call.target(action), agent: call.agentId})
        return ok()
      })
    case 'submit':
      return touching(() => {
        const el = call.target(action)
        const form = el instanceof HTMLFormElement ? el : el.closest('form')
        if (!form) badArgs('no form to submit')
        form.requestSubmit()
        return ok()
      })
    case 'fill':
      return acting(call, async () => {
        const element = actionableTarget(call, action)
        return buildOutcome(await fill({element, value: action.value, agent: call.agentId}))
      })
    case 'select':
      return acting(call, async () => {
        const element = call.target(action)
        if (isDisabled(element)) badArgs('That element is disabled.')
        pointAt({element, agent: call.agentId})
        return buildOutcome(await select({element, value: action.value}))
      })
    case 'check':
      return acting(call, () => setCheckedOn(action, call, true))
    case 'uncheck':
      return acting(call, () => setCheckedOn(action, call, false))
    case 'press':
      return acting(call, () => {
        if (!hasLocator(action)) {
          press({element: focusedElement(), key: action.key})
          return ok()
        }
        const element = actionableTarget(call, action)
        pointAt({element, agent: call.agentId})
        if (isHtml(element)) element.focus({preventScroll: true})
        press({element, key: action.key})
        return ok()
      })
    case 'queue':
    case 'queue_async':
      return badArgs('page_queue plays through the engine queue only')
    case 'setattr':
      return touching(() => {
        call.target(action).setAttribute(action.attribute, action.value)
        return ok()
      })
    case 'removeattr':
      return touching(() => {
        call.target(action).removeAttribute(action.attribute)
        return ok()
      })
    case 'addclass':
      return touching(() => {
        call.target(action).classList.add(action.class)
        return ok()
      })
    case 'removeclass':
      return touching(() => {
        call.target(action).classList.remove(action.class)
        return ok()
      })
    case 'setstyle':
      return touching(() => {
        const el = call.target(action)
        if (!(el instanceof HTMLElement)) badArgs('setstyle target is not an HTMLElement')
        el.style.setProperty(action.prop, action.value)
        return ok()
      })
    case 'settext':
      return touching(() => {
        call.target(action).textContent = action.text
        return ok()
      })
    case 'sethtml':
      return touching(() => {
        call.target(action).innerHTML = action.html
        return ok()
      })
    case 'remove':
      return touching(() => {
        call.target(action).remove()
        return ok()
      })
    case 'insert':
      return touching(() => {
        call.target(action).insertAdjacentHTML(INSERT_POS[action.position ?? 'append'] ?? 'beforeend', action.html)
        return ok()
      })
    case 'css':
      return touching(() => {
        const style = call.document.createElement('style')
        style.setAttribute('data-vibe-css', '')
        style.textContent = action.text
        call.document.head.appendChild(style)
        return ok()
      })
    case 'eval':
      return touchingAsync(async () => {
        const evaluated: unknown = await evaluate(action.code)
        return {result: serialize(evaluated)}
      })
    default:
      return fail(
        'This operation was routed to a page instead of the tab manager. Report a page/plugin routing mismatch; changing tab IDs or repeating the operation will not fix it.',
      )
  }
}

function notOurs(el: Element | null | undefined): Element | null {
  return el && !isOurs(el) ? el : null
}

function locatorTarget(locator: Locator, refs: Refs): Element | null {
  if (locator.ref !== undefined) {
    const el = refs.map.get(locator.ref)?.deref()
    return el?.isConnected ? notOurs(el) : null
  }
  if (locator.selector !== undefined) {
    return selectDeep(locator.selector).find((el) => !isOurs(el)) ?? null
  }
  if (locator.name !== undefined) return notOurs(reactBridge.elementByName(locator.name))
  return null
}

function missingTarget(locator: Locator): never {
  if (locator.ref !== undefined) badArgs(`stale ref ${locator.ref}; re-run page snapshot`)
  if (locator.name !== undefined) badArgs(`no React component named "${locator.name}" found`)
  if (locator.selector !== undefined) badArgs(`no element for selector ${locator.selector}`)
  badArgs('no target: pass ref, selector, or name')
}

type TargetSlot = {el: Element | null}

function callCtx(agentId: string, refs: Refs, consoleBuf: ConsoleEntry[], slot: TargetSlot): Call {
  const remember = (el: Element | null): Element | null => {
    if (el !== null) slot.el = el
    return el
  }
  const resolve = (locator: Locator): Element | null => remember(locatorTarget(locator, refs))
  return {
    agentId,
    document,
    resolve,
    target: (locator) => {
      const el = resolve(locator)
      if (!el) missingTarget(locator)
      return el
    },
    addRef: (el) => addRef(el, refs),
    resetRefs: () => refs.map.clear(),
    consoleEntries: (since) => consoleBuf.filter((entry) => entry.ts >= (since ?? 0)),
  }
}

function readPlainRecord(value: unknown): Record<string, unknown> | null {
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
        const taken = takeElementCapture(el, kind, {document, snapshot: loadedSnapshotLibrary()})
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

async function buildCaptureBundle(entries: readonly PendingBundleEntry[]): Promise<PageCaptureBundle | undefined> {
  if (entries.length === 0) return undefined
  const bundle: PageCaptureBundle = {}
  const cssBundles: CssBundle[] = []
  for (const entry of entries) {
    if (entry.pendingCss === null) {
      bundle[entry.kind] = entry.capture
      continue
    }
    const css = await toCssBundle(entry.pendingCss)
    bundle[entry.kind] = {...entry.capture, cssBundleId: css.hash}
    if (!cssBundles.some((known) => known.hash === css.hash)) cssBundles.push(css)
  }
  if (cssBundles.length > 0) bundle.cssBundles = cssBundles
  return bundle
}

async function tryBuildCaptureBundle(entries: readonly PendingBundleEntry[]): Promise<PageCaptureBundle | undefined> {
  try {
    return await buildCaptureBundle(entries)
  } catch {
    return undefined
  }
}

function capturingCall(call: Call, mode: ToolCaptureMode, captures: CaptureCollector): Call {
  if (mode !== 'before-after') return call
  return {
    ...call,
    resolve: (locator) => {
      const el = call.resolve(locator)
      captures.take('before', el)
      return el
    },
    target: (locator) => {
      const el = call.target(locator)
      captures.take('before', el)
      return el
    },
  }
}

function captureMode(action: Action): ToolCaptureMode {
  return Operations.find((operation) => operation.name === action.type)?.capture ?? 'none'
}

function normalizePageError(error: unknown): PageError {
  if (!isPageFailure(error)) {
    return {code: 'handler-error', message: error instanceof Error ? error.message : String(error)}
  }
  const reported = PageErrorSchema.safeParse(error.error)
  if (reported.success) return reported.data
  return {code: 'handler-error', message: error.error.message}
}

function failure(error: unknown): Outcome {
  return {type: 'failure', ...normalizePageError(error)}
}

export function makePageOperations(ctx: Pick<BaseContext, 'list'>): PageOperations {
  const refs: Refs = {map: new Map(), n: 0}
  const {buf: consoleBuf, dispose: disposeConsoleBuffer} = startConsoleBuffer()
  const effects = () => ctx.list(PageEffect)
  void loadSnapshotLibrary()

  async function dispatch(command: Command, signal: AbortSignal | undefined): Promise<Outcome> {
    signal?.throwIfAborted()
    void loadSnapshotLibrary()
    const {action} = command
    const mode = captureMode(action)
    const slot: TargetSlot = {el: null}
    const captures = makeCaptureCollector()
    const call = callCtx(command.agentId, refs, consoleBuf, slot)
    try {
      const answer = await perform(action, capturingCall(call, mode, captures), effects)
      const record = readPlainRecord(answer.value)
      if (!record || !isJsonSerializable(record)) fail(`${action.type} returned a non-serializable result`)
      if (mode !== 'none') captures.take('after', slot.el)
      const capture = await tryBuildCaptureBundle(captures.entries())
      const value = z.json().parse(record)
      return {
        type: 'success',
        result: capture === undefined ? {value, files: answer.files} : {value, files: answer.files, capture},
      }
    } catch (error) {
      rethrow(error)
    }
  }

  async function execute(command: Command, signal?: AbortSignal): Promise<Outcome> {
    try {
      return await dispatch(command, signal)
    } catch (error) {
      return failure(error)
    }
  }

  function dispose(): void {
    for (const effect of effects()) if (effect.enabled()) effect.set(false)
    disposeConsoleBuffer()
  }

  return {execute, dispose}
}
