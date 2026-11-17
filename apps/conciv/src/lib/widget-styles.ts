import base from '../styles.css?inline'
import utilities from 'virtual:uno.css?inline'

export const widgetStyles = `${base}${utilities}`

const sheets = new WeakMap<Document, CSSStyleSheet>()

export function createStyleSheet(text: string, doc: Document = document): CSSStyleSheet {
  const view = doc.defaultView

  if (!view) throw new Error('The document has no window to build a stylesheet in')
  const sheet = new view.CSSStyleSheet()

  sheet.replaceSync(text)

  return sheet
}

export function widgetSheet(doc: Document = document): CSSStyleSheet {
  const existing = sheets.get(doc)

  if (existing) return existing
  const sheet = createStyleSheet(widgetStyles, doc)

  sheets.set(doc, sheet)

  return sheet
}
