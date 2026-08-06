import {pageFailure, ok, type PageResult} from '@conciv/protocol/page-types'
import type {ClientToolCtx, ClientToolLocator} from '@conciv/extension'
import {
  buildSnapshot,
  dehydrate,
  describeElement,
  DOM_CAP,
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
  snapshotDef,
  submitDef,
  textDef,
  trackDef,
  treeDef,
  uncheckDef,
  valueDef,
  waitDef,
} from '../shared/defs.js'

function fail(message: string): never {
  throw pageFailure('handler-error', message)
}

function badArgs(message: string): never {
  throw pageFailure('invalid-args', message)
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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

function fireInput(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  el.dispatchEvent(new Event('input', {bubbles: true}))
  el.dispatchEvent(new Event('change', {bubbles: true}))
}

function setNative(el: Element, prop: 'value' | 'checked', value: string | boolean): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), prop)?.set
  if (setter) setter.call(el, value)
  else Reflect.set(el, prop, value)
}

function isField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

function toggleChecked(el: Element, desired: boolean, verb: 'check' | 'uncheck'): PageResult {
  if (!(el instanceof HTMLInputElement)) badArgs(`${verb} target is not an input`)
  if (el.checked === desired) return ok({checked: desired})
  if (el.type === 'radio' && !desired) badArgs('cannot uncheck a radio; check another radio in the same group instead')
  el.click()
  return ok({checked: el.checked})
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

const routeTool = routeDef.client(() => ({
  pathname: location.pathname,
  search: location.search,
  href: location.href,
}))

const consoleTool = consoleDef.client((input, ctx) => ({entries: ctx.consoleEntries(input.since)}))

const domTool = domDef.client((input, ctx) => {
  const root = hasLocator(input) ? ctx.resolve(input) : ctx.document.body
  return {html: (root?.outerHTML ?? '').slice(0, DOM_CAP)}
})

const queryTool = queryDef.client((input, ctx) => {
  const matches = input.selector ? Array.from(ctx.document.querySelectorAll(input.selector)) : []
  return {count: matches.length, elements: matches.slice(0, 20).map(describeElement)}
})

const existsTool = existsDef.client((input, ctx) => {
  const matches = input.selector ? ctx.document.querySelectorAll(input.selector) : []
  return {exists: matches.length > 0, count: matches.length}
})

const snapshotTool = snapshotDef.client((input, ctx) => {
  const root = rootOf(ctx, input.selector)
  if (!root) return {nodes: []}
  ctx.resetRefs()
  return {nodes: buildSnapshot(root, ctx.addRef)}
})

const locateTool = locateDef.client(async (input, ctx) => {
  const result = await reactBridge.locate(ctx.target(input), ctx.addRef)
  return result ?? fail('no React fiber: element may be outside a React tree or not hydrated yet')
})

const inspectTool = inspectDef.client(async (input, ctx) => {
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
})

const overrideTool = overrideDef.client(async (input, ctx) => {
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
})

const treeTool = treeDef.client(async (input, ctx) => {
  const root = rootOf(ctx, input.selector)
  return root ? await reactBridge.tree(root, ctx.addRef) : badArgs('no root element')
})

const findTool = findDef.client((input, ctx) => reactBridge.find(input.name, ctx.addRef))

const trackTool = trackDef.client((input) => {
  const action = input.action ?? 'report'
  if (action === 'start') {
    startTracking()
    return ok({tracking: true})
  }
  if (action === 'stop') return stopTracking()
  return trackReport({name: input.name})
})

const effectTool = effectDef.client(() => fail('effects not initialized'))

const waitTool = waitDef.client((input) =>
  input.selector
    ? waitFor(input.selector, input.state ?? 'visible', input.timeout ?? 5000)
    : badArgs('wait requires a selector'),
)

const textTool = textDef.client((input, ctx) => ({text: (ctx.target(input).textContent ?? '').slice(0, DOM_CAP)}))

const valueTool = valueDef.client((input, ctx) => {
  const el = ctx.target(input)
  return {value: isField(el) ? el.value : null}
})

const attrTool = attrDef.client((input, ctx) => ({value: ctx.target(input).getAttribute(input.attribute)}))

const clickTool = clickDef.client((input, ctx) => {
  const el = ctx.target(input)
  if (!(el instanceof HTMLElement)) badArgs('click target is not an HTMLElement')
  el.click()
  return ok()
})

const hoverTool = hoverDef.client((input, ctx) => {
  const el = ctx.target(input)
  el.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))
  el.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
  return ok()
})

