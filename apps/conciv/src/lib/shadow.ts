import styles from '../styles.css?inline'
import wixMadeforNormal from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-normal.woff2?inline'
import wixMadeforItalic from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-italic.woff2?inline'
import robotoMono from '@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2?inline'

const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

const FONT_FACES = [
  {family: 'Wix Madefor Text', style: 'normal', weight: '400 800', src: wixMadeforNormal},
  {family: 'Wix Madefor Text', style: 'italic', weight: '400 800', src: wixMadeforItalic},
  {family: 'Roboto Mono', style: 'normal', weight: '100 700', src: robotoMono},
]

export function registerFonts(doc: Document = document): void {
  if (doc.querySelector('style[data-conciv-fonts]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-conciv-fonts', '')
  style.textContent = FONT_FACES.map(
    (face) =>
      `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};src:url(${face.src}) format('woff2-variations');unicode-range:${LATIN_RANGE}}`,
  ).join('\n')
  doc.head.appendChild(style)
}

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
  registerFonts()
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
