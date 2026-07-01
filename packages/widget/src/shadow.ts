// All widget styles are bundled into the JS and injected into an open Shadow DOM, so the
// widget is fully isolated from the host page (and vice-versa) and needs no external
// stylesheet. `?inline` (vite) imports the compiled CSS as a string.
// styles.css already carries the UnoCSS utilities (expanded from `@unocss all;` by @unocss/postcss),
// so the imported string is the complete shadow-root stylesheet.
import styles from './styles.css?inline'

// wind4 registers its internal vars (--un-translate-*, --un-*-opacity, …) with @property and reads their
// initial-values to default utilities. @property only registers from the document — Chrome silently ignores
// @property inside a shadow-root <style> — so hoist those rules to <head> once; registered globally they
// apply inside the shadow root too (they carry no visual styling, just var syntax + initial-value).
const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

// Register them in `doc` (the host document, or a popped-out PiP window's document) once.
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
