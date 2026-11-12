import {
  pageFailure,
  ok,
  PAGE_QUEUE_STOPPED,
  PAGE_QUEUE_STOPPED_MESSAGE,
  type PageResult,
} from '@conciv/protocol/page-types'
import {toolError, type ClientEffect, type ClientToolCtx, type ClientToolLocator} from '@conciv/extension'
import {
  buildSnapshot,
  dehydrate,
  describeElement,
  DOM_CAP,
  isSensitiveField,
  MASKED_VALUE,
  navigatePath,
  reactBridge,
  startTracking,
  stopTracking,
  trackReport,
} from '@conciv/page'
import type {AnyToolBuilder} from '@conciv/extension'
import {
  addclassDef,
  attrDef,
  checkDef,
  clickDef,
  consoleDef,
  cssDef,
  domDef,
  effectDef,
  evalDef,
  existsDef,
  fillDef,
  findDef,
  hoverDef,
  insertDef,
  inspectDef,
  locateDef,
  overrideDef,
  pressDef,
  queryDef,
  queueDef,
  reloadDef,
  removeattrDef,
  removeclassDef,
  removeDef,
  routeDef,
  scrollDef,
  selectDef,
  setattrDef,
  sethtmlDef,
  setstyleDef,
  settextDef,
  screenshotDef,
  snapshotDef,
  submitDef,
  textDef,
  trackDef,
  treeDef,
  uncheckDef,
  valueDef,
  waitDef,
  hmrDef,
} from '../shared/defs.js'
import {actCard} from './cards/act-card.js'
import {consoleCard} from './cards/console-card.js'
import {editLiveCard} from './cards/edit-live-card.js'
import {effectCard} from './cards/effect-card.js'
import {reactCard} from './cards/react-card.js'
import {readBulkCard} from './cards/read-bulk-card.js'
import {readValueCard} from './cards/read-value-card.js'
import {screenshot} from './screenshot.js'
import {watchHotUpdates} from './hmr.js'
import {actionable, fill, focusedElement, hover, isDisabled, isHtml, press, select, setChecked} from './page-act.js'
import {
  acceptQueue,
  arriveAt,
  finishQueue,
  landQueued,
  pointAt,
  queueStopped,
  simulateClick,
  startTask,
  touchTask,
  type Beat,
} from './simulator.js'

function fail(message: string): never {
  throw pageFailure('handler-error', message)
}

function badArgs(message: string): never {
  throw pageFailure('invalid-args', message)
}

function serialize(value: unknown): unknown {
  if (value instanceof Element) return describeElement(value)
  return dehydrate(value)
}

