import {CHAT_FONTS, type ChatFontFace} from '@conciv/ui-kit-chat/theme/fonts'
import {widgetSheet, widgetStyles} from './widget-styles.js'

const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

export function registerFonts(fonts: ChatFontFace[], doc: Document = document): void {
  if (doc.querySelector('style[data-conciv-fonts]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-conciv-fonts', '')
  style.textContent = fonts
    .map(
      (face) =>
        `@font-face{font-family:'${face.family}';font-style:${face.style ?? 'normal'};font-weight:${face.weight};src:url(${face.src}) format('woff2');unicode-range:${LATIN_RANGE}}`,
    )
    .join('\n')
  doc.head.appendChild(style)
}

export function registerWind4Properties(doc: Document = document): void {
  if (doc.querySelector('style[data-conciv-properties]')) return
  const props = widgetStyles.match(PROPERTY_RULE)
  if (!props) return
  const style = doc.createElement('style')
  style.setAttribute('data-conciv-properties', '')
  style.textContent = props.join('')
  doc.head.appendChild(style)
}

export function styleRoot(root: ShadowRoot | Document): void {
  registerFonts(CHAT_FONTS)
  if (!(root instanceof ShadowRoot)) return
  registerWind4Properties()
  root.adoptedStyleSheets = [widgetSheet()]
}
