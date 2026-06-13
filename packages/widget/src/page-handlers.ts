import {ok, err, type PageQuery, type PageQueryKind, type PageResult} from '@devgent/protocol/page-protocol'
import {buildSnapshot, describeElement, DOM_CAP, type Refs} from './page-snapshot.js'

export type ConsoleEntry = {level: string; ts: number; text: string}

// Each handler receives the query, the resolved element (null for targetless verbs), and
// the shared registry/console buffer. Pure dispatch — one small function per verb, swappable.
export type PageContext = {
  query: PageQuery
  el: Element | null
  refs: Refs
  consoleBuf: ConsoleEntry[]
}
export type PageHandler = (ctx: PageContext) => PageResult | Promise<PageResult>

const CONSOLE_CAP = 200

export function startConsoleBuffer(): ConsoleEntry[] {
  const buf: ConsoleEntry[] = []
  const push = (level: string, args: unknown[]): void => {
    buf.push({
      level,
      ts: Date.now(),
      text: args.map((a) => String(a)).join(' '),
    })
    if (buf.length > CONSOLE_CAP) buf.shift()
  }
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      push(level, args)
      original(...args)
    }
  }
  window.addEventListener('error', (e) => push('error', [e.message]))
  window.addEventListener('unhandledrejection', (e) => push('error', [String((e as PromiseRejectionEvent).reason)]))
  return buf
}

export function resolveTarget(query: PageQuery, refs: Refs): Element | null {
  if (query.ref) return refs.map.get(query.ref)?.deref() ?? null
  if (query.selector) return document.querySelector(query.selector)
  return null
}

// JSON-safe a value for the reply (eval results, mostly). Nodes summarized; non-serializable
// stringified; capped like `dom`.
export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Element) return describeElement(value)
  const t = typeof value
  if (t === 'string') return (value as string).slice(0, DOM_CAP)
  if (t === 'number' || t === 'boolean') return value
  try {
    const json = JSON.stringify(value)
    return json.length > DOM_CAP ? json.slice(0, DOM_CAP) : JSON.parse(json)
  } catch {
    return String(value).slice(0, DOM_CAP)
  }
}

function waitFor(selector: string, state: 'visible' | 'hidden', timeout: number): Promise<PageResult> {
  const deadline = Date.now() + timeout
  return new Promise((resolve) => {
    const tick = (): void => {
      const el = document.querySelector(selector)
      const visible = !!el && (el as HTMLElement).offsetParent !== null
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
function isField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
}
const INSERT_POS: Record<string, InsertPosition> = {
  before: 'beforebegin',
  after: 'afterend',
  prepend: 'afterbegin',
  append: 'beforeend',
}

// Verbs that need a resolved element; the driver short-circuits with a target error if null.
export const ELEMENT_KINDS = new Set<PageQueryKind>([
  'text',
  'value',
  'attr',
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
  // reads (targetless)
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
  wait: ({query}) =>
    query.selector
      ? waitFor(query.selector, query.state ?? 'visible', query.timeout ?? 5000)
      : err('wait requires a selector'),
  // element reads
  text: ({el}) => ({text: (el!.textContent ?? '').slice(0, DOM_CAP)}),
  value: ({el}) => ({value: (el as HTMLInputElement).value ?? null}),
  attr: ({el, query}) => ({value: el!.getAttribute(query.name ?? '')}),
  // actions
  click: ({el}) => {
    ;(el as HTMLElement).click()
    return ok()
  },
  hover: ({el}) => {
    el!.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))
    el!.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
    return ok()
  },
  scroll: ({el}) => {
    el!.scrollIntoView({block: 'center'})
    return ok()
  },
  submit: ({el}) => {
    const form = el instanceof HTMLFormElement ? el : el!.closest('form')
    if (!form) return err('no form to submit')
    form.requestSubmit()
    return ok()
  },
  fill: ({el, query}) => {
    if (!isField(el!)) return err('fill target is not an input/textarea/select')
    el.value = query.value ?? ''
    fireInput(el)
    return ok({value: el.value})
  },
  select: ({el, query}) => {
    if (!(el instanceof HTMLSelectElement)) return err('select target is not a <select>')
    el.value = query.value ?? ''
    fireInput(el)
    return ok({value: el.value})
  },
  check: ({el}) => {
    if (!(el instanceof HTMLInputElement)) return err('check target is not an input')
    el.checked = true
    fireInput(el)
    return ok({checked: true})
  },
  uncheck: ({el}) => {
    if (!(el instanceof HTMLInputElement)) return err('uncheck target is not an input')
    el.checked = false
    fireInput(el)
    return ok({checked: false})
  },
  press: ({el, query}) => {
    const key = query.key ?? ''
    el!.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}))
    el!.dispatchEvent(new KeyboardEvent('keyup', {key, bubbles: true}))
    return ok()
  },
  // edits
  setattr: ({el, query}) => {
    el!.setAttribute(query.name ?? '', query.value ?? '')
    return ok()
  },
  removeattr: ({el, query}) => {
    el!.removeAttribute(query.name ?? '')
    return ok()
  },
  addclass: ({el, query}) => {
    el!.classList.add(query.class ?? '')
    return ok()
  },
  removeclass: ({el, query}) => {
    el!.classList.remove(query.class ?? '')
    return ok()
  },
  setstyle: ({el, query}) => {
    ;(el as HTMLElement).style.setProperty(query.prop ?? '', query.value ?? '')
    return ok()
  },
  settext: ({el, query}) => {
    el!.textContent = query.text ?? ''
    return ok()
  },
  sethtml: ({el, query}) => {
    el!.innerHTML = query.html ?? ''
    return ok()
  },
  remove: ({el}) => {
    el!.remove()
    return ok()
  },
  insert: ({el, query}) => {
    el!.insertAdjacentHTML(INSERT_POS[query.position ?? 'append'] ?? 'beforeend', query.html ?? '')
    return ok()
  },
  // targetless mutations
  css: ({query}) => {
    const style = document.createElement('style')
    style.setAttribute('data-vibe-css', '')
    style.textContent = query.text ?? ''
    document.head.appendChild(style)
    return ok()
  },
  eval: async ({query}) => {
    const fn = new Function(`return (async () => { ${query.code ?? ''} })()`) as () => Promise<unknown>
    return {result: serialize(await fn())}
  },
}
