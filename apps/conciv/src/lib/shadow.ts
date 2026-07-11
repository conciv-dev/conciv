import styles from '../styles.css?inline'

const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

export function registerWind4Properties(doc: Document = document): void {
  if (doc.querySelector('style[data-conciv-properties]')) return
  const props = styles.match(PROPERTY_RULE)
  if (!props) return
  const style = doc.createElement('style')
  style.setAttribute('data-conciv-properties', '')
  style.textContent = props.join('')
  doc.head.appendChild(style)
}

export function createShadowRoot(): {host: HTMLElement; root: ShadowRoot} {
  registerWind4Properties()
  const host = document.createElement('div')
  host.setAttribute('data-conciv-root', '')
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
