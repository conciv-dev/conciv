import xtermCss from '@xterm/xterm/css/xterm.css?inline'

export function injectXtermCss(root: Node): void {
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-conciv-xterm]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-xterm', '')
  style.textContent = xtermCss
  target.appendChild(style)
}
