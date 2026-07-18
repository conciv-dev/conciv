export type TextAreaMetrics = {rowHeight: number; padding: number; border: number; borderBox: boolean}

export type TextAreaFit = {height: number; overflowY: 'auto' | 'hidden'}

const CLONE_STYLE = [
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'box-sizing',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'scrollbar-gutter',
  'tab-size',
  'text-indent',
  'text-rendering',
  'text-transform',
  'width',
  'word-break',
  'word-spacing',
]

const HIDDEN_STYLE: [string, string][] = [
  ['min-height', '0'],
  ['max-height', 'none'],
  ['height', '0'],
  ['visibility', 'hidden'],
  ['overflow', 'hidden'],
  ['position', 'absolute'],
  ['z-index', '-1000'],
  ['top', '0'],
  ['right', '0'],
  ['display', 'block'],
]

let clone: HTMLTextAreaElement | undefined

function hiddenClone(styles: CSSStyleDeclaration): HTMLTextAreaElement {
  const node = clone ?? document.createElement('textarea')
  clone = node
  node.setAttribute('tabindex', '-1')
  node.setAttribute('aria-hidden', 'true')
  for (const name of CLONE_STYLE) node.style.setProperty(name, styles.getPropertyValue(name))
  for (const [name, value] of HIDDEN_STYLE) node.style.setProperty(name, value, 'important')
  if (!node.isConnected) document.body.appendChild(node)
  return node
}

function px(styles: CSSStyleDeclaration, name: string): number {
  return Number.parseFloat(styles.getPropertyValue(name)) || 0
}

export function measureTextArea(el: HTMLTextAreaElement): TextAreaMetrics {
  const styles = getComputedStyle(el)
  const padding = px(styles, 'padding-top') + px(styles, 'padding-bottom')
  const border = px(styles, 'border-top-width') + px(styles, 'border-bottom-width')
  const node = hiddenClone(styles)
  node.value = 'x'
  return {rowHeight: node.scrollHeight - padding, padding, border, borderBox: styles.boxSizing === 'border-box'}
}

export function fitHeight(
  scrollHeight: number,
  metrics: TextAreaMetrics,
  minRows: number,
  maxRows: number,
): TextAreaFit {
  const box = metrics.borderBox ? metrics.padding + metrics.border : 0
  const content = metrics.borderBox ? scrollHeight + metrics.border : scrollHeight - metrics.padding
  const min = metrics.rowHeight * minRows + box
  const max = metrics.rowHeight * maxRows + box
  return {height: Math.max(min, Math.min(content, max)), overflowY: content > max ? 'auto' : 'hidden'}
}

export function applyAutosize(el: HTMLTextAreaElement, minRows: number, maxRows: number): number {
  el.style.height = 'auto'
  const fit = fitHeight(el.scrollHeight, measureTextArea(el), minRows, maxRows)
  el.style.height = `${fit.height}px`
  el.style.overflowY = fit.overflowY
  return fit.height
}

export function observeAutosize(el: HTMLTextAreaElement, refit: () => void): () => void {
  let lastWidth = el.clientWidth
  let frame = 0
  const observer = new ResizeObserver(() => {
    if (el.clientWidth === lastWidth) return
    lastWidth = el.clientWidth
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(refit)
  })
  observer.observe(el)
  document.fonts.addEventListener('loadingdone', refit)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    document.fonts.removeEventListener('loadingdone', refit)
  }
}