const scrollTool = scrollDef.client((input, ctx) => {
  ctx.target(input).scrollIntoView({block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth'})
  return ok()
})

const submitTool = submitDef.client((input, ctx) => {
  const el = ctx.target(input)
  const form = el instanceof HTMLFormElement ? el : el.closest('form')
  if (!form) badArgs('no form to submit')
  form.requestSubmit()
  return ok()
})

const fillTool = fillDef.client((input, ctx) => {
  const el = ctx.target(input)
  if (!isField(el)) badArgs('fill target is not an input/textarea/select')
  setNative(el, 'value', input.value)
  fireInput(el)
  return ok({value: el.value})
})

const selectTool = selectDef.client((input, ctx) => {
  const el = ctx.target(input)
  if (!(el instanceof HTMLSelectElement)) badArgs('select target is not a <select>')
  setNative(el, 'value', input.value)
  fireInput(el)
  return ok({value: el.value})
})

const checkTool = checkDef.client((input, ctx) => toggleChecked(ctx.target(input), true, 'check'))

const uncheckTool = uncheckDef.client((input, ctx) => toggleChecked(ctx.target(input), false, 'uncheck'))

const pressTool = pressDef.client((input, ctx) => {
  const el = ctx.target(input)
  el.dispatchEvent(new KeyboardEvent('keydown', {key: input.key, bubbles: true}))
  el.dispatchEvent(new KeyboardEvent('keyup', {key: input.key, bubbles: true}))
  return ok()
})

const setattrTool = setattrDef.client((input, ctx) => {
  ctx.target(input).setAttribute(input.attribute, input.value)
  return ok()
})

const removeattrTool = removeattrDef.client((input, ctx) => {
  ctx.target(input).removeAttribute(input.attribute)
  return ok()
})

const addclassTool = addclassDef.client((input, ctx) => {
  ctx.target(input).classList.add(input.class)
  return ok()
})

const removeclassTool = removeclassDef.client((input, ctx) => {
  ctx.target(input).classList.remove(input.class)
  return ok()
})

const setstyleTool = setstyleDef.client((input, ctx) => {
  const el = ctx.target(input)
  if (!(el instanceof HTMLElement)) badArgs('setstyle target is not an HTMLElement')
  el.style.setProperty(input.prop, input.value)
  return ok()
})

const settextTool = settextDef.client((input, ctx) => {
  ctx.target(input).textContent = input.text
  return ok()
})

const sethtmlTool = sethtmlDef.client((input, ctx) => {
  ctx.target(input).innerHTML = input.html
  return ok()
})

const removeTool = removeDef.client((input, ctx) => {
  ctx.target(input).remove()
  return ok()
})

const insertTool = insertDef.client((input, ctx) => {
  ctx.target(input).insertAdjacentHTML(INSERT_POS[input.position ?? 'append'] ?? 'beforeend', input.html)
  return ok()
})

const cssTool = cssDef.client((input, ctx) => {
  const style = ctx.document.createElement('style')
  style.setAttribute('data-vibe-css', '')
  style.textContent = input.text
  ctx.document.head.appendChild(style)
  return ok()
})

const evalTool = evalDef.client(async (input) => {
  const fn = new Function(`return (async () => { ${input.code} })()`)
  const result: unknown = await fn()
  return {result: serialize(result)}
})

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
  locateTool,
  treeTool,
  inspectTool,
  overrideTool,
  findTool,
  trackTool,
  effectTool,
  waitTool,
  clickTool,
  fillTool,
  selectTool,
  checkTool,
  uncheckTool,
  pressTool,
  hoverTool,
  scrollTool,
  submitTool,
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
