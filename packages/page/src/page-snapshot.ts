export type Refs = {map: Map<string, WeakRef<Element>>; n: number}
export type SnapNode = {
  ref: string
  role: string
  name?: string
  value?: string
  state?: string[]
}

const DOM_CAP = 20_000

const CURATED_STYLE = ['display', 'color', 'backgroundColor', 'fontSize', 'padding', 'margin']

export function describeElement(el: Element): Record<string, unknown> {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || undefined,
    className: typeof el.className === 'string' ? el.className : undefined,
    rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
    computedStyle: Object.fromEntries(CURATED_STYLE.map((k) => [k, style.getPropertyValue(k)])),
  }
}

const ROLE_BY_TAG: Record<string, string> = {
  a: 'link',
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
}

const INPUT_ROLES: Record<string, string> = {checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button'}

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  if (el instanceof HTMLInputElement) return INPUT_ROLES[el.type] ?? 'textbox'
  const tag = el.tagName.toLowerCase()
  return ROLE_BY_TAG[tag] ?? tag
}

function labelName(el: Element): string | undefined {
  const label = el instanceof HTMLInputElement ? el.labels?.[0] : undefined
  return label === undefined ? undefined : (label.textContent ?? '').trim()
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const fromLabel = labelName(el)
  if (fromLabel !== undefined) return fromLabel
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 80)
}

const isCheckedInput = (el: Element): boolean =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.checked

const isDisabled = (el: Element): boolean => 'disabled' in el && Boolean(el.disabled)

const isHidden = (el: Element): boolean =>
  el instanceof HTMLElement && el.offsetParent === null && getComputedStyle(el).position !== 'fixed'

function nodeState(el: Element): string[] {
  const state: string[] = []
  if (isCheckedInput(el)) state.push('checked')
  if (isDisabled(el)) state.push('disabled')
  if (isHidden(el)) state.push('hidden')
  return state
}

function isInteresting(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (['a', 'button', 'input', 'select', 'textarea', 'label', 'summary'].includes(tag)) return true
  if (el.getAttribute('role')) return true
  return tag in ROLE_BY_TAG
}

const elementValue = (el: Element): string | undefined =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
    ? el.value
    : undefined

function snapNode(el: Element, refs: Refs): SnapNode {
  const state = nodeState(el)
  return {
    ref: addRef(el, refs),
    role: roleOf(el),
    name: accessibleName(el) || undefined,
    value: elementValue(el),
    state: state.length > 0 ? state : undefined,
  }
}

export function buildSnapshot(root: Element, refs: Refs): SnapNode[] {
  refs.map.clear()
  refs.n = 0
  const out: SnapNode[] = []
  const walk = (el: Element): void => {
    if (isInteresting(el)) out.push(snapNode(el, refs))
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
  return out
}

export function addRef(el: Element, refs: Refs): string {
  refs.n += 1
  const ref = `v${refs.n}`
  refs.map.set(ref, new WeakRef(el))
  return ref
}

export {DOM_CAP}
