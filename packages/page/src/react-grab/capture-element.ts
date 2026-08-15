import type {DomPreview} from '@conciv/grab'
import {correctFallbackMetrics, isStyledElement, type StyledElement, type TextRun} from './fallback-metrics.js'

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export async function captureElement(el: Element): Promise<DomPreview> {
  await nextFrame()
  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true)
  const rules: string[] = []
  const runs: TextRun[] = []
  if (!isStyledElement(clone)) return {kind: 'dom', html: '', width: rect.width, height: rect.height}
  inlineComputedStyles(el, clone, rules, runs)
  await correctFallbackMetrics(runs)
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
  return {kind: 'dom', html: node.outerHTML, width: rect.width, height: rect.height}
}

const SKIP_PROPS = new Set(['cursor', 'pointer-events', 'user-select', '-webkit-user-select'])

function isTextRun(node: Element): boolean {
  return node.children.length === 0 && (node.textContent ?? '').trim() !== ''
}

function computedCssText(cs: CSSStyleDeclaration): string {
  let cssText = ''
  for (const prop of cs) {
    if (SKIP_PROPS.has(prop) || prop.startsWith('--')) continue
    cssText += `${prop}:${cs.getPropertyValue(prop)};`
  }
  return cssText
}

function inlineComputedStyles(src: Element, dst: StyledElement, rules: string[], runs: TextRun[]): void {
  dst.style.cssText = computedCssText(getComputedStyle(src))
  capturePseudo(src, dst, rules)
  if (isStyledElement(src) && isTextRun(src)) runs.push({source: src, clone: dst})
  const sk = src.children
  const dk = dst.children
  for (let i = 0; i < sk.length; i++) {
    const childSrc = sk[i]
    const childDst = dk[i]
    if (childSrc && childDst && isStyledElement(childDst)) inlineComputedStyles(childSrc, childDst, rules, runs)
  }
}

let pseudoSeq = 0
function capturePseudo(src: Element, dst: StyledElement, rules: string[]): void {
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

function neutralizeLayout(root: StyledElement): void {
  root.style.position = 'static'
  root.style.margin = '0'
  root.style.top = 'auto'
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = 'auto'
  root.style.transform = 'none'
}
