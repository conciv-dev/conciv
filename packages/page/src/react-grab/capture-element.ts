import type {DomPreview} from '@conciv/grab'

export function captureElement(el: Element): Promise<DomPreview> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(captureSync(el)))
  })
}

function captureSync(el: Element): DomPreview {
  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  const rules: string[] = []
  inlineComputedStyles(el, clone, rules)
  neutralizeLayout(clone)

  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
  const node = document.createElement('div')
  if (rules.length > 0) {
    const style = document.createElement('style')
    style.textContent = rules.join('')
    node.appendChild(style)
  }
  node.appendChild(clone)
  return {kind: 'dom', node, width: rect.width, height: rect.height}
}

const SKIP_PROPS = new Set(['cursor', 'pointer-events', 'user-select', '-webkit-user-select'])

function inlineComputedStyles(src: Element, dst: HTMLElement, rules: string[]): void {
  const cs = getComputedStyle(src)
  let cssText = ''
  for (const prop of cs) {
    if (SKIP_PROPS.has(prop) || prop.startsWith('--')) continue
    cssText += `${prop}:${cs.getPropertyValue(prop)};`
  }
  dst.style.cssText = cssText
  capturePseudo(src, dst, rules)
  const sk = src.children
  const dk = dst.children
  for (let i = 0; i < sk.length; i++) {
    const childSrc = sk[i]
    const childDst = dk[i]
    if (childSrc && childDst) inlineComputedStyles(childSrc, childDst as HTMLElement, rules)
  }
}

let pseudoSeq = 0
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

function neutralizeLayout(root: HTMLElement): void {
  root.style.position = 'static'
  root.style.margin = '0'
  root.style.top = 'auto'
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = 'auto'
  root.style.transform = 'none'
}
