import {CONCIV_UI_SELECTOR} from '@conciv/protocol/page-types'

export type Refs = {map: Map<string, WeakRef<Element>>; n: number}
export type RefAdder = (el: Element) => string
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
    ...(el.id === '' ? {} : {id: el.id}),
    ...(typeof el.className === 'string' ? {className: el.className} : {}),
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

export function readRole(el: Element): string {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  if (el instanceof HTMLInputElement) return INPUT_ROLES[el.type] ?? 'textbox'
  const tag = el.tagName.toLowerCase()
  return Object.hasOwn(ROLE_BY_TAG, tag) ? (ROLE_BY_TAG[tag] ?? tag) : tag
}

function labelName(el: Element): string | undefined {
  const label = el instanceof HTMLInputElement ? el.labels?.[0] : undefined
  return label === undefined ? undefined : (label.textContent ?? '').trim()
}

export function readAccessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const fromLabel = labelName(el)
  if (fromLabel !== undefined) return fromLabel
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 80)
}

const isCheckedInput = (el: Element): boolean =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.checked

export const readCheckedState = (el: Element): boolean | undefined =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? el.checked : undefined

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
  return Object.hasOwn(ROLE_BY_TAG, tag)
}

export const MASKED_VALUE = '***'

const SENSITIVE_AUTOCOMPLETE = ['cc-', 'one-time-code', 'current-password', 'new-password']

export function isSensitiveField(el: Element): boolean {
  const type = el.getAttribute('type')?.toLowerCase() ?? ''
  if (type === 'password') return true
  const autocomplete = el.getAttribute('autocomplete')?.toLowerCase() ?? ''
  return SENSITIVE_AUTOCOMPLETE.some((token) => autocomplete.includes(token))
}

export function readValue(el: Element): string | undefined {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement))
    return undefined
  return isSensitiveField(el) ? MASKED_VALUE : el.value
}

function snapNode(el: Element, addRef: RefAdder): SnapNode {
  const state = nodeState(el)
  const name = readAccessibleName(el)
  const value = readValue(el)
  return {
    ref: addRef(el),
    role: readRole(el),
    ...(name === '' ? {} : {name}),
    ...(value === undefined ? {} : {value}),
    ...(state.length > 0 ? {state} : {}),
  }
}

export function buildSnapshot(root: Element, addRef: RefAdder): SnapNode[] {
  const out: SnapNode[] = []
  const walk = (el: Element): void => {
    if (isInteresting(el)) out.push(snapNode(el, addRef))
    for (const child of [...Array.from(pageShadowRoot(el)?.children ?? []), ...Array.from(el.children)]) walk(child)
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

export function selectDeep(selector: string): Element[] {
  return [document, ...openShadowRoots(document)].flatMap((root) => Array.from(root.querySelectorAll(selector)))
}

export function pageShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot === null) return null
  return isOurs(element) ? null : element.shadowRoot
}

export function isOurs(element: Element): boolean {
  if (element.closest(CONCIV_UI_SELECTOR) !== null) return true
  const root = element.getRootNode()
  return root instanceof ShadowRoot && isOurs(root.host)
}

function openShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  return Array.from(root.querySelectorAll('*')).flatMap((element) => {
    const shadow = pageShadowRoot(element)
    return shadow === null ? [] : [shadow, ...openShadowRoots(shadow)]
  })
}
