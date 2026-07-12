import {ok, err, type PageQuery, type PageQueryKind, type PageResult} from '@conciv/protocol/page-types'
import {buildSnapshot, describeElement, DOM_CAP, type Refs} from './page-snapshot.js'
import {dehydrate, navigatePath} from './dehydrate.js'
import * as react from './react-bridge.js'
import {startTracking, stopTracking, report as trackReport} from './render-tracker.js'

export type ConsoleEntry = {level: string; ts: number; text: string}

export type PageContext = {
  query: PageQuery
  el: Element | null
  refs: Refs
  consoleBuf: ConsoleEntry[]
}
export type PageHandler = (ctx: PageContext) => PageResult | Promise<PageResult>

const CONSOLE_CAP = 200

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const FORWARD_MARKER = /\[vite\] \(client\)|\[Server\]/
export function startConsoleBuffer(): ConsoleEntry[] {
  const buf: ConsoleEntry[] = []
  const push = (level: string, args: unknown[]): string => {
    const text = args.map((a) => String(a)).join(' ')
    buf.push({level, ts: Date.now(), text})
    if (buf.length > CONSOLE_CAP) buf.shift()
    return text
  }
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      const text = push(level, args)
      if (!FORWARD_MARKER.test(text)) original(...args)
    }
  }
  window.addEventListener('error', (e) => push('error', [e.message]))
  window.addEventListener('unhandledrejection', (e) => push('error', [String(e.reason)]))
  return buf
}

export function resolveTarget(query: PageQuery, refs: Refs): Element | null {
  if (query.ref) return refs.map.get(query.ref)?.deref() ?? null
  if (query.selector) return document.querySelector(query.selector)

  if (query.name) return react.elementByName(query.name)
  return null
}

function serialize(value: unknown): unknown {
  if (value instanceof Element) return describeElement(value)
  return dehydrate(value)
}

