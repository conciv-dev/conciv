import {Effect, Exit, Schedule, Scope, Option} from 'effect'
import {z} from 'zod'
import {
  ok,
  PAGE_QUEUE_STOPPED,
  PAGE_QUEUE_STOPPED_MESSAGE,
  pageFailure,
  PageErrorSchema,
  type PageFailure,
  type PageResult,
  isPageFailure,
} from '@conciv/protocol/page-types'
import type {
  CssBundle,
  ElementCapture,
  ElementCaptureKind,
  PageCaptureBundle,
  ToolCaptureMode,
} from '@conciv/protocol/element-capture-types'
import {toolError, isToolError} from '@conciv/protocol/tool-call-types'
import {
  addRef,
  buildSnapshot,
  describeElement,
  DOM_CAP,
  isOurs,
  isSensitiveField,
  MASKED_VALUE,
  selectDeep,
  type Refs,
} from './snapshot.js'
import {dehydrate, navigatePath} from './dehydrate.js'
import {
  loadedSnapshotLibrary,
  loadSnapshotLibrary,
  takeElementCapture,
  toCssBundle,
  type PendingCssText,
} from './capture.js'
import {reactBridge, startTracking, stopTracking, report as trackReport} from './react.js'
import {unwatchLayout} from './cursor.js'
import {actionable, fill, focusedElement, hover, isDisabled, press, select, setChecked} from './act.js'
import {Operations, SHORT_MAX, type Action, type File, type Outcome, type PageCommand, type Operation} from './rpc.js'
import {screenshot} from './screenshot.js'
import {redactedUrl} from './redacted-url.js'
import {
  acceptQueue,
  arriveAt,
  finishQueue,
  isHtml,
  landQueued,
  pointAt,
  queueStopped,
  simulateClick,
  startTask,
  touchTask,
  type Beat,
} from './simulator.js'

type Locator = Omit<Extract<Action, {type: 'dom'}>, 'type' | 'tabId'>

type Queued = NonNullable<PageCommand['queued']>

type Call = {
  agentId: string
  queued?: Queued
  signal?: AbortSignal
  document: Document
  target: (locator: Locator) => Element
  resolve: (locator: Locator) => Element | null
  addRef: (el: Element) => string
  resetRefs: () => void
  consoleEntries: (since?: number) => ConsoleEntry[]
}

type Answer = {value: unknown; files: File[]}

const WAIT_POLL_MS = 100

export type PageEffect = {
  readonly name: string
  readonly description: string
  set(enabled: boolean): void
  enabled(): boolean
}

const OverrideRefusal = z.object({error: z.string()})

export type PageOperations = {
  execute: (command: PageCommand, signal?: AbortSignal) => Promise<Outcome>
  dispose: () => void
}

function serialize(value: unknown): unknown {
  if (value instanceof Element) return describeElement(value)
  return dehydrate(value)
}

function waitFor(
  selector: string,
  state: 'visible' | 'hidden',
  timeout: number,
  signal: AbortSignal | undefined,
): Promise<PageResult> {
  const reached = Effect.try({
    try: () => {
      signal?.throwIfAborted()
      const el = selectDeep(selector)[0]
      const visible = el instanceof HTMLElement && el.offsetParent !== null
      return state === 'visible' ? visible : !visible
    },
    catch: (error) => error,
  })
  return Effect.runPromise(
    reached.pipe(
      Effect.repeat({schedule: Schedule.spaced(WAIT_POLL_MS), until: (done) => done}),
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(pageFailure('handler-error', `wait timed out for ${selector} (${state})`)),
      }),
      Effect.as(ok({state})),
    ),
  )
}

function isField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

function maskedValueAttribute(el: Element, attribute: string): string | null {
  if (attribute.toLowerCase() === 'value' && isSensitiveField(el)) return el.hasAttribute('value') ? MASKED_VALUE : null
  return el.getAttribute(attribute)
}

function maskedOuterHtml(root: Element): string {
  const copy = root.cloneNode(true)
  if (!(copy instanceof Element)) return fail('dom could not copy the element')
  const sensitive = [copy, ...copy.querySelectorAll('[value]')].filter(
    (el) => el.hasAttribute('value') && isSensitiveField(el),
  )
  sensitive.forEach((el) => el.setAttribute('value', MASKED_VALUE))
  return copy.outerHTML
}

