// The element ref registry + accessibility snapshot. Refs map snapshot node → live element
// via WeakRef (no DOM mutation, no leak). Stale after re-render → re-snapshot.
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

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'checkbox'
    if (el.type === 'radio') return 'radio'
    if (el.type === 'button' || el.type === 'submit') return 'button'
    return 'textbox'
  }
  return ROLE_BY_TAG[tag] ?? tag
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()
  if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
    return el.labels[0]?.textContent?.trim() ?? ''
  }
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 80)
}

function nodeState(el: Element): string[] {
  const state: string[] = []
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.checked)
    state.push('checked')
  if ('disabled' in el && el.disabled) state.push('disabled')
  if (el instanceof HTMLElement && el.offsetParent === null && getComputedStyle(el).position !== 'fixed')
    state.push('hidden')
  return state
}

function isInteresting(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (['a', 'button', 'input', 'select', 'textarea', 'label', 'summary'].includes(tag)) return true
  if (el.getAttribute('role')) return true
  return tag in ROLE_BY_TAG
}

// Walk a subtree, assigning a fresh ref to each interesting element. Resets the registry
// so refs always belong to the latest snapshot.
export function buildSnapshot(root: Element, refs: Refs): SnapNode[] {
  refs.map.clear()
  refs.n = 0
  const out: SnapNode[] = []
  const walk = (el: Element): void => {
    if (isInteresting(el)) {
      refs.n += 1
      const ref = `v${refs.n}`
      refs.map.set(ref, new WeakRef(el))
      const value =
        el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
          ? el.value
          : undefined
      const state = nodeState(el)
      out.push({
        ref,
        role: roleOf(el),
        name: accessibleName(el) || undefined,
        value,
        state: state.length > 0 ? state : undefined,
      })
    }
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(root)
  return out
}

export {DOM_CAP}