function waitFor(selector: string, state: 'visible' | 'hidden', timeout: number): Promise<PageResult> {
  const deadline = Date.now() + timeout
  return new Promise((resolve) => {
    const tick = (): void => {
      const el = document.querySelector(selector)
      const visible = el instanceof HTMLElement && el.offsetParent !== null
      if (state === 'visible' ? visible : !visible) return resolve(ok({state}))
      if (Date.now() > deadline) return resolve(err(`wait timed out for ${selector} (${state})`))
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
  else (el as unknown as Record<string, unknown>)[prop] = value
}
function isField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}

function onEl(fn: (el: Element, query: PageQuery) => PageResult): PageHandler {
  return ({el, query}) => (el ? fn(el, query) : err('no target element'))
}
const INSERT_POS: Record<string, InsertPosition> = {
  before: 'beforebegin',
  after: 'afterend',
  prepend: 'afterbegin',
  append: 'beforeend',
}

export const ELEMENT_KINDS = new Set<PageQueryKind>([
  'text',
  'value',
  'attr',
  'locate',
  'inspect',
  'override',
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
  'setattr',
  'removeattr',
  'addclass',
  'removeclass',
  'setstyle',
  'settext',
  'sethtml',
  'remove',
  'insert',
])

export const DOM_HANDLERS: Record<PageQueryKind, PageHandler> = {
  route: () => ({
    pathname: location.pathname,
    search: location.search,
    href: location.href,
  }),
  console: ({query, consoleBuf}) => ({
    entries: consoleBuf.filter((e) => e.ts >= (query.since ?? 0)),
  }),
  dom: ({query}) => {
    const t = query.selector ? document.querySelector(query.selector) : document.body
    return {html: (t?.outerHTML ?? '').slice(0, DOM_CAP)}
  },
  query: ({query}) => {
    const m = query.selector ? Array.from(document.querySelectorAll(query.selector)) : []
    return {count: m.length, elements: m.slice(0, 20).map(describeElement)}
  },
  exists: ({query}) => {
    const m = query.selector ? document.querySelectorAll(query.selector) : []
    return {exists: m.length > 0, count: m.length}
  },
  snapshot: ({query, refs}) => {
    const root = query.selector ? document.querySelector(query.selector) : document.body
    return {nodes: root ? buildSnapshot(root, refs) : []}
  },

  locate: async ({el, refs}: PageContext) => {
    const result = el ? await react.locate(el, refs) : null
    return result ?? err('no React fiber — element may be outside a React tree or not hydrated yet')
  },
  inspect: async ({el, query}: PageContext) => {
    const result = el ? await react.inspect(el) : null
    if (!result) return err('no React fiber for element')
    const root = {props: result.props, state: result.state, hooks: result.hooks}

    if (query.path) {
      const hit = navigatePath(root, query.path)
      if (!hit.found) return err(`path not found: ${query.path}`)
      return {component: result.component, path: query.path, value: dehydrate(hit.value)}
    }
    return {
      component: result.component,
      props: dehydrate(result.props),
      state: dehydrate(result.state),
      hooks: dehydrate(result.hooks),
      rect: result.rect,
    }
  },
  override: async ({el, query}: PageContext) => {
    if (!el) return err('no target element')
    if (!query.target) return err('override requires --target (props|state|hooks|context)')
    let value: unknown
    try {
      value = query.json === undefined ? undefined : JSON.parse(query.json)
    } catch {
      return err(`--json is not valid JSON: ${query.json}`)
    }
    const path = query.path ? query.path.split('.') : []
    const result = await react.override(el, query.target, path, value, query.hookId)
    if ('error' in result) return err(result.error)
    return ok({target: query.target, path: query.path ?? '', value})
  },
  tree: async ({query, refs}: PageContext) => {
    const root = query.selector ? document.querySelector(query.selector) : document.body
    return root ? await react.tree(root, refs) : err('no root element')
  },
  find: ({query, refs}: PageContext) =>
    query.name ? react.find(query.name, refs) : err('find requires a component name (--name)'),

  track: ({query}: PageContext) => {
    const action = query.action ?? 'report'
    if (action === 'start') {
      startTracking()
      return ok({tracking: true})
    }
    if (action === 'stop') return stopTracking()
    return trackReport({name: query.name})
  },

  effect: () => err('effects not initialized'),
  wait: ({query}) =>
    query.selector
      ? waitFor(query.selector, query.state ?? 'visible', query.timeout ?? 5000)
      : err('wait requires a selector'),

  text: onEl((el) => ({text: (el.textContent ?? '').slice(0, DOM_CAP)})),
  value: onEl((el) => ({value: isField(el) ? el.value : null})),
  attr: onEl((el, query) => ({value: el.getAttribute(query.name ?? '')})),

  click: onEl((el) => {
    if (!(el instanceof HTMLElement)) return err('click target is not an HTMLElement')
    el.click()
    return ok()
  }),
  hover: onEl((el) => {
    el.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))
    el.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
    return ok()
  }),
  scroll: onEl((el) => {
    el.scrollIntoView({block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth'})
    return ok()
  }),
  submit: onEl((el) => {
    const form = el instanceof HTMLFormElement ? el : el.closest('form')
    if (!form) return err('no form to submit')
    form.requestSubmit()
    return ok()
  }),
  fill: onEl((el, query) => {
    if (!isField(el)) return err('fill target is not an input/textarea/select')
    setNative(el, 'value', query.value ?? '')
    fireInput(el)
    return ok({value: el.value})
  }),
  select: onEl((el, query) => {
    if (!(el instanceof HTMLSelectElement)) return err('select target is not a <select>')
    setNative(el, 'value', query.value ?? '')
    fireInput(el)
    return ok({value: el.value})
  }),
  check: onEl((el) => {
    if (!(el instanceof HTMLInputElement)) return err('check target is not an input')
    setNative(el, 'checked', true)
    fireInput(el)
    return ok({checked: true})
  }),
  uncheck: onEl((el) => {
    if (!(el instanceof HTMLInputElement)) return err('uncheck target is not an input')
    setNative(el, 'checked', false)
    fireInput(el)
    return ok({checked: false})
  }),
  press: onEl((el, query) => {
    const key = query.key ?? ''
    el.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}))
    el.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true}))
    return ok()
  }),

  setattr: onEl((el, query) => {
    if (!query.name) return err('setattr needs name (and value)')
    el.setAttribute(query.name, query.value ?? '')
    return ok()
  }),
  removeattr: onEl((el, query) => {
    if (!query.name) return err('removeattr needs name')
    el.removeAttribute(query.name)
    return ok()
  }),
  addclass: onEl((el, query) => {
    if (!query.class) return err('addclass needs class')
    el.classList.add(query.class)
    return ok()
  }),
  removeclass: onEl((el, query) => {
    if (!query.class) return err('removeclass needs class')
    el.classList.remove(query.class)
    return ok()
  }),
  setstyle: onEl((el, query) => {
    if (!(el instanceof HTMLElement)) return err('setstyle target is not an HTMLElement')
    if (!query.prop || query.value === undefined) return err('setstyle needs prop and value')
    el.style.setProperty(query.prop, query.value)
    return ok()
  }),
  settext: onEl((el, query) => {
    if (query.text === undefined) return err('settext needs text')
    el.textContent = query.text
    return ok()
  }),
  sethtml: onEl((el, query) => {
    if (query.html === undefined) return err('sethtml needs html')
    el.innerHTML = query.html
    return ok()
  }),
  remove: onEl((el) => {
    el.remove()
    return ok()
  }),
  insert: onEl((el, query) => {
    if (!query.html) return err('insert needs html')
    el.insertAdjacentHTML(INSERT_POS[query.position ?? 'append'] ?? 'beforeend', query.html)
    return ok()
  }),

  css: ({query}) => {
    if (!query.text) return err('css needs text (a stylesheet string)')
    const style = document.createElement('style')
    style.setAttribute('data-vibe-css', '')
    style.textContent = query.text
    document.head.appendChild(style)
    return ok()
  },
  eval: async ({query}) => {
    const fn = new Function(`return (async () => { ${query.code ?? ''} })()`)
    const result: unknown = await fn()
    return {result: serialize(result)}
  },
}