function waitFor(selector: string, state: 'visible' | 'hidden', timeout: number): Promise<PageResult> {
  const deadline = Date.now() + timeout
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const el = document.querySelector(selector)
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

function touching<Input>(
  body: (input: Input, ctx: ClientToolCtx) => unknown,
): (input: Input, ctx: ClientToolCtx) => unknown {
  return (input, ctx) => {
    touchTask()
    return body(input, ctx)
  }
}

type Queued = NonNullable<ClientToolCtx['queued']>

function acting<Input extends ClientToolLocator>(
  body: (input: Input, ctx: ClientToolCtx) => unknown,
  beat: Beat = 'click',
): (input: Input, ctx: ClientToolCtx) => unknown {
  return async (input, ctx) => {
    const queued = ctx.queued
    if (queued === undefined) {
      startTask(ctx.agentId)
      touchTask()
      return body(input, ctx)
    }
    try {
      return await playQueued({input, ctx, queued, beat, body})
    } finally {
      if (queued.index === queued.of - 1) finishQueue(queued.id)
    }
  }
}

function stoppedBefore(queued: Queued): void {
  if (queueStopped(queued.id)) throw toolError(PAGE_QUEUE_STOPPED, {message: PAGE_QUEUE_STOPPED_MESSAGE})
}

function paceTarget(input: ClientToolLocator, ctx: ClientToolCtx): Element | null {
  const element = hasLocator(input) ? ctx.resolve(input) : focusedElement()
  if (element === null || element === ctx.document.body) return null
  return typeof actionable(element) === 'string' ? null : element
}

async function playQueued<Input extends ClientToolLocator>(options: {
  input: Input
  ctx: ClientToolCtx
  queued: Queued
  beat: Beat
  body: (input: Input, ctx: ClientToolCtx) => unknown
}): Promise<unknown> {
  const {input, ctx, queued, beat, body} = options
  stoppedBefore(queued)
  startTask(ctx.agentId)
  touchTask()
  const element = paceTarget(input, ctx)
  if (element !== null) await arriveAt({element, agent: ctx.agentId, beat})
  stoppedBefore(queued)
  return landQueued({beat, act: async () => body(input, ctx)})
}

function actionableTarget(ctx: ClientToolCtx, input: ClientToolLocator): Element {
  const element = actionable(ctx.target(input))
  if (typeof element === 'string') badArgs(element)
  return element
}

function outcomeOf<Result extends Record<string, unknown>>(result: Result | string): PageResult {
  if (typeof result === 'string') badArgs(result)
  return ok(result)
}

async function setCheckedOn(input: ClientToolLocator, ctx: ClientToolCtx, checked: boolean): Promise<PageResult> {
  const element = ctx.target(input)
  if (isDisabled(element)) badArgs('That element is disabled.')
  return outcomeOf(await setChecked({element, checked, agent: ctx.agentId}))
}

const INSERT_POS: Record<string, InsertPosition> = {
  before: 'beforebegin',
  after: 'afterend',
  prepend: 'afterbegin',
  append: 'beforeend',
}

function rootOf(ctx: ClientToolCtx, selector: string | undefined): Element | null {
  return selector ? ctx.document.querySelector(selector) : ctx.document.body
}

function hasLocator(input: ClientToolLocator): boolean {
  return input.ref !== undefined || input.selector !== undefined || input.name !== undefined
}

const routeTool = routeDef
  .client(
    touching(() => ({
      pathname: location.pathname,
      search: location.search,
      href: location.href,
      title: document.title,
      state: document.visibilityState === 'visible' ? 'visible' : 'hidden',
    })),
  )
  .render(readValueCard)

const consoleTool = consoleDef
  .client(touching((input, ctx) => ({entries: ctx.consoleEntries(input.since)})))
  .render(consoleCard)

const domTool = domDef
  .client(
    touching((input, ctx) => {
      const root = hasLocator(input) ? ctx.target(input) : ctx.document.body
      return {html: root.outerHTML.slice(0, DOM_CAP)}
    }),
  )
  .render(readBulkCard)

const queryTool = queryDef
  .client(
    touching((input, ctx) => {
      const matches = input.selector ? Array.from(ctx.document.querySelectorAll(input.selector)) : []
      return {count: matches.length, elements: matches.slice(0, 20).map(describeElement)}
    }),
  )
  .render(readBulkCard)

const existsTool = existsDef
  .client(
    touching((input, ctx) => {
      const matches = input.selector ? ctx.document.querySelectorAll(input.selector) : []
      return {exists: matches.length > 0, count: matches.length}
    }),
  )
  .render(readValueCard)

const snapshotTool = snapshotDef
  .client(
    touching((input, ctx) => {
      const root = rootOf(ctx, input.selector)
      if (!root) return {nodes: []}
      ctx.resetRefs()
      return {nodes: buildSnapshot(root, ctx.addRef)}
    }),
  )
  .render(readBulkCard)

const screenshotTool = screenshotDef.client(touching(screenshot)).render(readValueCard)

const waitForHotUpdate = watchHotUpdates(import.meta.hot)

const hmrTool = hmrDef.client(touching((input) => waitForHotUpdate(input.timeout))).render(readValueCard)

const locateTool = locateDef
  .client(
    touching(async (input, ctx) => {
      const result = await reactBridge.locate(ctx.target(input), ctx.addRef)
      return result ?? fail('no React fiber: element may be outside a React tree or not hydrated yet')
    }),
  )
  .render(reactCard)

const inspectTool = inspectDef
  .client(
    touching(async (input, ctx) => {
      const result = await reactBridge.inspect(ctx.target(input))
      if (!result) fail('no React fiber for element')
      const root = {props: result.props, state: result.state, hooks: result.hooks}
      if (input.path) {
        const hit = navigatePath(root, input.path)
        if (!hit.found) badArgs(`path not found: ${input.path}`)
        return {component: result.component, path: input.path, value: dehydrate(hit.value)}
      }
      return {
        component: result.component,
        props: dehydrate(result.props),
        state: dehydrate(result.state),
        hooks: dehydrate(result.hooks),
        rect: result.rect,
      }
    }),
  )
  .render(reactCard)

const overrideTool = overrideDef
  .client(
    touching(async (input, ctx) => {
      const el = ctx.target(input)
      let value: unknown
      try {
        value = input.json === undefined ? undefined : JSON.parse(input.json)
      } catch {
        badArgs(`--json is not valid JSON: ${input.json}`)
      }
      const path = input.path ? input.path.split('.') : []
      const result = await reactBridge.override(el, input.target, path, value, input.hookId)
      if ('error' in result) fail(result.error)
      return ok({target: input.target, path: input.path ?? '', ...(value === undefined ? {} : {value})})
    }),
  )
  .render(reactCard)

const treeTool = treeDef
  .client(
    touching(async (input, ctx) => {
      const root = rootOf(ctx, input.selector)
      return root ? await reactBridge.tree(root, ctx.addRef) : badArgs('no root element')
    }),
  )
  .render(reactCard)

const findTool = findDef.client(touching((input, ctx) => reactBridge.find(input.name, ctx.addRef))).render(reactCard)

const trackTool = trackDef
  .client(
    touching((input) => {
      const action = input.action ?? 'report'
      if (action === 'start') {
        startTracking()
        return ok({tracking: true})
      }
      if (action === 'stop') return stopTracking()
      return trackReport({name: input.name})
    }),
  )
  .render(reactCard)

function listEffects(effects: readonly ClientEffect[], requestedEffect: string | undefined) {
  if (requestedEffect !== undefined) badArgs('action list does not take an effect name; it reports every effect')
  return {
    effects: effects.map((effect) => ({name: effect.name, description: effect.description, enabled: effect.enabled()})),
  }
}

function requireEffect(effects: readonly ClientEffect[], name: string | undefined, action: string): ClientEffect {
  if (name === undefined) badArgs(`action ${action} needs an effect name; action list shows what exists`)
  const effect = effects.find((candidate) => candidate.name === name)
  if (effect) return effect
  const registered = effects.map((candidate) => candidate.name).join(', ')
  throw toolError('UNKNOWN_EFFECT', {
    message: `no effect named "${name}"; registered: ${registered === '' ? 'none' : registered}`,
  })
}

function driveEffect(effect: ClientEffect, action: string): void {
  if (action === 'report') return
  effect.set(action === 'toggle' ? !effect.enabled() : action === 'enable' || action === 'start')
}

const effectTool = effectDef
  .client(
    touching((input, ctx) => {
      const action = input.action ?? 'list'
      if (action === 'list') return listEffects(ctx.effects, input.effect)
      const effect = requireEffect(ctx.effects, input.effect, action)
      driveEffect(effect, action)
      return {effect: effect.name, enabled: effect.enabled()}
    }),
  )
  .render(effectCard)

const waitTool = waitDef
  .client(
    touching((input) =>
      input.selector
        ? waitFor(input.selector, input.state ?? 'visible', input.timeout ?? 5000)
        : badArgs('wait requires a selector'),
    ),
  )
  .render(actCard)

function afterResultFlush(action: () => void): void {
  setTimeout(action, 0)
}

const reloadTool = reloadDef
  .client(
    touching((_input, ctx) => {
      afterResultFlush(() => ctx.document.location.reload())
      return ok({initiated: true})
    }),
  )
  .render(actCard)

const textTool = textDef
  .client(touching((input, ctx) => ({text: (ctx.target(input).textContent ?? '').slice(0, DOM_CAP)})))
  .render(readValueCard)

const valueTool = valueDef
  .client(
    touching((input, ctx) => {
      const el = ctx.target(input)
      if (!isField(el)) return {value: null}
      return {value: isSensitiveField(el) ? MASKED_VALUE : el.value}
    }),
  )
  .render(readValueCard)

const attrTool = attrDef
  .client(touching((input, ctx) => ({value: ctx.target(input).getAttribute(input.attribute)})))
  .render(readValueCard)

const clickTool = clickDef
  .client(
    acting((input, ctx) => {
      simulateClick({element: actionableTarget(ctx, input), agent: ctx.agentId})
      return ok()
    }),
  )
  .render(actCard)

const hoverTool = hoverDef
  .client(
    acting((input, ctx) => {
      const element = actionableTarget(ctx, input)
      pointAt({element, agent: ctx.agentId})
      hover(element)
      return ok()
    }, 'point'),
  )
  .render(actCard)

const scrollTool = scrollDef
  .client(
    acting((input, ctx) => {
      pointAt({element: ctx.target(input), agent: ctx.agentId})
      return ok()
    }, 'point'),
  )
  .render(actCard)

const submitTool = submitDef
  .client(
    touching((input, ctx) => {
      const el = ctx.target(input)
      const form = el instanceof HTMLFormElement ? el : el.closest('form')
      if (!form) badArgs('no form to submit')
      form.requestSubmit()
      return ok()
    }),
  )
  .render(actCard)

const fillTool = fillDef
  .client(
    acting(async (input, ctx) => {
      const element = actionableTarget(ctx, input)
      return outcomeOf(await fill({element, value: input.value, agent: ctx.agentId}))
    }, 'input'),
  )
  .render(actCard)

const selectTool = selectDef
  .client(
    acting(async (input, ctx) => {
      const element = ctx.target(input)
      if (isDisabled(element)) badArgs('That element is disabled.')
      pointAt({element, agent: ctx.agentId})
      return outcomeOf(await select({element, value: input.value}))
    }),
  )
  .render(actCard)

const checkTool = checkDef.client(acting((input, ctx) => setCheckedOn(input, ctx, true))).render(actCard)

const uncheckTool = uncheckDef.client(acting((input, ctx) => setCheckedOn(input, ctx, false))).render(actCard)

const pressTool = pressDef
  .client(
    acting((input, ctx) => {
      if (!hasLocator(input)) {
        press({element: focusedElement(), key: input.key})
        return ok()
      }
      const element = actionableTarget(ctx, input)
      pointAt({element, agent: ctx.agentId})
      if (isHtml(element)) element.focus({preventScroll: true})
      press({element, key: input.key})
      return ok()
    }, 'input'),
  )
  .render(actCard)

const queueTool = queueDef
  .client((input, ctx) => {
    const queued = ctx.queued
    if (queued === undefined) badArgs('page_queue plays through the engine queue only')
    acceptQueue(queued.id)
    startTask(ctx.agentId)
    touchTask()
    ctx.signal?.addEventListener('abort', () => finishQueue(queued.id), {once: true})
    if (ctx.signal?.aborted === true) finishQueue(queued.id)
    return {queueId: queued.id, actions: input.actions.length}
  })
  .render(actCard)

const setattrTool = setattrDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).setAttribute(input.attribute, input.value)
      return ok()
    }),
  )
  .render(editLiveCard)

