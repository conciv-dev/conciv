// All widget styles are bundled into the JS and injected into an open Shadow DOM, so the
// widget is fully isolated from the host page (and vice-versa) and needs no external
// stylesheet. `?inline` (vite) imports the compiled CSS as a string.
import styles from './styles.css?inline'

export function createShadowRoot(): {host: HTMLElement; root: ShadowRoot} {
  const host = document.createElement('div')
  host.setAttribute('data-aidx-root', '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '2147483000'
  document.body.appendChild(host)
  const root = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = styles
  root.appendChild(style)
  return {host, root}
}
