import type {ElementSnapshot} from './grab-types.js'

// Turn a live element into a detached, fully-styled clone that renders identically anywhere (incl.
// inside our shadow DOM, where the host page's stylesheets don't reach). cloneNode alone keeps only
// classes/attrs — meaningless across the style boundary — so we inline getComputedStyle of every
// node and replay ::before/::after as scoped rules. The work runs inside ONE rAF: it leaves the
// click/pointer task immediately and reads at a settled layout boundary (no extra forced recalc).
// The caller MUST await this while the pick is still open (react-grab keeps the element live until
// the transformCopyContent promise resolves), or the element could mutate/unmount mid-frame.
export function captureElement(el: Element): Promise<ElementSnapshot> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(captureSync(el)))
  })
}

function captureSync(el: Element): ElementSnapshot {
  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  const rules: string[] = []
  try {
    inlineComputedStyles(el, clone, rules, null)
  } finally {
    teardownSandbox()
  }
  neutralizeLayout(clone)
  // The snapshot is inert: strip ids so the preview never duplicates the live element's id in the
  // page (id-based styles are already inlined above, so appearance is unaffected).
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
  // A wrapper bundles the scoped pseudo-element rules with the styled clone into one mountable node.
  const node = document.createElement('div')
  if (rules.length > 0) {
    const style = document.createElement('style')
    style.textContent = rules.join('')
    node.appendChild(style)
  }
  node.appendChild(clone)
  return {node, width: rect.width, height: rect.height}
}

// Computed properties that describe interaction, not appearance — meaningless in an inert visual
// snapshot and actively harmful (e.g. a copied `cursor: progress` shows a fake loading cursor on
// hover). The preview's pointer-events are owned by the stage instead.
const SKIP_PROPS = new Set(['cursor', 'pointer-events', 'user-select', '-webkit-user-select'])

// The CSS properties that inherit. Handled differently from the rest: a child only needs to write
// one when it OVERRIDES what it'd inherit from its parent; the root must pin them all (its real
// ancestors are gone once it lives in our chip, so inheritance can't be relied on).
const INHERITED_PROPS = new Set([
  'color',
  'direction',
  'font-family',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'quotes',
  'tab-size',
  'text-align',
  'text-align-last',
  'text-indent',
  'text-shadow',
  'text-transform',
  'visibility',
  'white-space',
  'word-break',
  'word-spacing',
  'overflow-wrap',
  'hyphens',
  'caret-color',
  'text-rendering',
  '-webkit-font-smoothing',
])

// Per-tag UA-default computed styles, measured once from a throwaway element in an offscreen sandbox
// (computed style is only meaningful while connected) and cached. Diffing against these is what lets
// each node inline ONLY the few properties that differ from a bare element of its tag, not all ~350.
// The sandbox lives in its OWN shadow root, NOT plain document.body: a host page reset (Tailwind's
// preflight sets `* { box-sizing: border-box }` and zeroes heading margins) would otherwise cascade
// into the reference element, so the "default" we diff against would be the host's reset, not the UA
// default. We'd then skip those very properties — and the clone, mounted in the widget's own shadow
// DOM (which has its own `*` reset + bare-tag markdown rules), would silently pick the wrong values
// (e.g. a leaked `h3 { margin-top }` pushing content out of the box and clipping it). Non-inherited
// properties don't cross the shadow boundary, so measuring here yields genuine UA defaults.
const defaultsCache = new Map<string, Record<string, string>>()
let sandbox: HTMLElement | null = null
let sandboxRoot: ShadowRoot | null = null

function defaultStyleFor(tag: string): Record<string, string> {
  const cached = defaultsCache.get(tag)
  if (cached) return cached
  const map: Record<string, string> = {}
  try {
    if (!sandboxRoot) {
      sandbox = document.createElement('div')
      sandbox.style.cssText =
        'position:absolute!important;left:-9999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden'
      document.body.appendChild(sandbox)
      sandboxRoot = sandbox.attachShadow({mode: 'open'})
    }
    const ref = document.createElement(tag)
    sandboxRoot.appendChild(ref)
    const cs = getComputedStyle(ref)
    for (const prop of cs) map[prop] = cs.getPropertyValue(prop)
    ref.remove()
  } catch {
    // Unknown/namespaced tag — an empty default map means "copy everything", a safe fallback.
  }
  defaultsCache.set(tag, map)
  return map
}

function teardownSandbox(): void {
  sandbox?.remove()
  sandbox = null
  sandboxRoot = null
}

// Walk original + clone in lockstep, inlining onto each clone node only the computed properties that
// matter: non-inherited ones that differ from the tag's UA default, and inherited ones the node
// actually overrides (the root pins all of them). Reads hit the live original (clean layout); writes
// land on the DETACHED clone, so they never reflow. `parentCs` is null only for the root.
let pseudoSeq = 0
function inlineComputedStyles(
  src: Element,
  dst: HTMLElement,
  rules: string[],
  parentCs: CSSStyleDeclaration | null,
): void {
  const cs = getComputedStyle(src)
  const def = defaultStyleFor(src.localName)
  const isRoot = parentCs === null
  let cssText = ''
  for (const prop of cs) {
    if (SKIP_PROPS.has(prop)) continue
    const val = cs.getPropertyValue(prop)
    if (INHERITED_PROPS.has(prop)) {
      // A descendant inherits matching values for free; only an override is worth writing.
      if (!isRoot && val === parentCs.getPropertyValue(prop)) continue
    } else if (val === def[prop]) {
      continue
    }
    cssText += `${prop}:${val};`
  }
  dst.style.cssText = cssText
  capturePseudo(src, dst, rules)
  const sk = src.children
  const dk = dst.children
  for (let i = 0; i < sk.length; i++) {
    const childSrc = sk[i]
    const childDst = dk[i]
    if (childSrc && childDst) inlineComputedStyles(childSrc, childDst as HTMLElement, rules, cs)
  }
}

// ::before / ::after carry content (icons, check glyphs) that cloneNode drops entirely. Re-create
// each as a uniquely-classed scoped rule so the glyph survives in the snapshot.
function capturePseudo(src: Element, dst: HTMLElement, rules: string[]): void {
  for (const pseudo of ['::before', '::after']) {
    const pcs = getComputedStyle(src, pseudo)
    const content = pcs.content
    if (!content || content === 'none' || content === 'normal') continue
    const cls = `pw-grab-pseudo-${pseudoSeq++}`
    dst.classList.add(cls)
    let t = ''
    for (const prop of pcs) t += `${prop}:${pcs.getPropertyValue(prop)};`
    rules.push(`.${cls}${pseudo}{${t}}`)
  }
}

// The captured computed style includes whatever positioning/margins the element had in its real
// layout (absolute, fixed, big margins). Inside the small preview stage that would fling it off or
// reserve dead space, so the ROOT clone is reset to normal in-flow rendering.
function neutralizeLayout(root: HTMLElement): void {
  root.style.position = 'static'
  root.style.margin = '0'
  root.style.top = 'auto'
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = 'auto'
  root.style.transform = 'none'
}