const removeattrTool = removeattrDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).removeAttribute(input.attribute)
      return ok()
    }),
  )
  .render(editLiveCard)

const addclassTool = addclassDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).classList.add(input.class)
      return ok()
    }),
  )
  .render(editLiveCard)

const removeclassTool = removeclassDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).classList.remove(input.class)
      return ok()
    }),
  )
  .render(editLiveCard)

const setstyleTool = setstyleDef
  .client(
    touching((input, ctx) => {
      const el = ctx.target(input)
      if (!(el instanceof HTMLElement)) badArgs('setstyle target is not an HTMLElement')
      el.style.setProperty(input.prop, input.value)
      return ok()
    }),
  )
  .render(editLiveCard)

const settextTool = settextDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).textContent = input.text
      return ok()
    }),
  )
  .render(editLiveCard)

const sethtmlTool = sethtmlDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).innerHTML = input.html
      return ok()
    }),
  )
  .render(editLiveCard)

const removeTool = removeDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).remove()
      return ok()
    }),
  )
  .render(editLiveCard)

const insertTool = insertDef
  .client(
    touching((input, ctx) => {
      ctx.target(input).insertAdjacentHTML(INSERT_POS[input.position ?? 'append'] ?? 'beforeend', input.html)
      return ok()
    }),
  )
  .render(editLiveCard)