function result(value: unknown, attached: File[] = []): Answer {
  if ((JSON.stringify(value) ?? '').length > 512_000)
    throw new Error(
      'Browser result exceeds 512000 JSON characters. Request fewer entries, reduce snapshot depth, or return only selected fields from the evaluation script. Repeating the same request will not reduce its output.',
    )
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

async function acting(call: Call, input: Locator, value: () => unknown, beat: Beat = 'click'): Promise<Answer> {
  const queued = call.queued
  if (queued === undefined) {
    startTask(call.agentId)
    touchTask()
    return result(await value())
  }
  return Effect.runPromise(
    playQueued({input, call, queued, beat, value}).pipe(
      Effect.map(result),
      Effect.ensuring(
        Effect.sync(() => {
          if (queued.index === queued.of - 1) finishQueue(queued.id)
        }),
      ),
    ),
  )
}

function queueStoppedError(): Error {
  return toolError(PAGE_QUEUE_STOPPED, {message: PAGE_QUEUE_STOPPED_MESSAGE})
}

function stoppedBefore(queued: Queued): void {
  if (queueStopped(queued.id)) throw queueStoppedError()
}

function stillPlaying(call: Call, queued: Queued): Effect.Effect<void, unknown> {
  return Effect.suspend(() => {
    if (call.signal?.aborted) return Effect.fail(call.signal.reason)
    return queueStopped(queued.id) ? Effect.fail(queueStoppedError()) : Effect.void
  })
}

function stillQueued(call: Call): void {
  call.signal?.throwIfAborted()
  if (call.queued !== undefined) stoppedBefore(call.queued)
}

function paceTarget(input: Locator, call: Call): Element | null {
  const element = hasLocator(input) ? call.resolve(input) : focusedElement()
  if (element === null || element === call.document.body) return null
  return typeof actionable(element) === 'string' ? null : element
}

const playQueued = Effect.fnUntraced(function* (options: {
  input: Locator
  call: Call
  queued: Queued
  beat: Beat
  value: () => unknown
}) {
  const {input, call, queued, beat, value} = options
  if (queueStopped(queued.id)) return yield* Effect.fail(queueStoppedError())
  startTask(call.agentId)
  touchTask()
  const element = paceTarget(input, call)
  if (element !== null) yield* arriveAt({element, agent: call.agentId, beat})
  yield* stillPlaying(call, queued)
  return yield* landQueued({beat, act: Effect.tryPromise({try: async () => value(), catch: (error) => error})})
})

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

async function fillOn(input: Locator, call: Call, value: string): Promise<PageResult> {
  const element = actionableTarget(call, input)
  return buildOutcome(await fill({element, value, agent: call.agentId, halt: () => stillQueued(call)}))
}

async function selectOn(input: Locator, call: Call, value: string): Promise<PageResult> {
  const element = call.target(input)
  if (isDisabled(element)) badArgs('That element is disabled.')
  pointAt({element, agent: call.agentId})
  return buildOutcome(await select({element, value}))
}

type FormField = Extract<Action, {readonly type: 'fill_form'}>['fields'][number]

async function fillForm(
  fields: readonly FormField[],
  call: Call,
  signal: AbortSignal | undefined,
): Promise<PageResult> {
  for (const field of fields) {
    signal?.throwIfAborted()
    if (field.type === 'text') await fillOn(field, call, field.value)
    if (field.type === 'select') await selectOn(field, call, field.value)
    if (field.type === 'check') await setCheckedOn(field, call, field.checked)
  }
  return ok()
}

const INSERT_POS: Record<NonNullable<Extract<Action, {type: 'insert'}>['position']>, InsertPosition> = {
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

function perform(
  action: Action,
  call: Call,
  effects: readonly PageEffect[],
  signal: AbortSignal | undefined,
): Answer | Promise<Answer> {
  switch (action.type) {
    case 'route':
      return touching(() => {
        const url = new URL(redactedUrl(location.href))
        return {
          pathname: url.pathname,
          search: url.search,
          href: url.href,
          title: document.title,
          state: document.visibilityState === 'visible' ? 'visible' : 'hidden',
        }
      })
    case 'console':
      return touching(() => ({entries: call.consoleEntries(action.since)}))
    case 'dom':
      return touching(() => {
        const root = hasLocator(action) ? call.target(action) : call.document.body
        return {html: maskedOuterHtml(root).slice(0, DOM_CAP)}
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
        const refusal = OverrideRefusal.safeParse(overridden)
        if (refusal.success) fail(refusal.data.error)
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
        if (driven === 'list') return listEffects(effects, action.effect)
        const effect = requireEffect(effects, action.effect, driven)
        driveEffect(effect, driven)
        return {effect: effect.name, enabled: effect.enabled()}
      })
    case 'wait':
      return touchingAsync(() =>
        action.selector
          ? waitFor(action.selector, action.state ?? 'visible', action.timeout ?? 5000, signal)
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
      return touching(() => ({value: maskedValueAttribute(call.target(action), action.attribute)}))
    case 'click':
      return acting(call, action, () => {
        simulateClick({element: actionableTarget(call, action), agent: call.agentId})
        return ok()
      })
    case 'hover':
      return acting(
        call,
        action,
        () => {
          const element = actionableTarget(call, action)
          pointAt({element, agent: call.agentId})
          hover(element)
          return ok()
        },
        'point',
      )
    case 'scroll':
      return acting(
        call,
        action,
        () => {
          pointAt({element: call.target(action), agent: call.agentId})
          return ok()
        },
        'point',
      )
    case 'submit':
      return touching(() => {
        const el = call.target(action)
        const form = el instanceof HTMLFormElement ? el : el.closest('form')
        if (!form) badArgs('no form to submit')
        form.requestSubmit()
        return ok()
      })
    case 'fill':
      return acting(call, action, () => fillOn(action, call, action.value), 'input')
    case 'fill_form':
      return acting(call, {}, () => fillForm(action.fields, call, signal))
    case 'select':
      return acting(call, action, () => selectOn(action, call, action.value))
    case 'check':
      return acting(call, action, () => setCheckedOn(action, call, true))
    case 'uncheck':
      return acting(call, action, () => setCheckedOn(action, call, false))
    case 'press':
      return acting(
        call,
        action,
        () => {
          if (!hasLocator(action)) {
            press({element: focusedElement(), key: action.key})
            return ok()
          }
          const element = actionableTarget(call, action)
          pointAt({element, agent: call.agentId})
          if (isHtml(element)) element.focus({preventScroll: true})
          press({element, key: action.key})
          return ok()
        },
        'input',
      )
    case 'queue':
    case 'queue_async':
      return accepted(call, action.actions.length, signal)
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
        call.target(action).insertAdjacentHTML(INSERT_POS[action.position ?? 'append'], action.html)
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

function accepted(call: Call, of: number, signal: AbortSignal | undefined): Answer {
  const queued = call.queued
  if (queued === undefined) badArgs('page_queue plays through the engine queue only')
  startTask(call.agentId)
  touchTask()
  acceptQueue(queued.id, signal)
  return result({queueId: queued.id, status: 'playing', done: 0, of})
}

function callCtx(
  agentId: string,
  refs: Refs,
  consoleBuf: ConsoleEntry[],
  slot: TargetSlot,
  queued: Queued | undefined,
  signal: AbortSignal | undefined,
): Call {
  const remember = (el: Element | null): Element | null => {
    if (el !== null) slot.el = el
    return el
  }
  const resolve = (locator: Locator): Element | null => remember(locatorTarget(locator, refs))
  return {
    agentId,
    ...(queued === undefined ? {} : {queued}),
    ...(signal === undefined ? {} : {signal}),
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

function makeCaptureCollector(operation: string): CaptureCollector {
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
      } catch (error) {
        console.error(`[conciv] page ${operation} ${kind} capture failed`, error)
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

async function tryBuildCaptureBundle(
  entries: readonly PendingBundleEntry[],
  operation: string,
): Promise<PageCaptureBundle | undefined> {
  try {
    return await buildCaptureBundle(entries)
  } catch (error) {
    console.error(`[conciv] page ${operation} capture bundle failed`, error)
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

function failure(error: PageFailure): Outcome {
  const reported = PageErrorSchema.safeParse(error.error)
  if (reported.success) return {type: 'failure', ...reported.data, message: reported.data.message.slice(0, SHORT_MAX)}
  return {type: 'failure', code: 'handler-error', message: error.error.message.slice(0, SHORT_MAX)}
}

export function makePageOperations(effects: readonly PageEffect[]): PageOperations {
  const refs: Refs = {map: new Map(), n: 0}
  const scope = Scope.makeUnsafe()
  const consoleBuf = Effect.runSync(consoleBuffer.pipe(Scope.provide(scope)))
  void loadSnapshotLibrary()

  const dispatch = Effect.fnUntraced(function* (command: PageCommand, signal: AbortSignal | undefined) {
    yield* Effect.try({try: () => signal?.throwIfAborted(), catch: toPageFailure})
    void loadSnapshotLibrary()
    const {action} = command
    const mode = captureMode(action)
    const slot: TargetSlot = {el: null}
    const captures = makeCaptureCollector(action.type)
    const call = callCtx(command.agentId, refs, consoleBuf, slot, command.queued, signal)
    const answer = yield* Effect.tryPromise({
      try: async () => perform(action, capturingCall(call, mode, captures), effects, signal),
      catch: toPageFailure,
    })
    const record = readPlainRecord(answer.value)
    if (!record || !isJsonSerializable(record)) {
      return yield* Effect.fail(pageFailure('handler-error', `${action.type} returned a non-serializable result`))
    }
    if (mode !== 'none' && command.queued === undefined) captures.take('after', slot.el)
    const capture = yield* Effect.promise(() => tryBuildCaptureBundle(captures.entries(), action.type))
    const value = yield* Effect.try({try: () => z.json().parse(record), catch: toPageFailure})
    const outcome: Outcome = {
      type: 'success',
      result: capture === undefined ? {value, files: answer.files} : {value, files: answer.files, capture},
    }
    return outcome
  })

  function execute(command: PageCommand, signal?: AbortSignal): Promise<Outcome> {
    return Effect.runPromise(
      dispatch(command, signal).pipe(
        Effect.catch((error) => Effect.succeed(failure(error))),
        Effect.catchDefect((defect) => Effect.succeed(failure(toPageFailure(defect)))),
      ),
    )
  }

  function dispose(): void {
    for (const effect of effects) if (effect.enabled()) effect.set(false)
    Effect.runSync(Scope.close(scope, Exit.void))
    unwatchLayout()
  }

  return {execute, dispose}
}

export function fail(message: string): never {
  throw pageFailure('handler-error', message)
}

export function badArgs(message: string): never {
  throw pageFailure('invalid-args', message)
}

function isSchemaRejection(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray(Reflect.get(error, 'issues'))
}

export function toPageFailure(error: unknown): PageFailure {
  if (isPageFailure(error)) return error
  if (isSchemaRejection(error)) return pageFailure('invalid-args', error.message)
  if (!isToolError(error)) return pageFailure('handler-error', error instanceof Error ? error.message : String(error))
  return pageFailure('handler-error', error.message, {
    code: error.code,
    message: error.message,
    ...(isJsonSerializable(error.data) ? {data: error.data} : {}),
  })
}

export function isJsonSerializable(value: unknown): boolean {
  return isStructurallySerializable(value, new Set<object>())
}

function isSerializablePrimitive(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  return typeof value === 'number' && Number.isFinite(value)
}

function isStructurallySerializable(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value !== 'object') return isSerializablePrimitive(value)
  if (seen.has(value)) return false
  const children = transmittedValues(value)
  if (!children) return false
  seen.add(value)
  const ok = children.every((child) => isStructurallySerializable(child, seen))
  seen.delete(value)
  return ok
}

function transmittedValues(value: object): unknown[] | null {
  if (Array.isArray(value)) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  const values: unknown[] = []
  for (const key in value) values.push(Reflect.get(value, key))
  return values
}

export type ConsoleEntry = z.output<Extract<Operation, {readonly name: 'console'}>['output']>['entries'][number]

type Push = (level: string, args: unknown[]) => string

const CONSOLE_CAP = 200

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error'] as const

const FORWARD_MARKER = /\[vite\] \(client\)|\[Server\]/

function patchConsole(level: (typeof CONSOLE_LEVELS)[number], push: Push): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const original = console[level].bind(console)
      const wrapper = (...args: unknown[]) => {
        const text = push(level, args)
        if (!FORWARD_MARKER.test(text)) original(...args)
      }
      console[level] = wrapper
      return {original, wrapper}
    }),
    ({original, wrapper}) =>
      Effect.sync(() => {
        if (console[level] === wrapper) console[level] = original
      }),
  )
}

function listenWindow<Type extends keyof WindowEventMap>(
  type: Type,
  listener: (event: WindowEventMap[Type]) => void,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => window.addEventListener(type, listener)),
    () => Effect.sync(() => window.removeEventListener(type, listener)),
  )
}

export const consoleBuffer: Effect.Effect<ConsoleEntry[], never, Scope.Scope> = Effect.gen(function* () {
  const buf: ConsoleEntry[] = []
  const push: Push = (level, args) => {
    const text = args.map((a) => String(a)).join(' ')
    buf.push({level, ts: Date.now(), text})
    if (buf.length > CONSOLE_CAP) buf.shift()
    return text
  }
  yield* Effect.forEach(CONSOLE_LEVELS, (level) => patchConsole(level, push), {discard: true})
  yield* listenWindow('error', (event) => push('uncaught', [thrownText(event.error, event.message)]))
  yield* listenWindow('unhandledrejection', (event) =>
    push('unhandled', [thrownText(event.reason, String(event.reason))]),
  )
  return buf
})

function thrownText(thrown: unknown, fallback: string): string {
  if (!(thrown instanceof Error) || thrown.stack === undefined || thrown.stack === '') return fallback
  const message = String(thrown)
  return thrown.stack.startsWith(message) ? thrown.stack : `${message}\n${thrown.stack}`
}

type HotUpdateWait = z.output<Extract<Operation, {readonly name: 'hmr'}>['output']>

type HotEvent = 'vite:beforeUpdate' | 'vite:afterUpdate' | 'vite:error'

export type HotSurface = {on: (event: HotEvent, listener: (payload: unknown) => void) => void}

type Settled = {at: number; error: string | null}

const ErrorPayloadSchema = z.object({err: z.object({message: z.string()})})

const SETTLED = 'settled'

const RECENT_SETTLE_MS = 1000

const nextFrame: Effect.Effect<void> = Effect.callback((resume) => {
  const frame = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(frame))
})

function nextSettle(settled: EventTarget): Effect.Effect<void> {
  return Effect.callback((resume, signal) => {
    settled.addEventListener(SETTLED, () => resume(Effect.void), {once: true, signal})
  })
}

function outcome(last: Settled, waitedMs: number): HotUpdateWait {
  return {supported: true, applied: last.error === null, waitedMs, error: last.error}
}

export function watchHotUpdates(hot: HotSurface | undefined): (timeoutMs: number) => Promise<HotUpdateWait> {
  if (hot === undefined) return async () => ({supported: false, applied: false, waitedMs: 0, error: null})
  const state: {last: Settled | null} = {last: null}
  const settled = new EventTarget()
  const settle = (error: string | null): void => {
    state.last = {at: performance.now(), error}
    settled.dispatchEvent(new Event(SETTLED))
  }
  hot.on('vite:beforeUpdate', () => {
    state.last = null
  })
  hot.on('vite:afterUpdate', () => settle(null))
  hot.on('vite:error', (payload) => {
    const parsed = ErrorPayloadSchema.safeParse(payload)
    settle(parsed.success ? parsed.data.err.message : 'the hot update failed')
  })
  const wait = Effect.fnUntraced(function* (timeoutMs: number) {
    const startedAt = performance.now()
    const recent = state.last
    if (recent !== null && startedAt - recent.at <= RECENT_SETTLE_MS) return outcome(recent, 0)
    const landed = yield* nextSettle(settled).pipe(Effect.timeoutOption(timeoutMs))
    const last = state.last
    if (Option.isNone(landed) || last === null) {
      const waitedMs = Math.round(performance.now() - startedAt)
      return {supported: true, applied: false, waitedMs, error: `the hot update did not land within ${timeoutMs}ms`}
    }
    if (last.error === null) {
      yield* nextFrame.pipe(Effect.timeoutOption(Math.max(timeoutMs - (performance.now() - startedAt), 0)))
    }
    return outcome(last, Math.round(performance.now() - startedAt))
  })
  return (timeoutMs) => Effect.runPromise(wait(timeoutMs))
}