const cssTool = cssDef
  .client(
    touching((input, ctx) => {
      const style = ctx.document.createElement('style')
      style.setAttribute('data-vibe-css', '')
      style.textContent = input.text
      ctx.document.head.appendChild(style)
      return ok()
    }),
  )
  .render(editLiveCard)

function evaluate(code: string): unknown {
  try {
    return new Function(`return (async () => (${code}\n))()`)()
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return new Function(`return (async () => { ${code}\n})()`)()
  }
}

const evalTool = evalDef
  .client(
    touching(async (input) => {
      const result: unknown = await evaluate(input.code)
      return {result: serialize(result)}
    }),
  )
  .render(editLiveCard)

export const PAGE_CLIENT_TOOLS: readonly AnyToolBuilder[] = [
  routeTool,
  domTool,
  queryTool,
  consoleTool,
  textTool,
  valueTool,
  attrTool,
  existsTool,
  snapshotTool,
  screenshotTool,
  hmrTool,
  locateTool,
  treeTool,
  inspectTool,
  overrideTool,
  findTool,
  trackTool,
  effectTool,
  waitTool,
  reloadTool,
  clickTool,
  fillTool,
  selectTool,
  checkTool,
  uncheckTool,
  pressTool,
  hoverTool,
  scrollTool,
  submitTool,
  queueTool,
  setattrTool,
  removeattrTool,
  addclassTool,
  removeclassTool,
  setstyleTool,
  settextTool,
  sethtmlTool,
  removeTool,
  insertTool,
  cssTool,
  evalTool,
]
